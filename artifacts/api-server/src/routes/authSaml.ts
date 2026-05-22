import express, { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { loadUser, requireRole } from "../lib/auth";
import { completeLogin } from "../lib/completeLogin";
import {
  validateSamlReturnTo,
  samlMetadataUrl,
  samlSpEntityId,
  samlAcsUrl,
} from "../lib/samlSp";
import {
  buildSamlInstance,
  ensureIdpReady,
  extractAssertionId,
  generateAuthnRequestId,
  getAuthorizeRedirectUrl,
  getSpMetadataXml,
  assertSafeSamlXml,
  assertSingleAssertion,
  extractAssertionExpiryFromXml,
  mapValidationError,
} from "../lib/samlService";
import { resolveSamlAccount } from "../lib/samlAccount";
import { auditSamlRejected } from "../lib/samlReject";
import { consumeAssertionId } from "../lib/samlReplay";
import { checkSamlLoginRate, checkSamlAcsRate } from "../lib/rateLimit";
import { publicAppUrl } from "../lib/appUrl";

const router: IRouter = Router();

async function loadSamlSettings() {
  const [s] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)).limit(1);
  return s;
}

function ssoFailed(res: Response): void {
  res.status(400).type("text/plain").send("SSO failed");
}

function loginRedirectWithError(code: string): string {
  const base = publicAppUrl() ?? "";
  return `${base}/login?ssoError=${encodeURIComponent(code)}`;
}

router.get("/auth/saml/enabled", async (_req, res): Promise<void> => {
  const settings = await loadSamlSettings();
  res.json({ enabled: Boolean(settings?.samlEnabled) });
});

router.get("/auth/saml/metadata", async (_req, res): Promise<void> => {
  const settings = await loadSamlSettings();
  if (!settings?.samlEnabled) {
    res.status(404).type("text/plain").send("SAML is not enabled");
    return;
  }
  const idp = await ensureIdpReady(settings.samlIdpMetadataUrl);
  if (!idp.ok) {
    res.status(503).type("text/plain").send("IdP metadata unavailable");
    return;
  }
  const saml = buildSamlInstance(idp);
  res.setHeader("Content-Type", "application/samlmetadata+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(getSpMetadataXml(saml));
});

router.get("/auth/saml/login", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";
  const rate = checkSamlLoginRate(ip);
  if (!rate.allowed) {
    ssoFailed(res);
    return;
  }
  const settings = await loadSamlSettings();
  if (!settings?.samlEnabled) {
    ssoFailed(res);
    return;
  }
  const idp = await ensureIdpReady(settings.samlIdpMetadataUrl);
  if (!idp.ok) {
    await auditSamlRejected("metadata_invalid");
    ssoFailed(res);
    return;
  }
  const returnTo = validateSamlReturnTo(req.query.returnTo);
  const requestId = generateAuthnRequestId();
  const saml = buildSamlInstance(idp);
  try {
    const redirectUrl = await getAuthorizeRedirectUrl(saml, returnTo, requestId);
    req.session.samlAuthnRequestId = requestId;
    req.session.samlReturnTo = returnTo;
    delete req.session.userId;
    delete req.session.pendingTotpUserId;
    delete req.session.pendingTotpSecret;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.redirect(302, redirectUrl);
  } catch {
    await auditSamlRejected("unknown");
    ssoFailed(res);
  }
});

