/** Public origin used to build user-facing URLs (e.g. password setup links). */
export function publicAppUrl(): string | undefined {
  // Explicit override wins (useful when behind a custom domain or in tests).
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS;
  if (!domains) return undefined;
  return `https://${domains.split(",")[0].trim()}`;
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
