import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, campaignTypesTable, channelsTable, owningUnitsTable, appSettingsTable, suppressionReasonCodesTable, thresholdTemplatesTable } from "@workspace/db";
import { logger } from "./logger";
import { generateTempPassword } from "./password";
import { issueSetupToken } from "./passwordSetupTokens";
import { buildSetupPasswordUrl } from "./appUrl";

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

/** Install (or reinstall) a Postgres trigger that blocks UPDATE and DELETE on
 *  the audit_log table. Idempotent — safe to run on every boot. Even an
 *  attacker with full app DB privileges cannot tamper with audit history
 *  without first dropping the trigger, which would itself be visible. */
async function installAuditLogAppendOnlyTrigger(): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION audit_log_append_only()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only (% not allowed)', TG_OP;
    END;
    $$;
  `);
  await db.execute(sql`
    DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
  `);
  await db.execute(sql`
    CREATE TRIGGER audit_log_no_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
  `);
  await db.execute(sql`
    DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
  `);
  await db.execute(sql`
    CREATE TRIGGER audit_log_no_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
  `);
}

export async function seedDefaults(): Promise<void> {
  await installAuditLogAppendOnlyTrigger();
  // Default super admin. The account is created with a random unguessable
  // password the operator never sees — they MUST complete the setup link to
  // sign in. The link itself (NOT a password) is printed once to stderr;
  // the operator hands it to the intended administrator out-of-band. The
  // link is one-time and short-lived, which is materially better than
  // leaking a long-lived plaintext password.
  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    const placeholderHash = await bcrypt.hash(generateTempPassword(32), 10);
    const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com")
      .toLowerCase()
      .trim();
    const [created] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        name: "Default Super Admin",
        passwordHash: placeholderHash,
        role: "super_admin",
        active: true,
        mustChangePassword: true,
      })
      .returning();

    const ttlHours = 48;
    const { rawToken } = await issueSetupToken({
      userId: created.id,
      kind: "invite",
      ttlHours,
    });
    const setupUrl = buildSetupPasswordUrl(rawToken);

    logger.warn(
      "BOOTSTRAP: Initial super_admin account created. Setup link below — open it once to choose a password.",
    );
    process.stderr.write(
      [
        "",
        "========================================================",
        " BOOTSTRAP: Initial super_admin account created",
        `   Email:     ${adminEmail}`,
        `   Setup URL: ${setupUrl}`,
        ` This single-use link expires in ${ttlHours} hours.`,
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
