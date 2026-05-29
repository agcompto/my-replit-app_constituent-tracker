const REQUIRED_ALWAYS = ["DATABASE_URL", "SESSION_SECRET", "PORT"] as const;
const REQUIRED_IN_PRODUCTION = ["APP_PUBLIC_URL"] as const;

function missingEnv(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name] || process.env[name]?.trim() === "");
}

function validatePort(): void {
  const raw = process.env.PORT;
  const port = Number(raw);
  if (!raw || Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port. Received: ${raw ?? "<unset>"}`);
  }
}

function validateSessionSecret(): void {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }
  if (/change-me|replace|placeholder|secret/i.test(secret)) {
    throw new Error("SESSION_SECRET appears to be a placeholder. Generate a unique production secret.");
  }
}

function validateProductionOrigin(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = missingEnv(REQUIRED_IN_PRODUCTION);
  if (missing.length > 0 && !process.env.REPLIT_DOMAINS && !process.env.RAILWAY_PUBLIC_DOMAIN) {
    throw new Error(
      `Missing production environment variable(s): ${missing.join(", ")}. ` +
        "Set APP_PUBLIC_URL unless the platform provides REPLIT_DOMAINS or RAILWAY_PUBLIC_DOMAIN.",
    );
  }
}

export function validateEnv(): void {
  const missing = missingEnv(REQUIRED_ALWAYS);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  validatePort();
  validateSessionSecret();
  validateProductionOrigin();
}
