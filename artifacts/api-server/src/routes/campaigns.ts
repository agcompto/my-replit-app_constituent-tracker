import { Router, type IRouter } from "express";
import { PassThrough } from "node:stream";
import * as archiverModule from "archiver";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, campaignsTable, campaignTypeLinksTable, campaignTypesTable, channelsTable, owningUnitsTable, touchesTable, touchpointsTable, exportJobsTable, usersTable, thresholdsTable, suppressionsTable, suppressionReasonCodesTable, seedGroupsTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  GetCampaignSummaryPdfParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  ArchiveCampaignParams,
  VoidCampaignParams,
  DeleteCampaignParams,
  CloneCampaignParams,
  CloneCampaignBody,
  BulkArchiveCampaignsBody,
  BulkExportCampaignsBody,
  BulkDownloadCampaignManifestsBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, audit, canMutateCampaign, type SessionUser } from "../lib/auth";
import { requireRecentAuth } from "../lib/recentAuth";
import { loadCampaignFull, loadCampaignSummary, setCampaignTypes } from "../lib/campaigns";
import { executeClone } from "../lib/cloneCampaign";
import { peekExportQuotaSlots, recordExportQuota } from "../lib/rateLimit";
import {
  buildCampaignTouchpointCsvs,
  safeFilenamePart,
  writeCampaignSummaryPdf,
} from "../lib/campaignExports";

const router: IRouter = Router();

type ZipArchiveFactory = new (options?: archiverModule.ZipOptions) => archiverModule.Archiver;

function createZipArchive(options?: archiverModule.ZipOptions): archiverModule.Archiver {
  const { ZipArchive } = archiverModule as unknown as { ZipArchive: ZipArchiveFactory };
  return new ZipArchive(options);
}

