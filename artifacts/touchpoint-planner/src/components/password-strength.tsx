import { useMemo } from "react";

export interface PasswordStrengthInfo {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  meetsPolicy: boolean;
  hints: string[];
}

/**
 * Lightweight client-side strength heuristic. The server is the source of
 * truth (length, character classes, breach check), so this is purely for
 * fast user feedback — never use it to gate submission.
 */
export function evaluatePasswordStrength(opts: {
  password: string;
  email?: string;
  name?: string;
}): PasswordStrengthInfo {
  const pw = opts.password ?? "";
  const hints: string[] = [];
  if (pw.length < 12) hints.push("Use at least 12 characters.");
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  if (!hasLetter) hints.push("Add a letter.");
  if (!hasNumber && !hasSymbol) hints.push("Add a number or symbol.");
  const lower = pw.toLowerCase();
  const local = (opts.email ?? "").toLowerCase().split("@")[0];
  if (local && local.length >= 4 && lower.includes(local)) {
    hints.push("Don't include your email address.");
  }
  const name = (opts.name ?? "").toLowerCase().trim();
  if (name) {
    for (const part of name.split(/\s+/)) {
      if (part.length >= 4 && lower.includes(part)) {
        hints.push("Don't include your name.");
        break;
      }
    }
  }

  let raw = 0;
  if (pw.length >= 12) raw += 1;
  if (pw.length >= 16) raw += 1;
  if (hasLetter && (hasNumber || hasSymbol)) raw += 1;
  if (hasNumber && hasSymbol) raw += 1;
  // Cap at 4
  const score = Math.min(4, raw) as 0 | 1 | 2 | 3 | 4;

  const meetsPolicy =
    pw.length >= 12 &&
    pw.length <= 128 &&
    hasLetter &&
    (hasNumber || hasSymbol) &&
    !hints.some((h) => h.startsWith("Don't"));

  const label =
    !pw
      ? ""
      : score <= 1
        ? "Weak"
        : score === 2
          ? "Fair"
          : score === 3
            ? "Good"
            : "Strong";

  return { score, label, meetsPolicy, hints };
}

export function PasswordStrengthMeter({
  password,
  email,
  name,
}: {
  password: string;
  email?: string;
  name?: string;
}) {
  const info = useMemo(
    () => evaluatePasswordStrength({ password, email, name }),
    [password, email, name],
  );
  if (!password) return null;
  const segmentColor = (i: number) => {
    if (info.score === 0) return "bg-muted";
    if (i >= info.score) return "bg-muted";
    if (info.score <= 1) return "bg-destructive";
    if (info.score === 2) return "bg-amber-500";
    if (info.score === 3) return "bg-emerald-500";
    return "bg-emerald-600";
  };
  const labelColor =
    info.score <= 1
      ? "text-destructive"
      : info.score === 2
        ? "text-amber-600"
        : "text-emerald-700";
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={info.score} aria-label="Password strength">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded ${segmentColor(i)} transition-colors`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${labelColor}`}>{info.label}</span>
        {info.meetsPolicy ? (
          <span className="text-muted-foreground">Meets the basic policy.</span>
        ) : (
          <span className="text-muted-foreground">
            {info.hints[0] ?? "Make it longer or more varied."}
          </span>
        )}
      </div>
    </div>
  );
}
