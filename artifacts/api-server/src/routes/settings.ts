import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { UpdateSettingsBody, RunRetentionDeleteBody } from "@workspace/api-zod";
import { requireAuth, requireRole, audit } from "../lib/auth";
import { validateChannelCapacity } from "../lib/saturation";
import { runRetentionPipeline } from "../lib/retention";
import { UpdateSamlSettingsBody } from "@workspace/api-zod";
import { getIdpMetadataSnapshot, refreshIdpMetadata } from "../lib/samlMetadata";
import { samlSpEntityId, samlAcsUrl, samlMetadataUrl } from "../lib/samlSp";

const router: IRouter = Router();

async function loadSettings() {
  const [s] = await db.select().from(appSettingsTable).limit(1);
  if (!s) {
    const [created] = await db.insert(appSettingsTable).values({ id: 1 }).returning();
    return created;
  }
  return s;
}

function settingsJson(s: typeof appSettingsTable.$inferSelect, opts?: { includeSamlConfig?: boolean }) {
  const base = {
    fiscalYearStartMonth: s.fiscalYearStartMonth,
    fiscalYearStartDay: s.fiscalYearStartDay,
    googleSheetImportEnabled: s.googleSheetImportEnabled,
    retentionDeleteEnabled: s.retentionDeleteEnabled,
    globalThresholdsEnabled: s.globalThresholdsEnabled,
    aiAssistEnabled: s.aiAssistEnabled,
    channelCapacity: s.channelCapacity ?? {},
    samlEnabled: s.samlEnabled,
  };
  if (!opts?.includeSamlConfig) return base;
  const meta = getIdpMetadataSnapshot(s.samlEnabled, s.samlIdpMetadataUrl);
  return {
    ...base,
    samlIdpMetadataUrl: s.samlIdpMetadataUrl,
    samlJitEmailDomains: s.samlJitEmailDomains ?? [],
    samlRoleGroupMap: s.samlRoleGroupMap ?? {
      super_admin: [],
      admin: [],
      standard: [],
    },
    samlGroupSyncEnabled: s.samlGroupSyncEnabled,
    samlSpEntityId: samlSpEntityId(),
    samlAcsUrl: samlAcsUrl(),
    samlMetadataUrl: samlMetadataUrl(),
    samlHealth: {
      enabled: s.samlEnabled,
      metadataLoaded: meta.metadataLoaded,
      fingerprintMatches: meta.fingerprintMatches,
      lastMetadataRefreshAt: meta.lastMetadataRefreshAt,
      certExpiresAt: meta.certExpiresAt,
      failureReason: meta.failureReason,
    },
  };
}

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const s = await loadSettings();
  const includeSamlConfig = req.currentUser!.role === "super_admin";
  res.json(settingsJson(s, { includeSamlConfig }));
});

router.patch(
  "/settings",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const parsed = UpdateSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    let channelCapacity: Record<string, number> | undefined;
    if (parsed.data.channelCapacity !== undefined) {
      try {
        channelCapacity = validateChannelCapacity(parsed.data.channelCapacity);
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : "Invalid channelCapacity" });
        return;
      }
    }
    const s = await loadSettings();
    const updateValues: Partial<typeof appSettingsTable.$inferInsert> = {
      ...parsed.data,
      ...(channelCapacity !== undefined ? { channelCapacity } : {}),
    };
    const [updated] = await db
      .update(appSettingsTable)
      .set(updateValues)
      .where(eq(appSettingsTable.id, s.id))
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "update_settings",
      entityType: "settings",
      entityId: updated.id,
      details: JSON.stringify(parsed.data),
    });
    res.json(settingsJson(updated, { includeSamlConfig: req.currentUser!.role === "super_admin" }));
  },
);

router.patch(
  "/settings/saml",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const parsed = UpdateSamlSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const s = await loadSettings();
    const [updated] = await db
      .update(appSettingsTable)
      .set(parsed.data)
      .where(eq(appSettingsTable.id, s.id))
      .returning();
    if (parsed.data.samlIdpMetadataUrl !== undefined) {
      await refreshIdpMetadata(updated.samlIdpMetadataUrl, true);
    }
    await audit({
      actor: req.currentUser!,
      action: "update_settings",
      entityType: "settings",
      entityId: updated.id,
      details: JSON.stringify({ saml: parsed.data }),
    });
    res.json(settingsJson(updated, { includeSamlConfig: true }));
  },
);

router.post(
  "/settings/saml/refresh-metadata",
  requireRole("super_admin"),
  async (_req, res): Promise<void> => {
    const s = await loadSettings();
    await refreshIdpMetadata(s.samlIdpMetadataUrl, true);
    const meta = getIdpMetadataSnapshot(s.samlEnabled, s.samlIdpMetadataUrl);
    res.json({
      metadataLoaded: meta.metadataLoaded,
      fingerprintMatches: meta.fingerprintMatches,
      lastMetadataRefreshAt: meta.lastMetadataRefreshAt,
      certExpiresAt: meta.certExpiresAt,
      failureReason: meta.failureReason,
    });
  },
);

router.post(
  "/retention/delete",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const parsed = RunRetentionDeleteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const s = await loadSettings();
    if (!s.retentionDeleteEnabled) {
      res.status(403).json({ error: "Retention delete is not enabled in settings." });
      return;
    }
    if (!parsed.data.confirm) {
      res.status(400).json({ error: "Confirmation required." });
      return;
    }
    const olderThan =
      parsed.data.olderThan instanceof Date
        ? parsed.data.olderThan.toISOString().slice(0, 10)
        : (parsed.data.olderThan as string);
    const result = await runRetentionPipeline({ olderThan, dryRun: false });
    await audit({
      actor: req.currentUser!,
      action: "retention_delete",
      entityType: "system",
      details: `older_than=${olderThan} campaigns=${result.campaignsDeleted} touchpoints=${result.touchpointsDeleted}`,
    });
    res.json({
      campaignsDeleted: result.campaignsDeleted,
      touchpointsDeleted: result.touchpointsDeleted,
    });
  },
);

export default router;
