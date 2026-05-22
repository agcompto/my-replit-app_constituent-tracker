/** Reject external entities / DTD expansion before handing XML to the parser. */
export function assertSafeSamlXml(xml: string): void {
  if (/<!ENTITY/i.test(xml) || /<!DOCTYPE/i.test(xml)) {
    throw new Error("unsafe_xml");
  }
  assertNoWeakXmlAlgorithms(xml);
}

export function assertNoWeakXmlAlgorithms(xml: string): void {
  const lower = xml.toLowerCase();
  if (
    lower.includes("rsa-sha1") ||
    (lower.includes("sha1") && lower.includes("signaturemethod")) ||
    lower.includes("#md5") ||
    (lower.includes("digestmethod") && lower.includes("md5"))
  ) {
    throw new Error("weak_algorithm");
  }
}

/** Fail closed when multiple assertions are present in one response. */
export function assertSingleAssertion(xml: string): void {
  const matches = xml.match(/<(?:[\w:]+:)?Assertion\b/gi) ?? [];
  if (matches.length > 1) {
    throw new Error("multiple_assertions");
  }
}

export function extractAssertionExpiryFromXml(xml: string): Date | null {
  const m =
    xml.match(/<(?:[\w:]+:)?Conditions[^>]*NotOnOrAfter="([^"]+)"/i) ??
    xml.match(/NotOnOrAfter="([^"]+)"/i);
  if (!m?.[1]) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}
