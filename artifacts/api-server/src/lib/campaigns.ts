import { db, campaignsTable, campaignTypeLinksTable, campaignTypesTable, usersTable, audienceDonorsTable, touchesTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

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
  const [{ aud }] = await db
    .select({ aud: sql<number>`count(*)::int` })
    .from(audienceDonorsTable)
    .where(eq(audienceDonorsTable.campaignId, id));
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
