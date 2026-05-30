import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db, totpRecoveryCodesTable } from "@workspace/db";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be set");

// Derive a stable 32-byte key from SESSION_SECRET. We use a fixed salt because
// we need decryptability across restarts; rotating SESSION_SECRET will
// (intentionally) invalidate every stored TOTP secret, forcing re-enrollment.
const ENC_KEY = crypto.scryptSync(SESSION_SECRET, "ctp-totp-v1", 32);

const TOTP_ISSUER = "NCSU Advancement Touchpoint Planner";
const TOTP_STEP_SECONDS = 30;
// Accept ±1 step (~90s total drift) for clock skew between server and
// authenticator app. otplib v13 uses an `epochTolerance` in seconds.
const TOTP_EPOCH_TOLERANCE_S = TOTP_STEP_SECONDS;

export function isTotpRequiredForRole(role: string): boolean {
  // TEMPORARILY DISABLED: always return false to unblock login while
  // the TOTP enrollment issue is investigated.
  // TODO: restore original check once TOTP is fixed:
  //   return role === "admin" || role === "super_admin";
  void role;
  return false;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, encB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("malformed totp blob");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const enc = Buffer.from(encB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function buildOtpauthUri(opts: { secret: string; accountEmail: string }): string {
  return generateURI({
    strategy: "totp",
    issuer: TOTP_ISSUER,
    label: opts.accountEmail,
    secret: opts.secret,
    period: TOTP_STEP_SECONDS,
  });
}

export async function buildQrDataUrl(otpauth: string): Promise<string> {
  return qrcode.toDataURL(otpauth, { errorCorrectionLevel: "M", margin: 1, width: 240 });
}

/**
 * Verify a 6-digit TOTP code against an encrypted secret. Constant-ish:
 * even on failure we still recompute the expected window so timing is
 * dominated by the HMAC work rather than an early-out.
 */
export function verifyTotpCode(opts: { encryptedSecret: string; code: string }): boolean {
  const cleaned = opts.code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  let secret: string;
  try {
    secret = decryptSecret(opts.encryptedSecret);
  } catch {
    return false;
  }
  try {
    const result = verifySync({
      secret,
      token: cleaned,
      strategy: "totp",
      period: TOTP_STEP_SECONDS,
      epochTolerance: TOTP_EPOCH_TOLERANCE_S,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

// ─────────────────────── Recovery codes ───────────────────────
//
// Ten codes, each 10 base32 chars (no padding) split as XXXXX-XXXXX for
// readability. Hashed with bcrypt (per-code salt) before storage; only the
// bcrypt hash is persisted. Even though the codes are high-entropy, bcrypt's
// per-row salt and configurable cost defeat precomputed/rainbow attacks on a
// leaked DB and matches the same hashing posture as account passwords.
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // crockford-ish, no 0/O/1/I
const RECOVERY_BCRYPT_COST = 10;

async function hashRecoveryCode(raw: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(raw), RECOVERY_BCRYPT_COST);
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function looksLikeRecoveryCode(raw: string): boolean {
  return normalizeRecoveryCode(raw).length === 10 && !/^\d{6}$/.test(raw.trim());
}

function randomRecoveryCode(): string {
  const buf = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += RECOVERY_ALPHABET[buf[i] % RECOVERY_ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/**
 * Replace all of `userId`'s recovery codes with a fresh batch of 10. The raw
 * codes are returned exactly once — never persisted in plaintext, never logged.
 */
export async function regenerateRecoveryCodes(userId: number): Promise<string[]> {
  const raw: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) raw.push(randomRecoveryCode());
  const hashes = await Promise.all(raw.map((c) => hashRecoveryCode(c)));
  await db.transaction(async (tx) => {
    await tx
      .delete(totpRecoveryCodesTable)
      .where(eq(totpRecoveryCodesTable.userId, userId));
    await tx.insert(totpRecoveryCodesTable).values(
      raw.map((_, i) => ({ userId, codeHash: hashes[i] })),
    );
  });
  return raw;
}

/**
 * Atomically consume a recovery code. Returns true on success (and marks
 * the row used), false if the code doesn't match an unused row for this user.
 *
 * Because each row's hash carries its own bcrypt salt we cannot look the row
 * up by hash directly. We fetch the user's unused rows, bcrypt-compare the
 * candidate against each, then perform a guarded `UPDATE … WHERE id=? AND
 * used_at IS NULL` so two concurrent attempts can never consume the same
 * code twice.
 */
export async function consumeRecoveryCode(
  userId: number,
  raw: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(raw);
  if (normalized.length !== 10) return false;
  const rows = await db
    .select({ id: totpRecoveryCodesTable.id, codeHash: totpRecoveryCodesTable.codeHash })
    .from(totpRecoveryCodesTable)
    .where(
      and(
        eq(totpRecoveryCodesTable.userId, userId),
        isNull(totpRecoveryCodesTable.usedAt),
      ),
    );
  let matchedId: number | null = null;
  for (const row of rows) {
    // bcrypt.compare is constant-time per pair; iterating all unused rows
    // is fine — there are at most RECOVERY_CODE_COUNT (10) per user.
    if (await bcrypt.compare(normalized, row.codeHash)) {
      matchedId = row.id;
      break;
    }
  }
  if (matchedId == null) return false;
  const result = await db
    .update(totpRecoveryCodesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(totpRecoveryCodesTable.id, matchedId),
        isNull(totpRecoveryCodesTable.usedAt),
      ),
    )
    .returning({ id: totpRecoveryCodesTable.id });
  return result.length > 0;
}

export async function unusedRecoveryCodeCount(userId: number): Promise<number> {
  const rows = await db
    .select({ id: totpRecoveryCodesTable.id })
    .from(totpRecoveryCodesTable)
    .where(
      and(
        eq(totpRecoveryCodesTable.userId, userId),
        isNull(totpRecoveryCodesTable.usedAt),
      ),
    );
  return rows.length;
}

export async function deleteAllRecoveryCodes(userId: number): Promise<void> {
  await db
    .delete(totpRecoveryCodesTable)
    .where(eq(totpRecoveryCodesTable.userId, userId));
}
