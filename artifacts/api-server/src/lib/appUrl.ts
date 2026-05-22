/** Public origin used to build user-facing URLs (e.g. password setup links). */
export function publicAppUrl(): string | undefined {
  // Explicit override wins (useful when behind a custom domain or in tests).
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/\/$/, "")}`;
  }
  const domains = process.env.REPLIT_DOMAINS;
  if (!domains) return undefined;
  return `https://${domains.split(",")[0].trim()}`;
}

/**
 * Base URL for SAML SP endpoints shown in admin UI and Entra registration.
 * In local dev, falls back to the Vite origin when APP_PUBLIC_URL is unset.
 */
export function samlPublicBaseUrl(): string {
  const fromEnv = publicAppUrl();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") {
    const port = process.env.APP_PUBLIC_PORT ?? "5173";
    return `http://127.0.0.1:${port}`;
  }
  throw new Error(
    "SAML_SP_ENTITY_ID or APP_PUBLIC_URL/REPLIT_DOMAINS must be set for SAML",
  );
}

/** Build a `/setup-password/:token` URL pointing at the SPA. */
export function buildSetupPasswordUrl(rawToken: string): string {
  const base = publicAppUrl();
  if (!base) {
    // No origin known (e.g. unit test); return a relative path.
    return `/setup-password/${encodeURIComponent(rawToken)}`;
  }
  return `${base}/setup-password/${encodeURIComponent(rawToken)}`;
}