router.post(
  "/auth/saml/acs",
  express.urlencoded({ extended: false, limit: "2mb" }),
  async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const ip = req.ip ?? "unknown";
    const rate = checkSamlAcsRate(ip);
    if (!rate.allowed) {
      ssoFailed(res);
      return;
    }
    const settings = await loadSamlSettings();
    if (!settings?.samlEnabled) {
      ssoFailed(res);
      return;
    }
    const idp = await ensureIdpReady(settings.samlIdpMetadataUrl);
    if (!idp.ok) {
      await auditSamlRejected("metadata_invalid");
      ssoFailed(res);
      return;
    }

    const body = req.body as Record<string, string>;
    const samlResponse = body.SAMLResponse;
    if (!samlResponse || typeof samlResponse !== "string") {
      await auditSamlRejected("unknown");
      ssoFailed(res);
      return;
    }

    const expectedRequestId = req.session.samlAuthnRequestId;
    const returnTo = validateSamlReturnTo(req.session.samlReturnTo ?? "/");
    if (!expectedRequestId || typeof expectedRequestId !== "string") {
      await auditSamlRejected("inresponseto_invalid");
      ssoFailed(res);
      return;
    }

    const priorUserId = req.session.userId;
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    if (priorUserId !== undefined) {
      // Session regenerated — identity cleared before SAML validation.
    }

    const saml = buildSamlInstance(idp);
    let profile;
    try {
      const decoded = Buffer.from(samlResponse, "base64").toString("utf8");
      assertSafeSamlXml(decoded);
      assertSingleAssertion(decoded);
      const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
      profile = result.profile;
      if (!profile || result.loggedOut) {
        await auditSamlRejected("unknown");
        ssoFailed(res);
        return;
      }
      const responseXml = profile.getSamlResponseXml?.() ?? decoded;
      assertSafeSamlXml(responseXml);
      assertSingleAssertion(responseXml);
      const inResp =
        (profile as Record<string, unknown>).inResponseTo ??
        (profile as Record<string, unknown>).InResponseTo;
      if (typeof inResp !== "string" || inResp !== expectedRequestId) {
        await auditSamlRejected("inresponseto_invalid");
        ssoFailed(res);
        return;
      }
    } catch (e) {
      const reason = mapValidationError(e);
      await auditSamlRejected(reason as Parameters<typeof auditSamlRejected>[0]);
      ssoFailed(res);
      return;
    }

    const assertionId = extractAssertionId(profile);
    if (!assertionId) {
      await auditSamlRejected("unknown");
      ssoFailed(res);
      return;
    }
    const responseXml =
      profile.getSamlResponseXml?.() ??
      Buffer.from(samlResponse, "base64").toString("utf8");
    const notOnOrAfter = extractAssertionExpiryFromXml(responseXml);
    const expiresAt =
      notOnOrAfter && notOnOrAfter.getTime() > Date.now()
        ? notOnOrAfter
        : new Date(Date.now() + 10 * 60 * 1000);
    const replay = await consumeAssertionId(assertionId, expiresAt);
    if (!replay.ok) {
      await auditSamlRejected(replay.reason);
      ssoFailed(res);
      return;
    }

    const account = await resolveSamlAccount({
      nameId: profile.nameID,
      profile: profile as Record<string, unknown>,
    });
    if (!account.ok) {
      if (account.reason === "account_disabled") {
        await auditSamlRejected("unknown", "account_disabled");
        res.redirect(302, loginRedirectWithError("account_disabled"));
        return;
      }
      await auditSamlRejected("domain_not_allowed");
      res.redirect(302, loginRedirectWithError("not_provisioned"));
      return;
    }

    const sessionUser = await loadUser(account.userId);
    if (!sessionUser) {
      await auditSamlRejected("unknown");
      ssoFailed(res);
      return;
    }

    const appBase = publicAppUrl() ?? "";
    const redirectTarget = `${appBase}${returnTo}`;
    await completeLogin(req, res, sessionUser, {
      auditAction: "saml_login",
      authMethod: "saml",
      redirectTo: redirectTarget,
    });
  },
);

/** Read-only SAML SP URLs for settings UI (super_admin). */
router.get(
  "/auth/saml/sp-info",
  requireRole("super_admin"),
  async (_req, res): Promise<void> => {
    res.json({
      entityId: samlSpEntityId(),
      acsUrl: samlAcsUrl(),
      metadataUrl: samlMetadataUrl(),
      signOnUrl: `${publicAppUrl() ?? ""}/api/auth/saml/login`,
    });
  },
);

export default router;
