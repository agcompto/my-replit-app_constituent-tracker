import { createHash } from "node:crypto";
import { logger } from "./logger";

export interface PolicyResult {
  ok: boolean;
  /** Human-readable, single-sentence error suitable for surfacing to the user. */
  reason?: string;
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Server-side password policy. Run before hashing on any flow that accepts a
 * password from a human (change-password, password-setup-from-token).
 *
 * Rules:
 *  - 12–128 chars
 *  - at least one letter and one digit OR symbol (loose to avoid being annoying)
 *  - not a substring of the user's email/name (case-insensitive)
 *  - not on the breached-password list (HIBP k-anonymity API)
 *
 * The HIBP check is best-effort: if the network call fails we *allow* the
 * password rather than block legitimate users behind an outage. This is the
 * recommended trade-off in the HIBP guidance.
 */
export async function validatePasswordPolicy(opts: {
  password: string;
  email?: string;
  name?: string;
}): Promise<PolicyResult> {
  const pw = opts.password;
  if (typeof pw !== "string") return { ok: false, reason: "Password is required." };
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (pw.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, reason: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }

  const hasLetter = /[a-zA-Z]/.test(pw);
  // A "digit or symbol" means a non-letter, non-whitespace character — spaces
  // alone do not count toward the complexity requirement.
  const hasDigitOrSymbol = /[^a-zA-Z\s]/.test(pw);
  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      ok: false,
      reason: "Password must include at least one letter and one digit or symbol.",
    };
  }

  const lower = pw.toLowerCase();
  const emailLocal = (opts.email ?? "").toLowerCase().split("@")[0];
  if (emailLocal && emailLocal.length >= 4 && lower.includes(emailLocal)) {
    return { ok: false, reason: "Password may not contain your email address." };
  }
  const name = (opts.name ?? "").toLowerCase().trim();
  if (name) {
    for (const part of name.split(/\s+/)) {
      if (part.length >= 4 && lower.includes(part)) {
        return { ok: false, reason: "Password may not contain your name." };
      }
    }
  }

  const breachCount = await checkHibp(pw);
  if (breachCount === null) {
    // HIBP unreachable — fail open. Logged so ops can spot persistent issues.
    return { ok: true };
  }
  if (breachCount > 0) {
    return {
      ok: false,
      reason:
        "This password has appeared in a public data breach. Please choose a different password.",
    };
  }
  return { ok: true };
}

/**
 * HIBP k-anonymity password check. Sends only the first 5 hex chars of the
 * SHA-1 of the password and scans the response for the rest. The full
 * password is never sent over the network.
 *
 * Returns the breach count, or `null` if the request failed.
 */
export async function checkHibp(password: string): Promise<number | null> {
  // Allow disabling for offline tests / local dev.
  if (process.env.PASSWORD_HIBP_DISABLED === "1") return 0;
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split(/\r?\n/)) {
      const [hashSuffix, countStr] = line.split(":");
      if (hashSuffix?.trim().toUpperCase() === suffix) {
        return parseInt(countStr ?? "0", 10) || 0;
      }
    }
    return 0;
  } catch (err) {
    logger.warn({ errName: (err as Error).name }, "HIBP check failed; allowing password");
    return null;
  }
}
