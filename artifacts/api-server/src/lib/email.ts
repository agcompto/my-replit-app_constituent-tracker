import { Resend } from "resend";
import { logger } from "./logger";

let cached: Resend | null | undefined;

/** Returns a configured Resend client, or null when the API key isn't set. */
function getClient(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Resend(key);
  return cached;
}

export interface EmailResult {
  sent: boolean;
  /** Message ID returned by the provider, when available. */
  messageId?: string;
  /** Why the email could not be sent. Populated only when `sent === false`. */
  error?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SendCredentialsArgs {
  to: string;
  recipientName: string;
  tempPassword: string;
  /** "new account" emails read differently from "your password was reset" emails. */
  kind: "new_account" | "reset";
  /** Display name of the admin who triggered the action — shown in the email body. */
  triggeredBy?: string;
  /** Public origin to link the recipient to the sign-in page. */
  appUrl?: string;
}

/**
 * Send the recipient their temporary password. Returns `{ sent: false }` when
 * the email provider isn't configured so callers can fall back to surfacing the
 * password in the admin UI instead. Never throws — email failures must not
 * break the create-user / reset-password flow.
 */
export async function sendPasswordCredentials(
  args: SendCredentialsArgs,
): Promise<EmailResult> {
  const client = getClient();
  if (!client) {
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.EMAIL_FROM;
  if (!from) {
    return { sent: false, error: "EMAIL_FROM not configured" };
  }

  const subject =
    args.kind === "new_account"
      ? "Your Constituent Touchpoint Planner account"
      : "Your Constituent Touchpoint Planner password was reset";

  const intro =
    args.kind === "new_account"
      ? `An account has been created for you in the Constituent Touchpoint Planner${
          args.triggeredBy ? ` by ${escapeHtml(args.triggeredBy)}` : ""
        }.`
      : `Your Constituent Touchpoint Planner password was reset${
          args.triggeredBy ? ` by ${escapeHtml(args.triggeredBy)}` : ""
        }.`;

  const signinLine = args.appUrl
    ? `Sign in at <a href="${escapeHtml(args.appUrl)}">${escapeHtml(args.appUrl)}</a>.`
    : "Sign in to the application using your email address and the password below.";

  const safePass = escapeHtml(args.tempPassword);
  const safeName = escapeHtml(args.recipientName || "there");

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px;color:#cc0000">NC State Advancement</h2>
  <p>Hi ${safeName},</p>
  <p>${intro}</p>
  <p>${signinLine}</p>
  <p style="margin:24px 0">
    <strong>Email:</strong> ${escapeHtml(args.to)}<br>
    <strong>Temporary password:</strong>
    <code style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#f3f3f3;padding:4px 8px;border-radius:4px;font-size:15px;letter-spacing:.5px">${safePass}</code>
  </p>
  <p>For security, you'll be required to set a new password the first time you sign in. This temporary password should not be shared.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#666">If you weren't expecting this email, please contact your administrator immediately.</p>
</body></html>`;

  const text = [
    `Hi ${args.recipientName || "there"},`,
    "",
    args.kind === "new_account"
      ? `An account has been created for you in the Constituent Touchpoint Planner${args.triggeredBy ? ` by ${args.triggeredBy}` : ""}.`
      : `Your Constituent Touchpoint Planner password was reset${args.triggeredBy ? ` by ${args.triggeredBy}` : ""}.`,
    args.appUrl ? `Sign in at: ${args.appUrl}` : "",
    "",
    `Email: ${args.to}`,
    `Temporary password: ${args.tempPassword}`,
    "",
    "You will be required to set a new password on first sign-in. Do not share this password.",
    "",
    "If you weren't expecting this email, contact your administrator.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { data, error } = await client.emails.send({
      from,
      to: args.to,
      subject,
      html,
      text,
    });
    if (error) {
      // Intentionally do not log recipient address — staff emails are PII.
      logger.warn({ errName: error.name }, "Email send failed");
      return { sent: false, error: error.message ?? "Email send failed" };
    }
    return { sent: true, messageId: data?.id };
  } catch (err) {
    logger.warn({ errName: (err as Error).name }, "Email send threw");
    return { sent: false, error: (err as Error).message };
  }
}

/** True when both RESEND_API_KEY and EMAIL_FROM are set. */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}
