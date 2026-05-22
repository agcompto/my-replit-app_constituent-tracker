import { lt, sql } from "drizzle-orm";
import { db, samlAssertionReplayTable } from "@workspace/db";

/** Insert assertion ID; returns false if replay (already seen). */
export async function consumeAssertionId(
  assertionId: string,
  expiresAt: Date,
): Promise<{ ok: true } | { ok: false; reason: "replay_detected" } | { ok: false; reason: "replay_unavailable" }> {
  try {
    const inserted = await db
      .insert(samlAssertionReplayTable)
      .values({ assertionId, expiresAt })
      .onConflictDoNothing()
      .returning({ assertionId: samlAssertionReplayTable.assertionId });
    if (inserted.length === 0) {
      return { ok: false, reason: "replay_detected" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "replay_unavailable" };
  }
}

export async function purgeExpiredSamlAssertions(): Promise<number> {
  const rows = await db
    .delete(samlAssertionReplayTable)
    .where(lt(samlAssertionReplayTable.expiresAt, sql`now()`))
    .returning({ id: samlAssertionReplayTable.assertionId });
  return rows.length;
}
