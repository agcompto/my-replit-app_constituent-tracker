# Phase 0 Security Review

Date: 2026-06-01  
Scope: `artifacts/api-server/src/routes/`, `artifacts/api-server/src/lib/auth.ts`, `artifacts/api-server/src/lib/recentAuth.ts`, `artifacts/api-server/src/lib/rateLimit.ts`, `artifacts/api-server/src/routes/exports.ts`, `artifacts/api-server/src/routes/ai.ts`, and `artifacts/api-server/src/routes/aiConstituents.ts`.

## Executive Summary

Phase 0 review found that the API already uses strong baseline controls: session-backed authentication, role checks for privileged areas, recent-auth middleware for high-risk administrative actions, campaign ownership checks, Zod validation, audit logging, AI throttling, export quotas, and sensitive download headers.

The primary Phase 0 code remediation completed in this pass is the campaign ZIP export runtime fix: `campaigns.ts` no longer calls the `archiver` import namespace object and instead instantiates the exported `ZipArchive` class through a small local factory.

## Pre-Coding Findings and Implementation Plan

### Repository Structure Reviewed

- `artifacts/api-server/` contains the Express API, route modules, auth helpers, AI integration, export builders, and server build script.
- `artifacts/touchpoint-planner/` contains the React/Vite frontend and shared UI components.
- `lib/db/` contains Drizzle schema definitions and generated build output.
- `lib/api-zod/` contains request/response validation schemas used by route modules.
- `docs/` contains prior security, accessibility, architecture, and performance planning artifacts.

### Current Route/Auth Patterns Reviewed

Observed patterns:

- `requireAuth` enforces authenticated sessions.
- `requireRole(...)` enforces authenticated sessions plus role membership.
- `requireRecentAuth` is layered on top of auth/role middleware for destructive or privileged operations.
- `canMutateCampaign` is the primary ownership gate for campaign-scoped mutations and campaign-scoped export/download operations.
- Route modules use `safeParse` / Zod validation for route params, bodies, and query input.
- Route modules call `audit(...)` for material changes and sensitive download events.

### Database Schema Reviewed

The current schema includes users, sessions, password setup/reset tokens, TOTP recovery codes, lookup tables, campaigns, campaign type links, audience donors, touches, touchpoints, suppressions, thresholds, audit log, export jobs, app settings, AI usage, saved searches, report views, retention config, and related operational tables.

No database migration is required for this Phase 0 documentation and runtime import fix.

### UI Component Patterns Reviewed

The frontend uses reusable UI primitives under `artifacts/touchpoint-planner/src/components/ui/`, route pages under `artifacts/touchpoint-planner/src/pages/`, React Query for API state, Wouter routing, and a global app shell in `App.tsx` / `AppLayout.tsx`.

### Email / Notification Infrastructure Reviewed

Current user-facing email flows are limited to account setup/reset style operations. Phase 2 weekly internal digest and Phase 14 notifications are future roadmap work and should be designed as internal staff notifications only, never constituent outreach.

### Audit Logging Patterns Reviewed

Observed audit actions include login/TOTP/account events, campaign lifecycle events, bulk campaign operations, export/download events, lookup/admin changes, AI usage actions, and suppression/threshold/touch changes. This pattern should be reused for future calendar, digest, saved audience, and activity timeline work.

### Implementation Plan for This Pass

1. Document route-level security review findings.
2. Document export controls and remaining export risks.
3. Document AI data-boundary findings.
4. Document secret remediation expectations and future prevention.
5. Fix the `archiver` namespace-call runtime warning in `campaigns.ts`.
6. Add accessibility and performance review artifacts needed before product expansion.
7. Run typecheck/build checks and record any environment or dependency warnings.

### Recommended PR Breakdown After Phase 0

1. **Phase 0A — Security documentation and runtime stability**: this pass.
2. **Phase 0B — Route-specific authorization remediation**: focused fixes for any route-level gaps found below.
3. **Phase 0C — Export hardening tests**: integration tests for quota, ownership, CSV injection, and row caps.
4. **Phase 0D — AI boundary tests**: tests that prove PII-like payloads are blocked and aggregate-only route payloads are used.
5. **Phase 0E — Accessibility/performance remediation**: route splitting, table accessibility, keyboard review, and dashboard performance fixes.

### Migrations Identified

None for this pass.

### Key Risks Identified

- In-memory rate limits are per-process and should move to shared storage before horizontal scaling or public integration endpoints.
- Export ownership relies on campaign mutation permission today; future read-only/viewer/export permissions need a granular permission matrix.
- Some public/tokenized future features will require explicit logging redaction and noindex/embed policy exceptions.
- AI campaign-brief extraction accepts staff free text after PII screening; product copy should continue to frame this as operational setup extraction, not communication authoring.

## Route Review Matrix