router.get("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  const mine = req.query.mine === "true";
  if (mine) {
    conditions.push(eq(campaignsTable.submittedByUserId, req.currentUser!.id));
  }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status) conditions.push(eq(campaignsTable.status, status));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    conditions.push(
      or(
        ilike(campaignsTable.name, `%${q}%`),
        ilike(campaignsTable.owningUnit, `%${q}%`),
        ilike(campaignsTable.salesforceCampaignId, `%${q}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(where)
    .orderBy(desc(campaignsTable.createdAt))
    .limit(500);
  const summaries = await Promise.all(rows.map((r) => loadCampaignSummary(r.id)));
  res.json(summaries.filter(Boolean));
});

router.post("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { campaignTypeIds, ...fields } = parsed.data;
  if (fields.owningUnit) {
    const [u] = await db
      .select({ id: owningUnitsTable.id })
      .from(owningUnitsTable)
      .where(and(eq(owningUnitsTable.name, fields.owningUnit), eq(owningUnitsTable.active, true)));
    if (!u) {
      res.status(400).json({ error: "Invalid owning unit" });
      return;
    }
  }
  const sendDateStr =
    fields.intendedSendStartDate instanceof Date
      ? fields.intendedSendStartDate.toISOString().slice(0, 10)
      : fields.intendedSendStartDate ?? null;
  const [row] = await db
    .insert(campaignsTable)
    .values({
      name: fields.name,
      owningUnit: fields.owningUnit,
      submittedByUserId: req.currentUser!.id,
      intendedSendStartDate: sendDateStr,
      audienceDescription: fields.audienceDescription,
      salesforceCampaignId: fields.salesforceCampaignId,
      internalNotes: fields.internalNotes,
      status: "draft",
    })
    .returning();
  await setCampaignTypes(row.id, campaignTypeIds);
  await audit({
    actor: req.currentUser!,
    action: "create_campaign",
    entityType: "campaign",
    entityId: row.id,
    details: row.name,
  });
  res.status(201).json(await loadCampaignFull(row.id));
});

router.get("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const c = await loadCampaignFull(params.data.id);
  if (!c) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(c);
});

router.patch("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCampaignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
  const existing = await loadCampaignFull(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (
    existing.status === "exported" &&
    req.currentUser!.role === "standard"
  ) {
    res.status(403).json({ error: "Cannot edit an exported campaign" });
    return;
  }
  const { campaignTypeIds, ...fields } = body.data;
  if (
    fields.owningUnit !== undefined &&
    fields.owningUnit !== null &&
    fields.owningUnit !== "" &&
    fields.owningUnit !== existing.owningUnit
  ) {
    const [u] = await db
      .select({ id: owningUnitsTable.id })
      .from(owningUnitsTable)
      .where(and(eq(owningUnitsTable.name, fields.owningUnit), eq(owningUnitsTable.active, true)));
    if (!u) {
      res.status(400).json({ error: "Invalid owning unit" });
      return;
    }
  }
  const sendDateStr2 =
    fields.intendedSendStartDate instanceof Date
      ? fields.intendedSendStartDate.toISOString().slice(0, 10)
      : fields.intendedSendStartDate ?? null;
  await db
    .update(campaignsTable)
    .set({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.owningUnit !== undefined && { owningUnit: fields.owningUnit }),
      ...(fields.intendedSendStartDate !== undefined && {
        intendedSendStartDate: sendDateStr2,
      }),
      ...(fields.audienceDescription !== undefined && {
        audienceDescription: fields.audienceDescription,
      }),
      ...(fields.salesforceCampaignId !== undefined && {
        salesforceCampaignId: fields.salesforceCampaignId,
      }),
      ...(fields.internalNotes !== undefined && { internalNotes: fields.internalNotes }),
    })
    .where(eq(campaignsTable.id, params.data.id));
  if (campaignTypeIds) {
    await setCampaignTypes(params.data.id, campaignTypeIds);
  }
  await audit({
    actor: req.currentUser!,
    action: "update_campaign",
    entityType: "campaign",
    entityId: params.data.id,
  });
  res.json(await loadCampaignFull(params.data.id));
});

router.post("/campaigns/:id/clone", requireAuth, async (req, res): Promise<void> => {
  const params = CloneCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CloneCampaignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // OpenAPI declares dateShiftDays as integer but Orval emits zod.number();
  // guard against fractional day offsets here so a 1.5-day shift can't slip
  // through and produce a non-date when added to a `YYYY-MM-DD`.
  if (
    body.data.dateShiftDays !== undefined &&
    body.data.dateShiftDays !== null &&
    !Number.isInteger(body.data.dateShiftDays)
  ) {
    res.status(400).json({ error: "dateShiftDays must be an integer" });
    return;
  }
  const source = await loadCampaignFull(params.data.id);
  if (!source) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const newName = body.data.name.trim();
  if (!newName) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const newIntendedSendDate =
    body.data.intendedSendStartDate instanceof Date
      ? body.data.intendedSendStartDate.toISOString().slice(0, 10)
      : (body.data.intendedSendStartDate ?? null);

  // Authorization note: cloning is gated on requireAuth only (not
  // canMutateCampaign). The product allows every authenticated staff member
  // to view every campaign via GET /campaigns/:id, so cloning the structural
  // setup into a new draft owned by the caller does not expose any data the
  // user could not already read. The clone is theirs to edit; the source is
  // unchanged.
  const result = await db.transaction((tx) =>
    executeClone(tx, {
      sourceCampaignId: source.id,
      actingUserId: req.currentUser!.id,
      actingUserName: req.currentUser!.name,
      actingUserRole: req.currentUser!.role,
      newName,
      newIntendedSendDate,
      explicitShiftDays:
        typeof body.data.dateShiftDays === "number"
          ? body.data.dateShiftDays
          : undefined,
    }),
  );

  const newCampaign = await loadCampaignFull(result.newCampaignId);
  res.status(201).json({
    campaign: newCampaign,
    copiedTouches: result.copiedTouches,
    copiedThresholds: result.copiedThresholds,
    copiedSuppressions: result.copiedSuppressions,
    skippedSuppressions: result.skippedSuppressions,
    copiedSeeds: result.copiedSeeds,
  });
});

// ───────── Bulk operations
//
// Note: these MUST be registered before any `/campaigns/:id/...` handler so
// the literal `bulk` segment doesn't get parsed as a numeric campaign id.

router.post(
  "/campaigns/bulk/archive",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const body = BulkArchiveCampaignsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const ids = Array.from(new Set(body.data.ids));
    const existing = await db
      .select({ id: campaignsTable.id, status: campaignsTable.status })
      .from(campaignsTable)
      .where(inArray(campaignsTable.id, ids));
    const byId = new Map(existing.map((r) => [r.id, r] as const));

    const results: Array<{
      id: number;
      status:
        | "archived"
        | "already_archived"
        | "voided"
        | "not_found"
        | "forbidden";
    }> = [];
    let archivedCount = 0;
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        results.push({ id, status: "not_found" });
        continue;
      }
      if (row.status === "voided") {
        results.push({ id, status: "voided" });
        continue;
      }
      if (row.status === "archived") {
        results.push({ id, status: "already_archived" });
        continue;
      }
      await db
        .update(campaignsTable)
        .set({ status: "archived", archivedAt: new Date() })
        .where(eq(campaignsTable.id, id));
      await audit({
        actor: req.currentUser!,
        action: "archive_campaign",
        entityType: "campaign",
        entityId: id,
      });
      results.push({ id, status: "archived" });
      archivedCount++;
    }
    res.json({ results, archivedCount });
  },
);

// Bulk export: stream a ZIP of per-campaign summary PDFs for every
// selected campaign the caller is allowed to mutate. Mirrors the existing
// single-summary endpoint (`GET /campaigns/:id/summary.pdf`) — one PDF
// per campaign, true per-entry streaming via PassThrough so memory does
// not balloon with batch size.
//
// Authorization: per-id `canMutateCampaign` — never bundle a campaign the
// caller can't already download individually. Inaccessible / voided /
// missing campaigns are silently skipped; a fully-empty selection returns
// 404 instead of an empty ZIP.
//
// Quota: every included campaign in the batch counts as one slot against
// the per-user 20/hour export quota. The whole batch is rejected up-front
// (HTTP 429 + Retry-After) rather than partway through.
function bulkCampaignAccess(
  row: { submittedByUserId: number; status: string },
  user: SessionUser,
): "allowed" | "forbidden" | "voided" {
  if (row.status === "voided") return "voided";
  if (user.role === "admin" || user.role === "super_admin") return "allowed";
  return row.submittedByUserId === user.id ? "allowed" : "forbidden";
}

export async function classifyBulkExportSelection(
  ids: number[],
  user: SessionUser,
  opts: { requireExported?: boolean } = {},
): Promise<{
  results: Array<{
    id: number;
    status: "included" | "not_found" | "forbidden" | "voided" | "not_exported";
    name?: string;
  }>;
  included: Array<{ id: number; name: string }>;
}> {
  const requireExported = opts.requireExported ?? false;
  const results: Array<{
    id: number;
    status: "included" | "not_found" | "forbidden" | "voided" | "not_exported";
    name?: string;
  }> = [];
  const included: Array<{ id: number; name: string }> = [];
  const uniqueIds = [...new Set(ids)];
  const rows =
    uniqueIds.length > 0
      ? await db
          .select({
            id: campaignsTable.id,
            name: campaignsTable.name,
            submittedByUserId: campaignsTable.submittedByUserId,
            status: campaignsTable.status,
            exportedAt: campaignsTable.exportedAt,
          })
          .from(campaignsTable)
          .where(inArray(campaignsTable.id, uniqueIds))
      : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, status: "not_found" });
      continue;
    }
    const access = bulkCampaignAccess(row, user);
    if (access === "forbidden") {
      results.push({ id, status: "forbidden" });
      continue;
    }
    if (access === "voided") {
      results.push({ id, status: "voided" });
      continue;
    }
    if (requireExported && !row.exportedAt) {
      results.push({ id, status: "not_exported", name: row.name });
      continue;
    }
    results.push({ id, status: "included", name: row.name });
    included.push({ id, name: row.name });
  }
  return { results, included };
}

router.post(
  "/campaigns/bulk/export.zip",
  requireAuth,
  async (req, res): Promise<void> => {
    const body = BulkExportCampaignsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const ids = Array.from(new Set(body.data.ids));
    // PDFs don't require prior export — every accessible campaign can be
    // summarized — so leave requireExported off here.
    const { included } = await classifyBulkExportSelection(
      ids,
      req.currentUser!,
    );
    if (included.length === 0) {
      res.status(404).json({
        error:
          "None of the selected campaigns are accessible (not found, forbidden, or voided).",
      });
      return;
    }

    // Per-export row cap, mirroring the single-export route in
    // routes/exports.ts. The bulk endpoint streams summary PDFs, but
    // the underlying donor-touchpoint volume those PDFs describe is
    // still bounded by MAX_EXPORT_ROWS so a single bulk call cannot
    // exfiltrate more than the configured per-export ceiling. We only
    // count rows from each campaign's *current* export batch (jobs
    // within 60s of campaigns.exported_at) so historical re-exports
    // don't inflate the total and trigger spurious 413s.
    const MAX_EXPORT_ROWS = Math.max(
      1,
      Number.parseInt(process.env.MAX_EXPORT_ROWS ?? "500000", 10) || 500_000,
    );
    const includedIds = included.map((c) => c.id);
    const [{ totalRows }] = await db
      .select({
        totalRows: sql<number>`coalesce(sum(${exportJobsTable.rowCount}), 0)::int`,
      })
      .from(exportJobsTable)
      .innerJoin(
        campaignsTable,
        eq(campaignsTable.id, exportJobsTable.campaignId),
      )
      .where(
        and(
          inArray(exportJobsTable.campaignId, includedIds),
          sql`${campaignsTable.exportedAt} is not null`,
          sql`abs(extract(epoch from (${exportJobsTable.exportedAt} - ${campaignsTable.exportedAt}))) < 60`,
        ),
      );
    if (totalRows > MAX_EXPORT_ROWS) {
      res.status(413).json({
        code: "export_row_cap_exceeded",
        error: `This bulk export would describe ${totalRows.toLocaleString()} rows across ${included.length} campaigns, which exceeds the per-export cap of ${MAX_EXPORT_ROWS.toLocaleString()}. Reduce the selection or raise MAX_EXPORT_ROWS.`,
        totalRows,
        maxRows: MAX_EXPORT_ROWS,
      });
      return;
    }

    const userId = req.currentUser!.id;
    const peek = peekExportQuotaSlots(userId);
    if (peek.remaining < included.length) {
      res.setHeader("Retry-After", String(peek.retryAfterSec || 60));
      res.status(429).json({
        code: "export_quota_exceeded",
        error: `Export quota exceeded — need ${included.length} slots, have ${peek.remaining}.`,
      });
      return;
    }
    recordExportQuota(userId, included.length);

    const archive = createZipArchive({ zlib: { level: 6 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign_summaries.zip"`,
    );
    archive.on("error", (err) => {
      req.log?.error({ err }, "bulk export zip error");
      try { res.destroy(err); } catch { /* noop */ }
    });
    archive.pipe(res);

    // True per-entry streaming: each summary PDF is rendered into a
    // PassThrough that archiver consumes as it builds the entry. We never
    // buffer a full PDF in memory — the next entry isn't started until
    // archiver has finished consuming the previous PassThrough.
    for (const c of included) {
      const folder = safeFilenamePart(c.name, c.id);
      const filename = `${folder}_summary.pdf`;
      const pass = new PassThrough();
      archive.append(pass, { name: filename });
      try {
        await writeCampaignSummaryPdf(c.id, pass);
      } catch (err) {
        req.log?.error({ err, id: c.id }, "summary pdf render failed");
        try { pass.destroy(err as Error); } catch { /* noop */ }
        throw err;
      }
      await audit({
        actor: req.currentUser!,
        action: "bulk_export_campaign",
        entityType: "campaign",
        entityId: c.id,
        details: `summary PDF (${filename})`,
      });
    }
    await archive.finalize();
  },
);

