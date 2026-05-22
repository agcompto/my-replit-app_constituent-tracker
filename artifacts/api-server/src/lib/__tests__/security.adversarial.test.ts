import { describe, it, expect, beforeAll } from "vitest";
import { validateSamlReturnTo } from "../samlSp";
import {
  assertNoWeakXmlAlgorithms,
  assertSafeSamlXml,
  assertSingleAssertion,
  extractAssertionExpiryFromXml,
} from "../samlService";
import { assertSafeOutboundHttpsUrl } from "../outboundUrl";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("SAML returnTo validation", () => {
  it("rejects open redirects", () => {
    expect(validateSamlReturnTo("/")).toBe("/");
    expect(validateSamlReturnTo("/dashboard")).toBe("/dashboard");
    expect(validateSamlReturnTo("//evil.com")).toBe("/");
    expect(validateSamlReturnTo("/\\evil")).toBe("/");
    expect(validateSamlReturnTo("https://evil.com")).toBe("/");
  });
});

describe("SAML XML algorithm policy", () => {
  it("rejects SHA-1 signature methods in assertion XML", () => {
    const xml = '<Response><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/></Response>';
    expect(() => assertNoWeakXmlAlgorithms(xml)).toThrow();
  });

  it("rejects SHA-1 when paired with SignatureMethod", () => {
    const xml =
      '<Response><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><SignatureMethod Algorithm="sha1"/></Response>';
    expect(() => assertNoWeakXmlAlgorithms(xml)).toThrow();
  });

  it("rejects external entities and DOCTYPE", () => {
    expect(() => assertSafeSamlXml('<!DOCTYPE foo [<!ENTITY xxe "x">]>')).toThrow();
    expect(() => assertSafeSamlXml("<!ENTITY evil SYSTEM 'file:///etc/passwd'>")).toThrow();
  });

  it("rejects multiple assertions", () => {
    const xml = "<saml:Assertion/><saml:Assertion/>";
    expect(() => assertSingleAssertion(xml)).toThrow();
  });

  it("extracts NotOnOrAfter for replay expiry", () => {
    const xml =
      '<saml:Assertion><saml:Conditions NotOnOrAfter="2030-01-01T00:00:00.000Z"/></saml:Assertion>';
    const d = extractAssertionExpiryFromXml(xml);
    expect(d?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });
});

describe("outbound URL SSRF guard", () => {
  it("blocks localhost metadata URLs", async () => {
    await expect(assertSafeOutboundHttpsUrl("https://localhost/metadata")).rejects.toThrow();
  });
  it("blocks non-HTTPS", async () => {
    await expect(assertSafeOutboundHttpsUrl("http://login.microsoftonline.com/x")).rejects.toThrow();
  });
});

describe("OpenAPI drift (smoke)", () => {
  const routeFiles = readdirSync(join(import.meta.dirname, "../../routes")).filter((f) =>
    f.endsWith(".ts"),
  );
  const openapi = readFileSync(
    join(import.meta.dirname, "../../../../../lib/api-spec/openapi.yaml"),
    "utf8",
  );

  it("documents SAML ACS path", () => {
    expect(openapi).toContain("/auth/saml/acs");
    expect(routeFiles).toContain("authSaml.ts");
  });

  it("documents healthz saml object", () => {
    expect(openapi).toContain("SamlHealthStatus");
  });
});

describe("session cookie policy (static)", () => {
  it("session module sets httpOnly strict path /api", async () => {
    const src = readFileSync(join(import.meta.dirname, "../session.ts"), "utf8");
    expect(src).toContain('httpOnly: true');
    expect(src).toContain('sameSite: "strict"');
    expect(src).toContain('path: "/api"');
  });
});

describe("password-setup allowlist (static)", () => {
  it("app.ts allowlists password-setup for mustChangePassword gate", async () => {
    const src = readFileSync(join(import.meta.dirname, "../../app.ts"), "utf8");
    expect(src).toContain("isPasswordSetupRoute");
    expect(src).toContain("isSamlPublicRoute");
  });
});

describe("SAML ACS hardening (static)", () => {
  it("requires AuthnRequest id before accepting ACS", () => {
    const src = readFileSync(join(import.meta.dirname, "../../routes/authSaml.ts"), "utf8");
    expect(src).toContain("!expectedRequestId");
    expect(src).toContain("inresponseto_invalid");
  });

  it("rejects inactive SAML users at account resolution", () => {
    const src = readFileSync(join(import.meta.dirname, "../samlAccount.ts"), "utf8");
    expect(src).toContain("!u.active");
    expect(src).toContain("account_disabled");
  });
});
