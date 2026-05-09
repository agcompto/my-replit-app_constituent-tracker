import bcrypt from "bcryptjs";
import { db, usersTable, campaignTypesTable, channelsTable, appSettingsTable } from "@workspace/db";
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

export async function seedDefaults(): Promise<void> {
  // Default super admin
  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    const passwordHash = await bcrypt.hash("changeme123", 10);
    await db.insert(usersTable).values({
      email: "admin@example.com",
      name: "Default Super Admin",
      passwordHash,
      role: "super_admin",
      active: true,
    });
    logger.info("Seeded default super_admin (admin@example.com / changeme123)");
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
