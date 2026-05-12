import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, touchpointsTable, campaignsTable, channelsTable, campaignTypesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { normalizeDonorId } from "../lib/donor";

const router: IRouter = Router();

router.get("/donors/:donorId/touchpoints", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId;
  const donorId = normalizeDonorId(raw);
  if (!donorId) {
    res.status(400).json({ error: "Constituent ID must be 1-8 digits" });
    return;
  }
  const rows = await db
    .select()
    .from(touchpointsTable)
    .where(eq(touchpointsTable.donorId, donorId))
    .orderBy(touchpointsTable.sendDate);
  const channels = await db.select().from(channelsTable);
  const types = await db.select().from(campaignTypesTable);
  const campaignIds = Array.from(new Set(rows.map((r) => r.campaignId)));
  // Filter to ONLY the campaigns referenced by this donor's touchpoints.
  // Without `inArray` this used to scan/transfer the entire campaigns table
  // on every donor lookup, which an authenticated user could trivially
  // amplify into a sustained DB load.
  const campaigns = campaignIds.length
    ? await db.select().from(campaignsTable).where(inArray(campaignsTable.id, campaignIds))
    : [];
  res.json({
    donorId,
    touchpoints: rows.map((r) => {
      const c = campaigns.find((x) => x.id === r.campaignId);
      const sendDate =
        typeof r.sendDate === "string" ? r.sendDate : (r.sendDate as Date).toISOString().slice(0, 10);
      return {
        campaignId: r.campaignId,
        campaignName: c?.name ?? `Campaign #${r.campaignId}`,
        campaignStatus: c?.status ?? "unknown",
        channelLabel: channels.find((x) => x.id === r.channelId)?.name ?? "Unknown",
        campaignTypeLabel: types.find((x) => x.id === r.campaignTypeId)?.name ?? "Unknown",
        sendDate,
        countsTowardThreshold: r.countsTowardThreshold,
      };
    }),
  });
});

export default router;
