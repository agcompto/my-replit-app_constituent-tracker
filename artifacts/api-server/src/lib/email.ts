import { Resend } from "resend";
import { logger } from "./logger";

let cached: Resend | null | undefined;

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
  messageId?: string;
  error?: string;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SetupLinkArgs {
  to: string;
  recipientName: string;
  url: string;
  /** "invite" for new accounts, "reset" for forgotten passwords or admin reset. */
  kind: "invite" | "reset";
  triggeredBy?: string;
  /** Hours until the link expires; used for the "expires in X hours" line. */
  expiresInHours: number;
}

/**
 * Email a password-setup link to a user. Returns `{sent:false}` (never throws)
 * when delivery fails so callers can fall back to surfacing the URL in the
 * admin UI. The raw URL is the only sensitive value in the email; nothing is
 * logged that would reveal user identity beyond the `messageId`.
 */
export async function sendPasswordSetupLink(args: SetupLinkArgs): Promise<EmailResult> {
  const client = getClient();
  if (!client) return { sent: false, error: "RESEND_API_KEY not configured" };
  const from = process.env.EMAIL_FROM;
  if (!from) return { sent: false, error: "EMAIL_FROM not configured" };

  const subject =
    args.kind === "invite"
      ? "Set up your Constituent Touchpoint Planner account"
      : "Reset your Constituent Touchpoint Planner password";

  const intro =
    args.kind === "invite"
      ? `An account has been created for you in the Constituent Touchpoint Planner${
          args.triggeredBy ? ` by ${escapeHtml(args.triggeredBy)}` : ""
        }. Use the secure link below to choose your password and sign in.`
      : `A password reset was requested for your Constituent Touchpoint Planner account${
          args.triggeredBy ? ` by ${escapeHtml(args.triggeredBy)}` : ""
        }. Use the secure link below to choose a new password.`;

  const safeUrl = escapeHtml(args.url);
  const safeName = escapeHtml(args.recipientName || "there");
  const cta = args.kind === "invite" ? "Set up password" : "Reset password";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px;color:#cc0000">NC State Advancement</h2>
  <p>Hi ${safeName},</p>
  <p>${intro}</p>
  <p style="margin:24px 0">
    <a href="${safeUrl}" style="background:#cc0000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600">${cta}</a>
  </p>
  <p style="font-size:13px;color:#444">If the button doesn't work, copy and paste this URL into your browser:</p>
  <p style="font-size:12px;color:#444;word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>
  <p style="font-size:13px;color:#444">This link expires in ${args.expiresInHours} hours and can be used only once.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:12px;color:#666">If you weren't expecting this email, you can safely ignore it — your account will not be changed.</p>
</body></html>`;

  const text = [
    `Hi ${args.recipientName || "there"},`,
    "",
    args.kind === "invite"
      ? `An account has been created for you in the Constituent Touchpoint Planner${args.triggeredBy ? ` by ${args.triggeredBy}` : ""}.`
      : `A password reset was requested for your Constituent Touchpoint Planner account${args.triggeredBy ? ` by ${args.triggeredBy}` : ""}.`,
    "",
    `${cta}: ${args.url}`,
    "",
    `This link expires in ${args.expiresInHours} hours and can be used only once.`,
    "",
    "If you weren't expecting this email, you can safely ignore it.",
  ].join("\n");

  try {
    const { data, error } = await client.emails.send({
      from,
      to: args.to,
      subject,
      html,
      text,
    });
    if (error) {
      logger.warn({ errName: error.name }, "Setup-link email send failed");
      return { sent: false, error: error.message ?? "Email send failed" };
    }
    return { sent: true, messageId: data?.id };
  } catch (err) {
    logger.warn({ errName: (err as Error).name }, "Setup-link email send threw");
    return { sent: false, error: (err as Error).message };
  }
}
