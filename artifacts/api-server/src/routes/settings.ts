import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable, campaignsTable } from "@workspace/db";
import { UpdateSettingsBody, RunRetentionDeleteBody } from "@workspace/api-zod";
import { requireAuth, requireRole, audit } from "../lib/auth";
import { validateChannelCapacity } from "../lib/saturation";

const router: IRouter = Router();

async function loadSettings() {
  const [s] = await db.select().from(appSettingsTable).limit(1);
  if (!s) {
    const [created] = await db.insert(appSettingsTable).values({ id: 1 }).returning();
    return created;
  }
  return s;
}

// GET is intentionally readable by every authenticated user. The exposed
// fields are operational configuration that the entire app depends on for
// rendering: fiscal-year boundaries (date displays everywhere), and feature
// flags (`googleSheetImportEnabled`, `aiAssistEnabled`, `globalThresholdsEnabled`,
// `retentionDeleteEnabled`) that the wizard, suppressions/seeds, audience,
// reports filter, and campaign detail pages all read to know which UI
// affordances to render. None of these are secrets — they are public-by-design
// product flags. Mutating settings (`PATCH /settings`) and acting on them
// (`POST /retention/delete`) remain admin/super-admin only.
router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const s = await loadSettings();
  res.json({
    fiscalYearStartMonth: s.fiscalYearStartMonth,
    fiscalYearStartDay: s.fiscalYearStartDay,
    googleSheetImportEnabled: s.googleSheetImportEnabled,
    retentionDeleteEnabled: s.retentionDeleteEnabled,
    globalThresholdsEnabled: s.globalThresholdsEnabled,
    aiAssistEnabled: s.aiAssistEnabled,
    channelCapacity: s.channelCapacity ?? {},
  });
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
    // The generated zod accepts any object for `channelCapacity`; re-validate
    // shape (keys = positive integer channel IDs, values = non-negative ints)
    // and normalize zero values out so the stored map only contains real caps.
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
    res.json({
      fiscalYearStartMonth: updated.fiscalYearStartMonth,
      fiscalYearStartDay: updated.fiscalYearStartDay,
      googleSheetImportEnabled: updated.googleSheetImportEnabled,
      retentionDeleteEnabled: updated.retentionDeleteEnabled,
      globalThresholdsEnabled: updated.globalThresholdsEnabled,
      aiAssistEnabled: updated.aiAssistEnabled,
      channelCapacity: updated.channelCapacity ?? {},
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
    // Count touchpoints before deletion
    const olderThan = parsed.data.olderThan;
    const { sql } = await import("drizzle-orm");
    const { touchpointsTable } = await import("@workspace/db");
    const [counts] = await db
      .select({
        campaigns: sql<number>`(select count(*)::int from ${campaignsTable} where created_at < ${olderThan}::date)`,
        touchpoints: sql<number>`(select count(*)::int from ${touchpointsTable} where send_date < ${olderThan}::date)`,
      })
      .from(sql`(select 1) t`);
    await db.execute(
      sql`delete from ${campaignsTable} where created_at < ${olderThan}::date`,
    );
    await audit({
      actor: req.currentUser!,
      action: "retention_delete",
      entityType: "system",
      details: `older_than=${olderThan} campaigns=${counts?.campaigns ?? 0} touchpoints=${counts?.touchpoints ?? 0}`,
    });
    res.json({
      campaignsDeleted: counts?.campaigns ?? 0,
      touchpointsDeleted: counts?.touchpoints ?? 0,
    });
  },
);

export default router;
