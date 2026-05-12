import { logger } from "./logger";

/**
 * Minimal transactional-email client. Wraps the Resend HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email) using the global
 * `fetch` so we don't add an SDK dependency for one POST.
 *
 * Soft-fail philosophy: every caller of `sendEmail` already returns the same
 * one-time setup URL to the calling admin in the API response, and the
 * forgot-password endpoint is intentionally a fire-and-forget. So when
 * Resend is down, misconfigured, or the env vars are missing, we log a
 * structured warning and return `false` instead of throwing — the user-visible
 * flow is never blocked by an outbound mail failure.
 *
 * Reads at call time (NOT module load) so changes to the env via the secrets
 * UI take effect on the next request without a restart.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend's message id, if the send succeeded. */
  id?: string;
  /** Short reason code for logs/tests. */
  reason?:
    | "missing_api_key"
    | "missing_from"
    | "invalid_to"
    | "http_error"
    | "transport_error"
    | "ok";
}

const EMAIL_API = "https://api.resend.com/emails";

function isProbablyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) {
    logger.warn(
      { to_domain: input.to.split("@")[1] ?? "unknown", subject: input.subject },
      "sendEmail: RESEND_API_KEY not set — skipping send",
    );
    return { ok: false, reason: "missing_api_key" };
  }
  if (!from) {
    logger.warn(
      { to_domain: input.to.split("@")[1] ?? "unknown", subject: input.subject },
      "sendEmail: EMAIL_FROM not set — skipping send",
    );
    return { ok: false, reason: "missing_from" };
  }
  if (!isProbablyEmail(input.to)) {
    logger.warn(
      { to_domain: input.to.split("@")[1] ?? "unknown" },
      "sendEmail: refusing to send to malformed address",
    );
    return { ok: false, reason: "invalid_to" };
  }

  try {
    const res = await fetch(EMAIL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
      // 10s upper bound — Resend usually responds in <1s; we don't want to
      // hold an admin's request open if they're slow.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Don't log the raw response body — it can echo recipient addresses.
      logger.warn(
        {
          status: res.status,
          to_domain: input.to.split("@")[1] ?? "unknown",
          subject: input.subject,
        },
        "sendEmail: Resend API returned non-2xx",
      );
      return { ok: false, reason: "http_error" };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id, reason: "ok" };
  } catch (err) {
    logger.warn(
      {
        errName: (err as Error).name,
        to_domain: input.to.split("@")[1] ?? "unknown",
        subject: input.subject,
      },
      "sendEmail: transport error talking to Resend",
    );
    return { ok: false, reason: "transport_error" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Setup-link templates
// ──────────────────────────────────────────────────────────────────────────

interface SetupEmailInput {
  to: string;
  name: string;
  setupUrl: string;
  expiresAt: Date;
}

function expiryText(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "soon";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours <= 1) return "in about 1 hour";
  return `in about ${hours} hours`;
}

export async function sendInviteEmail(input: SetupEmailInput): Promise<SendEmailResult> {
  const text = [
    `Hi ${input.name},`,
    "",
    "An administrator has created an account for you in the NC State University Advancement Constituent Touchpoint Planner.",
    "",
    "Open this single-use link to choose a password and sign in:",
    input.setupUrl,
    "",
    `This link expires ${expiryText(input.expiresAt)}. If it expires before you use it, contact your administrator for a new one.`,
    "",
    "If you weren't expecting this, you can ignore this message — the link is harmless without your password.",
  ].join("\n");
  return sendEmail({
    to: input.to,
    subject: "Set up your Touchpoint Planner account",
    text,
  });
}

export async function sendResetEmail(
  input: SetupEmailInput & { source: "admin" | "self_service" },
): Promise<SendEmailResult> {
  const lead =
    input.source === "self_service"
      ? "We received a request to reset the password on your NC State University Advancement Constituent Touchpoint Planner account."
      : "An administrator has issued a password reset on your NC State University Advancement Constituent Touchpoint Planner account.";
  const text = [
    `Hi ${input.name},`,
    "",
    lead,
    "",
    "Open this single-use link to choose a new password:",
    input.setupUrl,
    "",
    `This link expires ${expiryText(input.expiresAt)}.`,
    "",
    "If you didn't request this, you can ignore this message — the link is harmless without your password, and your existing password still works.",
  ].join("\n");
  return sendEmail({
    to: input.to,
    subject: "Reset your Touchpoint Planner password",
    text,
  });
}