router.post(
  "/campaigns/bulk/manifests.zip",
  requireAuth,
  async (req, res): Promise<void> => {
    const body = BulkDownloadCampaignManifestsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const ids = Array.from(new Set(body.data.ids));
    // Per-id authz: the existing single-export endpoint enforces
    // canMutateCampaign, so the bulk version must too — otherwise this
    // endpoint becomes an IDOR-style oracle that lets any authenticated
    // user pull audience CSVs for campaigns they cannot otherwise read.
    // requireExported=true so never-exported campaigns are filtered before
    // they consume quota slots.
    const { included } = await classifyBulkExportSelection(ids, req.currentUser!, { requireExported: true });
    if (included.length === 0) {
      res.status(404).json({
        error:
          "None of the selected campaigns have an exported audience to bundle.",
      });
      return;
    }

    // Build the per-touch audience CSVs for each included campaign first.
    // buildCampaignTouchpointCsvs returns only the *current* export batch
    // (jobs within 60s of campaigns.exported_at), so totalRows reflects
    // what we're actually about to ship — historical re-exports don't
    // inflate the total. A campaign whose batch is empty drops out here.
    const builds: Array<{
      id: number;
      name: string;
      totalRows: number;
      files: Array<{ fileName: string; csv: string; rowCount: number }>;
    }> = [];
    for (const c of included) {
      const built = await buildCampaignTouchpointCsvs(c.id);
      if (!built || built.files.length === 0) continue;
      builds.push({ id: c.id, name: c.name, totalRows: built.totalRows, files: built.files });
    }
    if (builds.length === 0) {
      res.status(404).json({
        error:
          "None of the selected campaigns have an exported audience to bundle.",
      });
      return;
    }

    // Per-export row cap (same MAX_EXPORT_ROWS semantics as the single
    // export route in routes/exports.ts). Sum is over the current batch
    // only because buildCampaignTouchpointCsvs already filters to it.
    const MAX_EXPORT_ROWS = Math.max(
      1,
      Number.parseInt(process.env.MAX_EXPORT_ROWS ?? "500000", 10) || 500_000,
    );
    const totalRows = builds.reduce((s, b) => s + b.totalRows, 0);
    if (totalRows > MAX_EXPORT_ROWS) {
      res.status(413).json({
        code: "export_row_cap_exceeded",
        error: `This bulk audience download would produce ${totalRows.toLocaleString()} rows across ${builds.length} campaigns, which exceeds the per-export cap of ${MAX_EXPORT_ROWS.toLocaleString()}. Reduce the selection or raise MAX_EXPORT_ROWS.`,
        totalRows,
        maxRows: MAX_EXPORT_ROWS,
      });
      return;
    }

    // Quota is charged for the campaigns that actually produce ZIP
    // entries — never-exported / empty-batch campaigns were already
    // dropped above so they cannot consume slots.
    const userId = req.currentUser!.id;
    const peek = peekExportQuotaSlots(userId);
    if (peek.remaining < builds.length) {
      res.setHeader("Retry-After", String(peek.retryAfterSec || 60));
      res.status(429).json({
        code: "export_quota_exceeded",
        error: `Export quota exceeded — need ${builds.length} slots, have ${peek.remaining}.`,
      });
      return;
    }
    recordExportQuota(userId, builds.length);

    const archive = createZipArchive({ zlib: { level: 6 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign_audience_csvs.zip"`,
    );
    archive.on("error", (err) => {
      req.log?.error({ err }, "bulk audience zip error");
      try { res.destroy(err); } catch { /* noop */ }
    });
    archive.pipe(res);

    for (const b of builds) {
      const folder = safeFilenamePart(b.name, b.id);
      for (const f of b.files) {
        archive.append(Buffer.from(f.csv, "utf8"), {
          name: `${folder}/${f.fileName}`,
        });
      }
      await audit({
        actor: req.currentUser!,
        action: "bulk_download_audience_csv",
        entityType: "campaign",
        entityId: b.id,
        details: `${b.files.length} touch CSV(s), ${b.totalRows} rows`,
      });
    }
    await archive.finalize();
  },
);

router.post(
  "/campaigns/:id/archive",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = ArchiveCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.status === "voided") {
      res.status(403).json({ error: "Cannot archive a voided campaign" });
      return;
    }
    await db
      .update(campaignsTable)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(campaignsTable.id, params.data.id));
    await audit({
      actor: req.currentUser!,
      action: "archive_campaign",
      entityType: "campaign",
      entityId: params.data.id,
    });
    const c = await loadCampaignFull(params.data.id);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  },
);