| Route file | Auth / role posture | Ownership / scope posture | Audit posture | Notes / follow-up |
| --- | --- | --- | --- | --- |
| `admin.ts` | Super-admin role and recent auth | Admin-only account action | Audited | Retain recent-auth requirement for password resets. |
| `ai.ts` | Authenticated AI routes | Campaign AI routes load campaign-scoped operational facts | Audited plus usage logged | Continue aggregate-only AI payloads; do not add outbound copy generation. |
| `aiConstituents.ts` | Authenticated | Uses donor route param for lookup but excludes constituent ID from model facts | Audited plus usage logged | Keep model payload to metadata/counts/timeline fields only. |
| `audience.ts` | Authenticated | Campaign mutation checks for upload; campaign read for audience retrieval | Audited for upload | Add explicit read ownership checks if viewer roles become scoped. |
| `audit.ts` | Admin/super-admin role | Global audit visibility | Export route present | Keep export CSV restricted to admins and consider recent-auth for broad audit exports. |
| `auth.ts` | Mix of public login/setup helpers and authenticated account routes | Session-bound account actions | Audited | Existing login, TOTP, reauth, forgot-password, and logout controls are strong. |
| `authSaml.ts` | Public SAML metadata/login/ACS plus super-admin config endpoints | SAML state/replay protections | Audited | Keep SAML ACS/login rate limits enabled. |
| `campaigns.ts` | Authenticated campaign routes; admin role for some destructive/bulk flows | `canMutateCampaign` used on mutations/bulk exports | Audited | ZIP runtime import fixed in this pass. |
| `donors.ts` | Authenticated | Constituent/touchpoint lookup by donor ID | Export route present | Add granular viewer/export permission before broadening roles. |
| `exports.ts` | Authenticated | `canMutateCampaign` before finalize/export/download/manifest | Audited | Export protections are mostly present; see export review below. |
| `health.ts` | Public healthz; privileged system status | N/A | N/A | Keep system status privileged. |
| `healthCheck.ts` | Authenticated | Campaign health route | No audit for read | Acceptable for read; add audit if health results become sensitive exports. |
| `lookups.ts` | Reads authenticated; writes admin/super-admin | Lookup scope global | Writes audited | Future reference-data manager should add archive/reassign semantics. |
| `me.ts` | Authenticated | Current-user preferences only | No audit | Acceptable for low-risk preferences. |
| `passwordSetup.ts` | Public token routes | Token-hash verification | Completion audited through direct audit insert | Maintain token redaction in logs. |
| `reports.ts` | Authenticated/admin role per report | Global report scope | No audit | Add audit for exports and high-sensitivity reports. |
| `retention.ts` | Super-admin role and recent auth for mutations | Global retention controls | Review recommended | Consider auditing retention schedule edits/run-now if not already captured downstream. |
| `savedConstituentSearches.ts` | Authenticated | User-owned saved searches | Writes audited | Keep ownership filters for all reads/mutations. |
| `savedReportViews.ts` | Authenticated | User-owned saved report views | Writes audited | Keep ownership filters for all reads/mutations. |
| `seeds.ts` | Authenticated | Campaign mutation checks | Writes audited | Good pattern for campaign-owned children. |
| `settings.ts` | Admin/super-admin | Global app/SAML/retention settings | Writes audited | Consider recent-auth for SAML/retention destructive settings. |
| `suppressionReasons.ts` | Reads authenticated; writes admin/super-admin | Global suppression reasons | Writes audited | Future reference-data manager should preserve historical labels. |
| `suppressions.ts` | Authenticated | Campaign mutation checks | Writes audited | Good pattern for campaign-owned children. |
| `thresholdTemplates.ts` | Reads authenticated; writes admin/super-admin | Global template scope; campaign apply uses campaign mutation checks | Writes/apply audited | Good template/application split. |
| `thresholds.ts` | Authenticated | Campaign mutation checks | Writes/overrides audited | Keep override reasons operational, not copy generation. |
| `touches.ts` | Authenticated | Campaign mutation checks | Writes/date changes audited | Good pattern for campaign-owned children. |
| `users.ts` | Admin/super-admin role and recent auth on high-risk actions | User admin scope | Writes audited | Keep recent-auth for role changes, delete, resets, and TOTP reset. |

## Export Review: `artifacts/api-server/src/routes/exports.ts`

