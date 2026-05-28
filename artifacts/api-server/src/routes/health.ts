import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { getIdpMetadataSnapshot, refreshIdpMetadata } from "../lib/samlMetadata";
import { purgeExpiredSamlAssertions as purgeReplay } from "../lib/samlReplay";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

async function getSamlHealth(): Promise<Record<string, unknown>> {
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
  return saml;
}

router.get("/healthz", async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    await purgeReplay();
  } catch (err) {
    req.log.error({ err }, "/healthz database check failed");
    res.status(503).json({ status: "error", error: "database unreachable" });
    return;
  }

  res.json({ status: "ok", saml: await getSamlHealth() });
});

router.get("/system/status", requireRole("admin", "super_admin"), async (req, res) => {
  const started = process.uptime();
  let database: { ok: boolean; error?: string } = { ok: true };
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    req.log.error({ err }, "/system/status database check failed");
    database = { ok: false, error: "database_unreachable" };
  }

  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)).limit(1);
  res.json({
    status: database.ok ? "ok" : "degraded",
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    commitSha: process.env.GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    publicUrl: process.env.APP_PUBLIC_URL ?? null,
    uptimeSeconds: Math.round(started),
    database,
    exportCapRows: Number.parseInt(process.env.MAX_EXPORT_ROWS ?? "500000", 10) || 500000,
    suspiciousExportRows: Number.parseInt(process.env.SUSPICIOUS_EXPORT_ROWS ?? "100000", 10) || 100000,
    retention: settings
      ? {
          deleteEnabled: settings.retentionDeleteEnabled,
          scheduleEnabled: settings.retentionScheduleEnabled,
          dryRunOnly: settings.retentionScheduleDryRunOnly,
          olderThanDays: settings.retentionScheduleOlderThanDays,
          lastRunAt: settings.retentionScheduleLastRunAt?.toISOString() ?? null,
        }
      : null,
    saml: await getSamlHealth(),
  });
});

export default router;
