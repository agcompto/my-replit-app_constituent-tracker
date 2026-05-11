import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  passwordSetupTokensTable,
} from "@workspace/db";
import {
  issueSetupToken,
  validateSetupToken,
  consumeSetupToken,
} from "../passwordSetupTokens";

const EMAIL_PREFIX = "test-pwst-";

async function freshUser(suffix: string) {
  const email = `${EMAIL_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const [u] = await db
    .insert(usersTable)
    .values({
      email,
      name: "Test User",
      passwordHash: "x",
      role: "standard",
      active: true,
    })
    .returning({ id: usersTable.id });
  return u!.id;
}

describe("passwordSetupTokens (DB)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for these tests");
    }
  });

  afterEach(async () => {
    // Best-effort cleanup of test users (cascades to tokens).
    await db
      .delete(usersTable)
      .where(eq(usersTable.email, "__never__"))
      .catch(() => {});
  });

  it("issues a token, validates it, and exposes the user", async () => {
    const userId = await freshUser("issue");
    try {
      const { rawToken, expiresAt } = await issueSetupToken({
        userId,
        kind: "invite",
      });
      expect(rawToken.length).toBeGreaterThan(40);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const v = await validateSetupToken(rawToken);
      expect(v).not.toBeNull();
      expect(v?.userId).toBe(userId);
      expect(v?.kind).toBe("invite");
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("invalidates prior unused tokens of the same kind when a new one is issued", async () => {
    const userId = await freshUser("invalidate");
    try {
      const first = await issueSetupToken({ userId, kind: "invite" });
      const second = await issueSetupToken({ userId, kind: "invite" });

      expect(await validateSetupToken(first.rawToken)).toBeNull();
      expect(await validateSetupToken(second.rawToken)).not.toBeNull();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("does not invalidate tokens of a different kind", async () => {
    const userId = await freshUser("kinds");
    try {
      const invite = await issueSetupToken({ userId, kind: "invite" });
      const reset = await issueSetupToken({ userId, kind: "reset" });
      expect(await validateSetupToken(invite.rawToken)).not.toBeNull();
      expect(await validateSetupToken(reset.rawToken)).not.toBeNull();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("rejects expired tokens", async () => {
    const userId = await freshUser("expired");
    try {
      const { rawToken } = await issueSetupToken({ userId, kind: "reset" });
      // Force expiry in the database.
      await db
        .update(passwordSetupTokensTable)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(passwordSetupTokensTable.userId, userId));
      expect(await validateSetupToken(rawToken)).toBeNull();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("consumes a token exactly once", async () => {
    const userId = await freshUser("consume");
    try {
      const { rawToken } = await issueSetupToken({ userId, kind: "invite" });
      const v = await validateSetupToken(rawToken);
      expect(v).not.toBeNull();
      const first = await consumeSetupToken(v!.tokenId);
      expect(first).toBe(true);
      const second = await consumeSetupToken(v!.tokenId);
      expect(second).toBe(false);
      // Already-used tokens no longer validate.
      expect(await validateSetupToken(rawToken)).toBeNull();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("rejects obviously malformed tokens without a DB lookup", async () => {
    expect(await validateSetupToken("")).toBeNull();
    expect(await validateSetupToken("short")).toBeNull();
  });

  it("does not validate tokens for inactive users", async () => {
    const userId = await freshUser("inactive");
    try {
      const { rawToken } = await issueSetupToken({ userId, kind: "invite" });
      await db
        .update(usersTable)
        .set({ active: false })
        .where(eq(usersTable.id, userId));
      expect(await validateSetupToken(rawToken)).toBeNull();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });
});