| Control | Status | Evidence / notes |
| --- | --- | --- |
| Auth required | Present | Export preview/finalize/export/download/manifest routes use `requireAuth`. |
| Authorization required | Present | Finalize/export/download/manifest use `canMutateCampaign`; preview should be reviewed if read permissions become scoped. |
| Audit logging | Present | Finalize, export, CSV download, and manifest download audit key events. |
| Field restrictions | Present for current exports | CSV download emits `donor_id` only; manifest builder should remain field-limited. |
| Scope validation | Present | IDs are parsed by Zod or explicit numeric parsing; campaign/touch filters constrain rows. |
| Filename safety | Present | `setSensitiveDownloadHeaders` replaces CR/LF/quotes/backslashes before `Content-Disposition`. |
| Rate limiting | Present for export creation | `checkExportQuota` limits export creation. Download/manifest routes audit but do not consume quota; consider quota if repeated downloads become a risk. |
| Export size controls | Present | `MAX_EXPORT_ROWS` caps generated export rows. |
| Spreadsheet formula injection prevention | Present for donor IDs | Donor IDs are emitted as `="id"` and prefixed with BOM. Keep formula escaping in shared CSV builders. |

## AI Boundary Review: `ai.ts` and `aiConstituents.ts`

### Confirmed Allowed Payload Pattern

AI routes send operational facts such as:

- aggregate counts
- campaign metrics
- touch/channel/type metadata
- risk and threshold summaries
- anonymized constituent communication timelines
- operational setup extraction from staff-provided brief text after PII screening

### Confirmed Blocked / Not Sent Pattern

The reviewed AI routes are designed not to send:

- email addresses
- phone numbers
- mailing addresses
- passwords/tokens/credentials
- unrestricted full constituent records
- raw donor IDs in constituent-summary model facts

`assertNoPii(...)` is used as defense in depth before model calls. It blocks common email, phone, SSN, and long numeric constituent-ID patterns.

### AI Boundary Follow-Up

- Expand automated tests for `assertNoPii(...)` and for each AI route prompt builder.
- Treat free-text staff briefs as high risk: keep length caps, PII screening, and operational-only prompt wording.
- Continue to prohibit email/SMS/solicitation/stewardship copy generation.
- Keep AI advisory only; never perform irreversible actions automatically from AI output.

## Findings

### SR-001 — ZIP export used an ESM namespace as a callable

Severity: High runtime stability

`campaigns.ts` imported `archiver` as a namespace object and called it as a function. With `archiver@8` ESM exports, that can crash at runtime. This pass replaces the callable namespace usage with a local `createZipArchive(...)` factory that instantiates the exported `ZipArchive` class.

Status: Remediated in this pass.

### SR-002 — Export preview read scope should be revisited with granular roles

Severity: Medium future-risk

`GET /campaigns/:id/preview` requires authentication and returns aggregate preview data. Today the app has broad authenticated access patterns, but future viewer/workspace permissions should add explicit campaign read/export authorization separate from mutation authorization.

Status: Documented follow-up.

### SR-003 — In-memory quotas are acceptable for single instance but weak under horizontal scale

Severity: Medium future-risk

Rate limiting and export quotas are in-memory. They are useful in a single-instance deployment but become per-replica when horizontally scaled.

Status: Documented follow-up; migrate to shared Redis/Postgres-backed counters before multi-replica production or Integration Hub/API key features.

### SR-004 — Route-level audit coverage is strong for writes but mixed for high-sensitivity reads

Severity: Low-to-medium

Most writes and downloads are audited. Some sensitive reads/reports are not audited. This may be acceptable now, but activity timeline and permission matrix work should define which reads need audit events.

Status: Documented follow-up.

### SR-005 — Future tokenized/public routes need a redaction and noindex pattern

Severity: Medium future-risk

Calendar feed tokens, public calendar pages, webhooks, API keys, and embeds are future work. These must not leak tokens through logs, referrers, search indexing, or broad CSP/frame policy changes.

Status: Documented follow-up.

## Security Considerations for Future Phases

- Calendar feeds must be private by default, tokenized, revocable, noindexed when public, read-only, and audited for administrative changes.
- Weekly digests must be internal staff notifications only and must not send constituent communications.
- Export Center must implement explicit export permissions, quota, audit logging, field allowlists, scope validation, row caps, and CSV formula injection protection.
- Integration Hub must use scoped API keys, redaction, key rotation, rate limits, audit logging, and no unrestricted database access.

## Manual Security Test Steps

1. Log in as a standard user and verify campaign mutation/export routes reject campaigns not owned by the user.
2. Log in as admin/super-admin and verify privileged admin routes work only with proper role and recent authentication where required.
3. Attempt export creation repeatedly and confirm quota responses include `429` and `Retry-After`.
4. Export a CSV containing numeric donor IDs and confirm values open as literal text in spreadsheet software.
5. Attempt AI requests containing email/phone-like input and confirm the API rejects the request before provider submission.
6. Generate bulk campaign summary ZIP and audience CSV ZIP exports and confirm archives download/open without an archiver runtime crash.

## Guardrail Confirmation

No communication-authoring functionality was added. The reviewed and changed code supports operations, governance, reporting, risk review, and export/download stability only.