router.post(
  "/campaigns/:id/void",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = VoidCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.status === "voided") {
      res.status(403).json({ error: "Campaign is already voided" });
      return;
    }
    await db
      .update(campaignsTable)
      .set({ status: "voided", voidedAt: new Date() })
      .where(eq(campaignsTable.id, params.data.id));
    await audit({
      actor: req.currentUser!,
      action: "void_campaign",
      entityType: "campaign",
      entityId: params.data.id,
    });
    const c = await loadCampaignFull(params.data.id);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  },
);

router.get(
  "/campaigns/:id/summary.pdf",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetCampaignSummaryPdfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const campaign = await loadCampaignFull(params.data.id);
    if (!campaign) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const safeName = safeFilenamePart(campaign.name, campaign.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}_summary.pdf"`,
    );
    await writeCampaignSummaryPdf(params.data.id, res);
  },
);

router.delete(
  "/campaigns/:id",
  requireRole("super_admin"),
  requireRecentAuth,
  async (req, res): Promise<void> => {
    const params = DeleteCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ id: campaignsTable.id, name: campaignsTable.name, status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Audit BEFORE delete (FK to campaign is nullable on audit_log via
    // entity_id; row stays even after the campaign is gone).
    await audit({
      actor: req.currentUser!,
      action: "delete_campaign",
      entityType: "campaign",
      entityId: existing.id,
      details: `Permanently deleted "${existing.name}" (status=${existing.status})`,
    });
    // FKs from touches/audience/thresholds/etc. all cascade on delete.
    await db.delete(campaignsTable).where(eq(campaignsTable.id, params.data.id));
    res.status(204).end();
  },
);

void usersTable;
void campaignTypesTable;

export default router;
