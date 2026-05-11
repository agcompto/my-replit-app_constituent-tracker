import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, passwordSetupTokensTable, usersTable } from "@workspace/db";

export type SetupTokenKind = "invite" | "reset";

const RAW_TOKEN_BYTES = 32; // 256 bits → ~43 base64url chars
const DEFAULT_TTL_HOURS = 24;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomTokenString(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

export interface IssuedToken {
  /** Raw token, only ever returned once — embed in the email link. */
  rawToken: string;
  /** When the token expires. */
  expiresAt: Date;
}

/**
 * Issue a new setup token for a user. Invalidates any other unused tokens of
 * the same kind so an attacker can't replay an older link if a newer one was
 * issued (e.g. admin clicked "Resend invite").
 */
export async function issueSetupToken(opts: {
  userId: number;
  kind: SetupTokenKind;
  createdByUserId?: number | null;
  ttlHours?: number;
}): Promise<IssuedToken> {
  const ttlHours = opts.ttlHours ?? DEFAULT_TTL_HOURS;
  const rawToken = randomTokenString();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const now = new Date();

  // Invalidate prior live tokens of the same kind for this user.
  await db
    .update(passwordSetupTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordSetupTokensTable.userId, opts.userId),
        eq(passwordSetupTokensTable.kind, opts.kind),
        isNull(passwordSetupTokensTable.usedAt),
      ),
    );

  await db.insert(passwordSetupTokensTable).values({
    userId: opts.userId,
    tokenHash,
    kind: opts.kind,
    expiresAt,
    createdByUserId: opts.createdByUserId ?? null,
  });

  return { rawToken, expiresAt };
}

export interface ValidatedToken {
  tokenId: number;
  userId: number;
  email: string;
  name: string;
  kind: SetupTokenKind;
  expiresAt: Date;
}

/**
 * Look up a raw token, verify it isn't used or expired, and return the
 * associated user. Returns `null` for any failure mode — callers must not
 * distinguish "expired" from "wrong" from "consumed" to avoid token oracle
 * attacks.
 */
export async function validateSetupToken(
  rawToken: string,
): Promise<ValidatedToken | null> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return null;
  }
  const tokenHash = sha256(rawToken);

  const [row] = await db
    .select({
      tokenId: passwordSetupTokensTable.id,
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      kind: passwordSetupTokensTable.kind,
      expiresAt: passwordSetupTokensTable.expiresAt,
      usedAt: passwordSetupTokensTable.usedAt,
      storedHash: passwordSetupTokensTable.tokenHash,
      active: usersTable.active,
    })
    .from(passwordSetupTokensTable)
    .innerJoin(usersTable, eq(usersTable.id, passwordSetupTokensTable.userId))
    .where(eq(passwordSetupTokensTable.tokenHash, tokenHash));

  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (!row.active) return null;

  // Constant-time defensive compare (already enforced by unique-hash lookup,
  // but keeps the surface uniform if storage is ever changed).
  const a = Buffer.from(row.storedHash, "hex");
  const b = Buffer.from(tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return {
    tokenId: row.tokenId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    kind: row.kind as SetupTokenKind,
    expiresAt: row.expiresAt,
  };
}

/** Mark a token consumed. Returns false if it was already consumed. */
export async function consumeSetupToken(tokenId: number): Promise<boolean> {
  const updated = await db
    .update(passwordSetupTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordSetupTokensTable.id, tokenId),
        isNull(passwordSetupTokensTable.usedAt),
      ),
    )
    .returning({ id: passwordSetupTokensTable.id });
  return updated.length === 1;
}

/** Best-effort cleanup of long-expired tokens. Call from periodic jobs. */
export async function purgeExpiredTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db
    .delete(passwordSetupTokensTable)
    .where(lt(passwordSetupTokensTable.expiresAt, cutoff));
}
