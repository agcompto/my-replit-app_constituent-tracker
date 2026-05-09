import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─────── Users
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("standard"), // standard | admin | super_admin
  active: boolean("active").notNull().default(true),
  piiAcknowledgedAt: timestamp("pii_acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─────── Sessions (connect-pg-simple)
export const sessionsTable = pgTable(
  "session",
  {
    sid: text("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (t) => ({ expireIdx: index("IDX_session_expire").on(t.expire) }),
);

// ─────── Lookup tables
export const campaignTypesTable = pgTable("campaign_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  systemDefault: boolean("system_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  systemDefault: boolean("system_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────── Campaigns
export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  // draft | uploaded | previewed | finalized | exported | archived | voided
  owningUnit: text("owning_unit"),
  submittedByUserId: integer("submitted_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  intendedSendStartDate: date("intended_send_start_date"),
  audienceDescription: text("audience_description"),
  salesforceCampaignId: text("salesforce_campaign_id"),
  internalNotes: text("internal_notes"),
  // Audience upload stats
  originalRowCount: integer("original_row_count").notNull().default(0),
  blankRowCount: integer("blank_row_count").notNull().default(0),
  validIdCount: integer("valid_id_count").notNull().default(0),
  uniqueIdCount: integer("unique_id_count").notNull().default(0),
  duplicateIdCount: integer("duplicate_id_count").notNull().default(0),
  rejectedIdCount: integer("rejected_id_count").notNull().default(0),
  extraColumnsIgnored: boolean("extra_columns_ignored").notNull().default(false),
  rejectedSamples: jsonb("rejected_samples").$type<string[]>().default([]),
  duplicateSamples: jsonb("duplicate_samples").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

export const campaignTypeLinksTable = pgTable(
  "campaign_type_links",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    campaignTypeId: integer("campaign_type_id")
      .notNull()
      .references(() => campaignTypesTable.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.campaignId, t.campaignTypeId] }) }),
);

// ─────── Audience donor IDs
export const audienceDonorsTable = pgTable(
  "audience_donors",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    donorId: text("donor_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.campaignId, t.donorId] }),
    donorIdx: index("audience_donor_id_idx").on(t.donorId),
  }),
);

// ─────── Touches
export const touchesTable = pgTable(
  "touches",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    touchName: text("touch_name").notNull(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channelsTable.id),
    campaignTypeId: integer("campaign_type_id")
      .notNull()
      .references(() => campaignTypesTable.id),
    sendDate: date("send_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("touches_campaign_idx").on(t.campaignId),
    sendDateIdx: index("touches_send_date_idx").on(t.sendDate),
  }),
);

// ─────── Thresholds
export const thresholdsTable = pgTable("thresholds", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  maxTouchpoints: integer("max_touchpoints").notNull(),
  windowDays: integer("window_days").notNull(),
  scope: text("scope").notNull(), // all | channel | campaign_type | channel_and_type
  channelId: integer("channel_id").references(() => channelsTable.id),
  campaignTypeId: integer("campaign_type_id").references(() => campaignTypesTable.id),
  actionMode: text("action_mode").notNull(), // track | flag | remove | manual
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const thresholdOverridesTable = pgTable(
  "threshold_overrides",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    donorId: text("donor_id").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.campaignId, t.donorId] }) }),
);

// ─────── Suppressions
export const suppressionsTable = pgTable("suppressions", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), // all | channel | campaign_type | touch
  channelId: integer("channel_id").references(() => channelsTable.id),
  campaignTypeId: integer("campaign_type_id").references(() => campaignTypesTable.id),
  touchId: integer("touch_id").references(() => touchesTable.id, {
    onDelete: "cascade",
  }),
  reason: text("reason"),
  notes: text("notes"),
  donorIds: jsonb("donor_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
});

// ─────── Seeds
export const seedGroupsTable = pgTable("seed_groups", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), // all | channel | touch
  channelId: integer("channel_id").references(() => channelsTable.id),
  touchId: integer("touch_id").references(() => touchesTable.id, {
    onDelete: "cascade",
  }),
  donorIds: jsonb("donor_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
});

// ─────── Touchpoint history (one row per donor per touch when exported)
export const touchpointsTable = pgTable(
  "touchpoints",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    touchId: integer("touch_id")
      .notNull()
      .references(() => touchesTable.id, { onDelete: "cascade" }),
    donorId: text("donor_id").notNull(),
    channelId: integer("channel_id").notNull(),
    campaignTypeId: integer("campaign_type_id").notNull(),
    sendDate: date("send_date").notNull(),
    isSeed: boolean("is_seed").notNull().default(false),
    countsTowardThreshold: boolean("counts_toward_threshold").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    donorIdx: index("touchpoints_donor_idx").on(t.donorId),
    sendDateIdx: index("touchpoints_send_date_idx").on(t.sendDate),
    campaignIdx: index("touchpoints_campaign_idx").on(t.campaignId),
  }),
);

// ─────── Export jobs
export const exportJobsTable = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  touchId: integer("touch_id").references(() => touchesTable.id, {
    onDelete: "cascade",
  }),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  seedCount: integer("seed_count").notNull().default(0),
  suppressedCount: integer("suppressed_count").notNull().default(0),
  exportedByUserId: integer("exported_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────── Upload jobs
export const uploadJobsTable = pgTable("upload_jobs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // paste | google_sheet
  validCount: integer("valid_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  uploadedByUserId: integer("uploaded_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────── Audit log
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ createdIdx: index("audit_log_created_idx").on(t.createdAt) }),
);

// ─────── App settings (single row id=1)
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(7),
  fiscalYearStartDay: integer("fiscal_year_start_day").notNull().default(1),
  googleSheetImportEnabled: boolean("google_sheet_import_enabled").notNull().default(false),
  retentionDeleteEnabled: boolean("retention_delete_enabled").notNull().default(false),
  globalThresholdsEnabled: boolean("global_thresholds_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Suppress unused warning
void uniqueIndex;
