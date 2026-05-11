import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, campaignTypesTable, channelsTable, owningUnitsTable, appSettingsTable, suppressionReasonCodesTable, thresholdTemplatesTable } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_CHANNELS = [
  "Email",
  "Direct Mail",
  "Phonathon / Call",
  "Text Message",
  "Personal Outreach",
  "Event Invitation",
];

const DEFAULT_CAMPAIGN_TYPES = [
  "Solicitation",
  "Stewardship",
  "Newsletter",
  "Event",
  "Survey",
  "Engagement",
];

const DEFAULT_SUPPRESSION_REASONS: { name: string; description: string }[] = [
  { name: "Do Not Contact", description: "Constituent has requested no further outreach." },
  { name: "Deceased", description: "Constituent record marked deceased." },
  { name: "Bad Address / Bounce", description: "Last known contact information is invalid." },
  { name: "Recent Major Gift Ask", description: "Excluded to avoid stewardship conflicts after a recent solicitation." },
  { name: "VIP / Hand-Curated List", description: "Reserved for personal outreach by a gift officer." },
  { name: "Audience Mismatch", description: "Constituent does not match the campaign's intended segment." },
  { name: "Other", description: "Use the notes field to describe the reason." },
];

const DEFAULT_OWNING_UNITS = [
  "University Advancement",
  "Annual Giving",
  "Alumni Association",
  "Athletics",
  "Libraries",
  "College of Agriculture and Life Sciences",
  "College of Design",
  "College of Education",
  "College of Engineering",
  "College of Humanities and Social Sciences",
  "College of Natural Resources",
  "College of Sciences",
  "College of Textiles",
  "College of Veterinary Medicine",
  "Poole College of Management",
  "Wilson College of Textiles",
];

export async function seedDefaults(): Promise<void> {
  // Default super admin
  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    const bootstrapPassword = randomBytes(16).toString("hex");
    const passwordHash = await bcrypt.hash(bootstrapPassword, 10);
    await db.insert(usersTable).values({
      email: "admin@example.com",
      name: "Default Super Admin",
      passwordHash,
      role: "super_admin",
      active: true,
      mustChangePassword: true,
    });
    logger.warn("BOOTSTRAP: Seeded initial super_admin account — retrieve temporary password from stderr.");
    process.stderr.write(
      [
        "",
        "========================================================",
        " BOOTSTRAP: Initial super_admin account created",
        `   Email:    admin@example.com`,
        `   Password: ${bootstrapPassword}`,
        " Log in immediately and change this password.",
        " This message will not appear again.",
        "========================================================",
        "",
      ].join("\n"),
    );
  }

  const existingChannels = await db.select({ id: channelsTable.id }).from(channelsTable).limit(1);
  if (existingChannels.length === 0) {
    await db.insert(channelsTable).values(
      DEFAULT_CHANNELS.map((name) => ({ name, active: true, systemDefault: true })),
    );
  }

  const existingTypes = await db
    .select({ id: campaignTypesTable.id })
    .from(campaignTypesTable)
    .limit(1);
  if (existingTypes.length === 0) {
    await db.insert(campaignTypesTable).values(
      DEFAULT_CAMPAIGN_TYPES.map((name) => ({ name, active: true, systemDefault: true })),
    );
  }

  const existingUnits = await db.select({ id: owningUnitsTable.id }).from(owningUnitsTable).limit(1);
  if (existingUnits.length === 0) {
    await db.insert(owningUnitsTable).values(
      DEFAULT_OWNING_UNITS.map((name) => ({ name, active: true, systemDefault: true })),
    );
  }

  const existingReasons = await db
    .select({ id: suppressionReasonCodesTable.id })
    .from(suppressionReasonCodesTable)
    .limit(1);
  if (existingReasons.length === 0) {
    await db.insert(suppressionReasonCodesTable).values(
      DEFAULT_SUPPRESSION_REASONS.map((r) => ({
        name: r.name,
        description: r.description,
        active: true,
        systemDefault: true,
      })),
    );
  }

  const existingTemplates = await db
    .select({ id: thresholdTemplatesTable.id })
    .from(thresholdTemplatesTable)
    .limit(1);
  if (existingTemplates.length === 0) {
    await db.insert(thresholdTemplatesTable).values([
      {
        name: "Standard cap — 3 in 14 days",
        description: "Default communication-fatigue limit across all channels.",
        maxTouchpoints: 3,
        windowDays: 14,
        scope: "all",
        actionMode: "flag",
        active: true,
        systemDefault: true,
      },
      {
        name: "Email saturation — 2 in 7 days",
        description: "Prevent more than two email touches per week.",
        maxTouchpoints: 2,
        windowDays: 7,
        scope: "all",
        actionMode: "flag",
        active: true,
        systemDefault: true,
      },
      {
        name: "Phonathon recency — 1 in 30 days",
        description: "Avoid back-to-back phone outreach within a month.",
        maxTouchpoints: 1,
        windowDays: 30,
        scope: "all",
        actionMode: "manual",
        active: true,
        systemDefault: true,
      },
    ]);
  }

  const existingSettings = await db.select().from(appSettingsTable).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(appSettingsTable).values({
      id: 1,
      fiscalYearStartMonth: 7,
      fiscalYearStartDay: 1,
      googleSheetImportEnabled: false,
      retentionDeleteEnabled: false,
      globalThresholdsEnabled: false,
    });
  }
}
