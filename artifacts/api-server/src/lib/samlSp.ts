import { publicAppUrl } from "./appUrl";

export function samlSpEntityId(): string {
  if (process.env.SAML_SP_ENTITY_ID) {
    return process.env.SAML_SP_ENTITY_ID.replace(/\/$/, "");
  }
  const base = publicAppUrl();
  if (!base) {
    throw new Error("SAML_SP_ENTITY_ID or APP_PUBLIC_URL/REPLIT_DOMAINS must be set for SAML");
  }
  return `${base}/api/auth/saml/metadata`;
}

export function samlAcsUrl(): string {
  if (process.env.SAML_ACS_URL) {
    return process.env.SAML_ACS_URL.replace(/\/$/, "");
  }
  const base = publicAppUrl();
  if (!base) {
    throw new Error("SAML_ACS_URL or APP_PUBLIC_URL/REPLIT_DOMAINS must be set for SAML");
  }
  return `${base}/api/auth/saml/acs`;
}

export function samlMetadataUrl(): string {
  const base = publicAppUrl();
  if (!base) return "/api/auth/saml/metadata";
  return `${base}/api/auth/saml/metadata`;
}

export function samlSignOnUrl(): string {
  const base = publicAppUrl();
  if (!base) return "/api/auth/saml/login";
  return `${base}/api/auth/saml/login`;
}

/** Validate returnTo as a same-app relative path (no open redirect). */
export function validateSamlReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("://")) return "/";
  return raw;
}

export function pinnedIdpCertFingerprints(): string[] {
  const raw = process.env.SAML_IDP_CERT_FINGERPRINT_SHA256 ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/:/g, ""))
    .filter(Boolean);
}
