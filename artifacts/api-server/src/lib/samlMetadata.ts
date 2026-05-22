import crypto from "node:crypto";
import { assertSafeOutboundHttpsUrl } from "./outboundUrl";
import { pinnedIdpCertFingerprints } from "./samlSp";

export type SamlIdpMetadataState = {
  metadataLoaded: boolean;
  fingerprintMatches: boolean;
  lastMetadataRefreshAt: string | null;
  certExpiresAt: string | null;
  failureReason: string | null;
  entryPoint: string | null;
  idpIssuer: string | null;
  idpCertPem: string | null;
};

type CachedMetadata = {
  fetchedAt: number;
  entryPoint: string;
  idpIssuer: string;
  idpCertPem: string;
  certExpiresAt: Date | null;
  fingerprintSha256: string;
};

let lastGood: CachedMetadata | null = null;
let lastFetchAttemptAt: number | null = null;
let lastFailureReason: string | null = null;

const METADATA_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

function pemFromBase64Der(b64: string): string {
  const cleaned = b64.replace(/\s+/g, "");
  const lines = cleaned.match(/.{1,64}/g) ?? [cleaned];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

export function sha256CertFingerprint(pem: string): string {
  const der = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  const buf = Buffer.from(der, "base64");
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extractAllCertsPem(xml: string): string[] {
  const re = /<(?:[\w:]+:)?X509Certificate>([^<]+)<\/(?:[\w:]+:)?X509Certificate>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(pemFromBase64Der(m[1]));
  }
  return out;
}

function pickPinnedCert(certs: string[]): { pem: string; fingerprint: string } | null {
  for (const pem of certs) {
    const fp = sha256CertFingerprint(pem);
    if (fingerprintAllowed(fp)) return { pem, fingerprint: fp };
  }
  return null;
}

function parseMetadataXml(xml: string): {
  entryPoint: string;
  idpIssuer: string;
  idpCertPem: string;
  certExpiresAt: Date | null;
  fingerprintSha256: string;
} {
  const entryMatch =
    xml.match(/SingleSignOnService[^>]+Location="([^"]+)"/i) ??
    xml.match(/SingleSignOnService[^>]+Location='([^']+)'/i);
  const issuerMatch =
    xml.match(/<(?:[\w:]+:)?EntityDescriptor[^>]+entityID="([^"]+)"/i) ??
    xml.match(/<(?:[\w:]+:)?EntityDescriptor[^>]+entityID='([^']+)'/i);
  const pinned = pickPinnedCert(extractAllCertsPem(xml));
  if (!entryMatch?.[1] || !issuerMatch?.[1] || !pinned) {
    throw new Error("Incomplete IdP metadata");
  }
  let certExpiresAt: Date | null = null;
  const notAfterMatch = xml.match(/NotAfter="([^"]+)"/i);
  if (notAfterMatch?.[1]) {
    const d = new Date(notAfterMatch[1]);
    if (!Number.isNaN(d.getTime())) certExpiresAt = d;
  }
  return {
    entryPoint: entryMatch[1],
    idpIssuer: issuerMatch[1],
    idpCertPem: pinned.pem,
    certExpiresAt,
    fingerprintSha256: pinned.fingerprint,
  };
}

function lastGoodIsPinned(): boolean {
  if (!lastGood) return false;
  return fingerprintAllowed(lastGood.fingerprintSha256);
}

function fingerprintAllowed(fp: string): boolean {
  const pins = pinnedIdpCertFingerprints();
  if (pins.length === 0) return false;
  return pins.includes(fp.toLowerCase());
}

async function fetchMetadataXml(url: string): Promise<string> {
  const safe = await assertSafeOutboundHttpsUrl(url);
  const host = safe.hostname.toLowerCase();
  const allowedHosts = (process.env.SAML_IDP_METADATA_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error("IdP metadata host is not in the allowlist");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(safe.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/samlmetadata+xml, application/xml, text/xml" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Metadata fetch HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("Metadata response too large");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshIdpMetadata(
  metadataUrl: string | null | undefined,
  force = false,
): Promise<CachedMetadata | null> {
  if (!metadataUrl) {
    lastFailureReason = "metadata_url_not_configured";
    return lastGoodIsPinned() ? lastGood : null;
  }
  const now = Date.now();
  if (!force && lastGood && now - lastGood.fetchedAt < METADATA_TTL_MS) {
    return lastGoodIsPinned() ? lastGood : null;
  }
  lastFetchAttemptAt = now;
  try {
    const xml = await fetchMetadataXml(metadataUrl);
    const parsed = parseMetadataXml(xml);
    lastGood = {
      fetchedAt: now,
      entryPoint: parsed.entryPoint,
      idpIssuer: parsed.idpIssuer,
      idpCertPem: parsed.idpCertPem,
      certExpiresAt: parsed.certExpiresAt,
      fingerprintSha256: parsed.fingerprintSha256,
    };
    lastFailureReason = null;
    return lastGood;
  } catch (e) {
    if (e instanceof Error && e.message === "Incomplete IdP metadata") {
      lastFailureReason = "fingerprint_mismatch";
    } else {
      lastFailureReason = e instanceof Error ? e.message : "metadata_fetch_failed";
    }
    if (lastGoodIsPinned()) {
      lastFailureReason = "fingerprint_mismatch_using_last_known_good";
      return lastGood;
    }
    return null;
  }
}

export function getIdpMetadataSnapshot(
  enabled: boolean,
  metadataUrl: string | null | undefined,
): SamlIdpMetadataState {
  const loaded = Boolean(lastGood?.idpCertPem);
  const fp = lastGood?.fingerprintSha256 ?? "";
  const matches = loaded && fingerprintAllowed(fp);
  return {
    metadataLoaded: loaded,
    fingerprintMatches: matches,
    lastMetadataRefreshAt: lastGood
      ? new Date(lastGood.fetchedAt).toISOString()
      : lastFetchAttemptAt
        ? new Date(lastFetchAttemptAt).toISOString()
        : null,
    certExpiresAt: lastGood?.certExpiresAt?.toISOString() ?? null,
    failureReason: enabled ? lastFailureReason : null,
    entryPoint: lastGood?.entryPoint ?? null,
    idpIssuer: lastGood?.idpIssuer ?? null,
    idpCertPem: lastGood?.idpCertPem ?? null,
  };
}

export function getCachedIdpForSaml(): CachedMetadata | null {
  return lastGood;
}
