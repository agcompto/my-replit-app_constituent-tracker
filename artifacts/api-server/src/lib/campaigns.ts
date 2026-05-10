import {
  db,
  campaignsTable,
  campaignTypeLinksTable,
  campaignTypesTable,
  usersTable,
  audienceDonorsTable,
  touchesTable,
  touchAudienceDonorsTable,
  suppressionsTable,
  seedGroupsTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { loadLatestHealthCheckStatus } from "./healthCheck";

function dateOnly(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export async function loadCampaignFull(id: number) {
  const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!c) return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, c.submittedByUserId));
  const links = await db
    .select({
      id: campaignTypesTable.id,
      name: campaignTypesTable.name,
      description: campaignTypesTable.description,
      active: campaignTypesTable.active,
      systemDefault: campaignTypesTable.systemDefault,
    })
    .from(campaignTypeLinksTable)
    .innerJoin(campaignTypesTable, eq(campaignTypeLinksTable.campaignTypeId, campaignTypesTable.id))
    .where(eq(campaignTypeLinksTable.campaignId, id));
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    owningUnit: c.owningUnit,
    submittedByUserId: c.submittedByUserId,
    submittedByName: u?.name ?? "Unknown",
    intendedSendStartDate:
      typeof c.intendedSendStartDate === "string"
        ? c.intendedSendStartDate
        : dateOnly(c.intendedSendStartDate as Date | null),
    audienceDescription: c.audienceDescription,
    salesforceCampaignId: c.salesforceCampaignId,
    internalNotes: c.internalNotes,
    originalRowCount: c.originalRowCount,
    blankRowCount: c.blankRowCount,
    validIdCount: c.validIdCount,
    uniqueIdCount: c.uniqueIdCount,
    duplicateIdCount: c.duplicateIdCount,
    rejectedIdCount: c.rejectedIdCount,
    extraColumnsIgnored: c.extraColumnsIgnored,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    exportedAt: c.exportedAt ? c.exportedAt.toISOString() : null,
    archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    voidedAt: c.voidedAt ? c.voidedAt.toISOString() : null,
    campaignTypes: links,
  };
}

export async function loadCampaignSummary(id: number) {
  const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!c) return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, c.submittedByUserId));
  const types = await db
    .select({ name: campaignTypesTable.name })
    .from(campaignTypeLinksTable)
    .innerJoin(campaignTypesTable, eq(campaignTypeLinksTable.campaignTypeId, campaignTypesTable.id))
    .where(eq(campaignTypeLinksTable.campaignId, id));
  const [{ ct }] = await db
    .select({ ct: sql<number>`count(*)::int` })
    .from(touchesTable)
    .where(eq(touchesTable.campaignId, id));
  // Deduped audience size across all touches in the campaign:
  // - touches with audienceMode = "campaign" pull from the campaign-wide audience
  // - touches with audienceMode = "custom" pull from their own per-touch list
  // Union the donor IDs from whichever sources are actually used by this campaign's touches,
  // then count distinct donor IDs.
  const [{ aud }] = await db.execute<{ aud: number }>(sql`
    SELECT COUNT(DISTINCT donor_id)::int AS aud FROM (
      SELECT ${audienceDonorsTable.donorId} AS donor_id
        FROM ${audienceDonorsTable}
       WHERE ${audienceDonorsTable.campaignId} = ${id}
         AND EXISTS (
           SELECT 1 FROM ${touchesTable}
            WHERE ${touchesTable.campaignId} = ${id}
              AND ${touchesTable.audienceMode} = 'campaign'
         )
      UNION
      SELECT ${touchAudienceDonorsTable.donorId} AS donor_id
        FROM ${touchAudienceDonorsTable}
        JOIN ${touchesTable} ON ${touchesTable.id} = ${touchAudienceDonorsTable.touchId}
       WHERE ${touchesTable.campaignId} = ${id}
         AND ${touchesTable.audienceMode} = 'custom'
    ) x
  `).then((r: any) => r.rows ?? r);
  const [{ supCount }] = await db
    .select({ supCount: sql<number>`count(*)::int` })
    .from(suppressionsTable)
    .where(eq(suppressionsTable.campaignId, id));
  const [{ seedCount }] = await db
    .select({ seedCount: sql<number>`count(*)::int` })
    .from(seedGroupsTable)
    .where(eq(seedGroupsTable.campaignId, id));
  const lastHealthCheckStatus = await loadLatestHealthCheckStatus(id);

  return {
    id: c.id,
    name: c.name,
    status: c.status,
    submittedByName: u?.name ?? "Unknown",
    submittedByUserId: c.submittedByUserId,
    owningUnit: c.owningUnit,
    intendedSendStartDate:
      typeof c.intendedSendStartDate === "string"
        ? c.intendedSendStartDate
        : dateOnly(c.intendedSendStartDate as Date | null),
    createdAt: c.createdAt.toISOString(),
    exportedAt: c.exportedAt ? c.exportedAt.toISOString() : null,
    touchCount: ct,
    audienceSize: aud,
    validIdCount: c.validIdCount,
    rejectedIdCount: c.rejectedIdCount,
    duplicateIdCount: c.duplicateIdCount,
    extraColumnsIgnored: c.extraColumnsIgnored,
    suppressionCount: supCount,
    seedCount,
    lastHealthCheckStatus,
    campaignTypes: types.map((t) => t.name),
  };
}

export async function setCampaignTypes(campaignId: number, typeIds: number[]) {
  await db.delete(campaignTypeLinksTable).where(eq(campaignTypeLinksTable.campaignId, campaignId));
  if (typeIds.length === 0) return;
  // dedupe
  const unique = Array.from(new Set(typeIds));
  await db
    .insert(campaignTypeLinksTable)
    .values(unique.map((id) => ({ campaignId, campaignTypeId: id })));
  void inArray;
}
