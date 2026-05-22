import crypto from "node:crypto";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import type { Profile } from "@node-saml/node-saml/lib/types";
import { getCachedIdpForSaml, refreshIdpMetadata } from "./samlMetadata";
import { pinnedIdpCertFingerprints, samlAcsUrl, samlSpEntityId } from "./samlSp";

const CLOCK_SKEW_MS = 60_000;

let metadataXmlCache: { xml: string; expiresAt: number } | null = null;

export async function ensureIdpReady(metadataUrl: string | null | undefined): Promise<{
  ok: true;
  entryPoint: string;
  idpIssuer: string;
  idpCertPem: string;
} | { ok: false; reason: "metadata_invalid" }> {
  const cached = await refreshIdpMetadata(metadataUrl, false);
  const pins = pinnedIdpCertFingerprints();
  const fp = cached?.fingerprintSha256?.toLowerCase() ?? "";
  if (
    !cached?.entryPoint ||
    !cached.idpCertPem ||
    !cached.idpIssuer ||
    pins.length === 0 ||
    !pins.includes(fp)
  ) {
    return { ok: false, reason: "metadata_invalid" };
  }
  return {
    ok: true,
    entryPoint: cached.entryPoint,
    idpIssuer: cached.idpIssuer,
    idpCertPem: cached.idpCertPem,
  };
}

export function buildSamlInstance(opts: {
  entryPoint: string;
  idpIssuer: string;
  idpCertPem: string;
}): SAML {
  return new SAML({
    issuer: samlSpEntityId(),
    callbackUrl: samlAcsUrl(),
    entryPoint: opts.entryPoint,
    idpIssuer: opts.idpIssuer,
    idpCert: opts.idpCertPem,
    audience: samlSpEntityId(),
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    acceptedClockSkewMs: CLOCK_SKEW_MS,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
    validateInResponseTo: ValidateInResponseTo.never,
    disableRequestedAuthnContext: true,
  });
}

export function generateAuthnRequestId(): string {
  return `_${cryptoRandomId()}`;
}

function cryptoRandomId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function getAuthorizeRedirectUrl(
  saml: SAML,
  returnTo: string,
  requestId: string,
): Promise<string> {
  const original = saml.options.generateUniqueId;
  saml.options.generateUniqueId = () => requestId;
  try {
    return await saml.getAuthorizeUrlAsync(returnTo, undefined, {});
  } finally {
    saml.options.generateUniqueId = original;
  }
}

export function getSpMetadataXml(saml: SAML): string {
  const now = Date.now();
  if (metadataXmlCache && metadataXmlCache.expiresAt > now) {
    return metadataXmlCache.xml;
  }
  const xml = saml.generateServiceProviderMetadata(null);
  metadataXmlCache = { xml, expiresAt: now + 5 * 60 * 1000 };
  return xml;
}

export {
  assertSafeSamlXml,
  assertNoWeakXmlAlgorithms,
  assertSingleAssertion,
  extractAssertionExpiryFromXml,
} from "./samlXmlPolicy";

export function extractAssertionId(profile: Profile): string | null {
  if (typeof profile.ID === "string" && profile.ID) return profile.ID;
  const xml = profile.getAssertionXml?.();
  if (xml) {
    const m = xml.match(/\bID="([^"]+)"/);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function mapValidationError(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("inresponse") || msg.includes("in-response")) return "inresponseto_invalid";
  if (msg.includes("audience")) return "audience_invalid";
  if (msg.includes("recipient") || msg.includes("acs")) return "recipient_invalid";
  if (msg.includes("expired") || msg.includes("notonorafter") || msg.includes("notbefore")) {
    return "assertion_expired";
  }
  if (msg.includes("signature") || msg.includes("cert")) return "signature_invalid";
  if (msg.includes("issuer")) return "signature_invalid";
  if (msg.includes("weak_algorithm")) return "signature_invalid";
  if (msg.includes("multiple")) return "unknown";
  if (msg.includes("unsafe_xml")) return "unknown";
  return "unknown";
}
