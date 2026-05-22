import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { getIdpMetadataSnapshot, refreshIdpMetadata } from "../lib/samlMetadata";
import { purgeExpiredSamlAssertions as purgeReplay } from "../lib/samlReplay";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    await purgeReplay();
  } catch (err) {
    req.log.error({ err }, "/healthz database check failed");
    res.status(503).json({ status: "error", error: "database unreachable" });
    return;
  }

  let saml: Record<string, unknown> = {
    enabled: false,
    metadataLoaded: false,
    fingerprintMatches: false,
    lastMetadataRefreshAt: null,
    certExpiresAt: null,
    failureReason: null,
  };
  try {
    const [s] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)).limit(1);
    if (s?.samlEnabled) {
      await refreshIdpMetadata(s.samlIdpMetadataUrl, false);
      const meta = getIdpMetadataSnapshot(true, s.samlIdpMetadataUrl);
      saml = {
        enabled: true,
        metadataLoaded: meta.metadataLoaded,
        fingerprintMatches: meta.fingerprintMatches,
        lastMetadataRefreshAt: meta.lastMetadataRefreshAt,
        certExpiresAt: meta.certExpiresAt,
        failureReason: meta.failureReason,
      };
    }
  } catch {
    saml.failureReason = "saml_health_check_failed";
  }

  res.json({ status: "ok", saml });
});

export default router;
