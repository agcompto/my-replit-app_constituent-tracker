import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
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
