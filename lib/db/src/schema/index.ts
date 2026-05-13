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
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  piiAcknowledgedAt: timestamp("pii_acknowledged_at", { withTimezone: true }),
  // Persisted lockout state. Counted in addition to the IP-bucket rate-limiter
  // so that a credential-stuffing attacker rotating IPs still gets locked out.
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // TOTP second factor. `totpSecretEncrypted` stores the AES-256-GCM
  // ciphertext (iv:tag:ciphertext, base64url) of the user's shared secret.
  // The plaintext secret never leaves the application — it is only used
  // transiently inside `verifyTotpCode` to recompute the expected code.
  // A user is considered "enrolled" when both columns are non-null.
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnrolledAt: timestamp("totp_enrolled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─────── Password setup / reset tokens
// One-time tokens emailed to users to set their initial password (kind=invite)
// or reset a forgotten password (kind=reset). The `tokenHash` is a SHA-256 of
// the token; the raw token only exists in the email link, so a DB read alone
// can't take over an account.
export const passwordSetupTokensTable = pgTable(
  "password_setup_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull(), // invite | reset
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("password_setup_tokens_user_idx").on(t.userId),
    expiresIdx: index("password_setup_tokens_expires_idx").on(t.expiresAt),
  }),
);

// ─────── TOTP recovery codes
//
// Ten single-use codes are minted at TOTP enrollment and on explicit
// regeneration. Only the SHA-256 hash is stored — the raw codes are
// returned to the user exactly once. Codes are bound to the user; on
// `usedAt != null` they are spent. Reset/regeneration deletes prior rows
// so an attacker who learns an old recovery sheet cannot use it after the
// user has rotated.
export const totpRecoveryCodesTable = pgTable(
  "totp_recovery_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("totp_recovery_codes_user_idx").on(t.userId),
    hashIdx: index("totp_recovery_codes_hash_idx").on(t.codeHash),
  }),
);

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

export const owningUnitsTable = pgTable("owning_units", {
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
    // Audience source: "campaign" (use campaign-wide audience) or "custom" (per-touch list)
    audienceMode: text("audience_mode").notNull().default("campaign"),
    customOriginalRowCount: integer("custom_original_row_count").notNull().default(0),
    customValidIdCount: integer("custom_valid_id_count").notNull().default(0),
    customUniqueIdCount: integer("custom_unique_id_count").notNull().default(0),
    customDuplicateIdCount: integer("custom_duplicate_id_count").notNull().default(0),
    customRejectedIdCount: integer("custom_rejected_id_count").notNull().default(0),
    customExtraColumnsIgnored: boolean("custom_extra_columns_ignored").notNull().default(false),
    // Provenance: how this touch was created. "manual" by default; "ai_cadence"
    // when the touch was inserted from an accepted AI cadence suggestion.
    createdBySource: text("created_by_source").notNull().default("manual"),
    aiModel: text("ai_model"),
    aiGeneratedAt: timestamp("ai_generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("touches_campaign_idx").on(t.campaignId),
    sendDateIdx: index("touches_send_date_idx").on(t.sendDate),
  }),
);

// Per-touch audience overrides (populated only when touchesTable.audienceMode = "custom")
export const touchAudienceDonorsTable = pgTable(
  "touch_audience_donors",
  {
    touchId: integer("touch_id")
      .notNull()
      .references(() => touchesTable.id, { onDelete: "cascade" }),
    donorId: text("donor_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.touchId, t.donorId] }),
    donorIdx: index("touch_audience_donor_id_idx").on(t.donorId),
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

// ─────── Threshold templates (admin-managed default rule library)
// When creating or editing a campaign's thresholds, staff can apply the active
// templates to seed the campaign's rules (a copy is made into thresholdsTable).
export const thresholdTemplatesTable = pgTable("threshold_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  maxTouchpoints: integer("max_touchpoints").notNull(),
  windowDays: integer("window_days").notNull(),
  scope: text("scope").notNull(), // all | channel | campaign_type | channel_and_type
  channelId: integer("channel_id").references(() => channelsTable.id),
  campaignTypeId: integer("campaign_type_id").references(() => campaignTypesTable.id),
  actionMode: text("action_mode").notNull(), // track | flag | remove | manual
  active: boolean("active").notNull().default(true),
  systemDefault: boolean("system_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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

// ─────── Suppression reason codes (admin-managed taxonomy)
export const suppressionReasonCodesTable = pgTable("suppression_reason_codes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  systemDefault: boolean("system_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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
  reasonCodeId: integer("reason_code_id").references(() => suppressionReasonCodesTable.id),
  reason: text("reason"),
  notes: text("notes"),
  donorIds: jsonb("donor_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
});

// ─────── Campaign health-check snapshots
// One row per health check execution (e.g. on export). The latest row per campaign
// surfaces in summary badges; on-demand checks during preview can be ephemeral.
export const campaignHealthChecksTable = pgTable(
  "campaign_health_checks",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // pass | warning | error
    findings: jsonb("findings")
      .$type<
        Array<{
          code: string;
          severity: "info" | "warning" | "error";
          message: string;
          recommendation?: string | null;
          count?: number | null;
        }>
      >()
      .notNull()
      .default([]),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("campaign_health_checks_campaign_idx").on(t.campaignId, t.createdAt),
  }),
);

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
  source: text("source").notNull(), // paste | google_sheet | file
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
  (t) => ({
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
    actorIdx: index("audit_log_actor_idx").on(t.actorUserId),
    actionIdx: index("audit_log_action_idx").on(t.action),
    entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
  }),
);

// ─────── App settings (single row id=1)
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(7),
  fiscalYearStartDay: integer("fiscal_year_start_day").notNull().default(1),
  googleSheetImportEnabled: boolean("google_sheet_import_enabled").notNull().default(false),
  retentionDeleteEnabled: boolean("retention_delete_enabled").notNull().default(false),
  globalThresholdsEnabled: boolean("global_thresholds_enabled").notNull().default(false),
  aiAssistEnabled: boolean("ai_assist_enabled").notNull().default(false),
  // Per-channel weekly volume capacity (channel ID → max touchpoints/week).
  // Used by the saturation heatmap report; an unset/zero value means
  // "no capacity defined" and the report renders a neutral cell.
  channelCapacity: jsonb("channel_capacity")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─────── Saved report views (per-user filter snapshots)
export const savedReportViewsTable = pgTable(
  "saved_report_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    viewType: text("view_type").notNull(), // dashboard | upcoming | high-volume | cohort | yoy
    visibility: text("visibility").notNull().default("private"), // private | org
    filtersJson: jsonb("filters_json").$type<Record<string, unknown>>().notNull().default({}),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("saved_report_views_user_idx").on(t.userId, t.viewType),
    visIdx: index("saved_report_views_visibility_idx").on(t.visibility, t.viewType),
  }),
);

// ─────── AI usage log (per-user budget tracking)
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    route: text("route").notNull(), // audience-summary | suggest-cadence | classify-suppression-reason
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    succeeded: boolean("succeeded").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayIdx: index("ai_usage_user_day_idx").on(t.userId, t.createdAt),
  }),
);

// Suppress unused warning
void uniqueIndex;
