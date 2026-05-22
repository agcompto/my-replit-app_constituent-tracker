# Constituent Touchpoint Planner

Internal NC State University Advancement tool for planning donor communication touchpoints, checking cumulative volume against rolling-window thresholds, and exporting one-Donor-ID-per-row CSV send lists with strict no-PII handling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from `PORT`)
- `pnpm --filter @workspace/touchpoint-planner run dev` — web frontend
- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes
- Required env: `DATABASE_URL`, `SESSION_SECRET`
- Optional: `APP_PUBLIC_URL` — base URL embedded in setup links (e.g. `https://planner.advancement.ncsu.edu`). Falls back to `REPLIT_DOMAINS`/`localhost` so dev still works.
- Optional: `PASSWORD_HIBP_DISABLED=1` — escape hatch for offline test/dev that skips the Have-I-Been-Pwned k-anonymity breach check.
- Optional bootstrap: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` — override the seeded super-admin identity.
- Optional email: `RESEND_API_KEY`, `EMAIL_FROM` — when both are set, the server sends invite/reset/forgot-password links via Resend in addition to returning them in the admin API response. With Resend's test sender (`onboarding@resend.dev`) no domain verification is required for dev/staging; for production pin a verified sending domain. Email is best-effort — failures never block the admin flow, and the setup URL is still returned in the response so the admin can deliver it manually.

## Microsoft Entra SAML SSO

### Entra app registration

1. **Enterprise application** → Create your own → SAML SSO.
2. **Identifier (Entity ID):** SP metadata URL or value from Settings → Single Sign-On (e.g. `https://<host>/api/auth/saml/metadata`).
3. **Reply URL (ACS):** `https://<host>/api/auth/saml/acs`
4. **Sign-on URL:** `https://<host>/api/auth/saml/login` (optional; users can start from the app login page).
5. **Attributes & Claims:** `emailaddress`, `givenname`, `surname`, `name` (and **Groups** as Group ID, limited to groups assigned to this app).
6. **Federation Metadata XML** URL → paste into Settings → IdP metadata URL.
7. Copy the signing certificate **SHA-256 fingerprint** into `SAML_IDP_CERT_FINGERPRINT_SHA256` (comma-separated for rollover).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `SAML_IDP_CERT_FINGERPRINT_SHA256` | Comma-separated pinned SHA-256 cert fingerprints (required for ACS) |
| `SAML_IDP_METADATA_HOST_ALLOWLIST` | Optional comma-separated host suffixes for metadata fetch (SSRF guard) |
| `SAML_SP_ENTITY_ID` | Override SP entity ID (default: `{APP_PUBLIC_URL}/api/auth/saml/metadata`) |
| `SAML_ACS_URL` | Override ACS URL (default: `{APP_PUBLIC_URL}/api/auth/saml/acs`) |

### Settings (super_admin)

- Enable SAML, metadata URL, JIT email domains (`ncsu.edu`, …).
- Paste three Entra security group **Object IDs** into super_admin / admin / standard maps.
- Toggle **group sync** to map roles on each SAML login (most-privileged wins).
- **SAML health** panel: metadata loaded, fingerprint match, cert expiry; **Refresh now** forces metadata reload.

### Cert rollover

1. Add the new cert fingerprint to `SAML_IDP_CERT_FINGERPRINT_SHA256` (keep old until cutover).
2. Refresh metadata in Settings.
3. Confirm health shows `fingerprintMatches: true`.
4. Remove old fingerprint after Entra retires the old cert.

### SAML health (`GET /api/healthz`)

Returns `saml.enabled`, `metadataLoaded`, `fingerprintMatches`, `lastMetadataRefreshAt`, `certExpiresAt`, `failureReason`.

When email is **not** configured the system behaves as before: account-setup, admin-issued password-reset, and "resend invite" flows return a one-time setup URL to the calling admin in the API response, and the admin hands the link to the user out-of-band. When email **is** configured the same link is also emailed to the user; the API response gains an `emailed: boolean` field so the admin UI can show "Email sent to <user>" and offer the copy-link as a backup channel.

## Self-service forgot-password

`POST /auth/forgot-password { email }` lets a user request their own reset link. The endpoint is **enumeration-safe** (always 200 with a generic message, regardless of whether the email matched) and is **per-IP rate-limited** to 5 / 15 min via `checkForgotPasswordPerIp`. Timing parity is achieved by **decoupling** work from the response: the response is scheduled on a fixed floor (~750ms + small jitter) before any branching, and matched-account work (token issue + Resend call + audit write) runs in a background promise whose latency cannot influence the HTTP response — so an attacker cannot infer account existence from response time even when the upstream email provider is slow. On a real, active match the background task issues a 2-hour single-use reset token (revoking any prior live reset token), emails the link via Resend if configured, and writes a `self_service_password_reset_requested` audit row. If `RESEND_API_KEY` is unset the route still 200s but cannot deliver the link — users must contact an admin in that deployment. The "Forgot your password?" link on the login page routes to `/forgot-password`.

## Bootstrap super-admin (dev / fresh DB)

On first startup against an empty database, a `super_admin` account is created (default `admin@example.com`) with **no password**. A 48-hour single-use setup link is generated and printed once to stderr (the only intended log reader is the operator running the boot). Open the link, choose a password, and sign in.

### One-shot bootstrap-admin recovery (forgotten prod password)

If the bootstrap super-admin's password has been lost (e.g. on a deployed environment where the original first-boot stderr line is gone), set `BOOTSTRAP_RESET_ADMIN=1` in that environment's secrets and redeploy. On boot, `seed.ts` will look up the bootstrap admin (by `BOOTSTRAP_ADMIN_EMAIL` or default `admin@example.com`), clear its lockout state, mint a fresh 2-hour single-use reset token, and print the setup URL once to stderr — same posture as the first-boot bootstrap link. Refuses to run if the matching user is missing or not `super_admin`.

**Operational caveats:**
- The reset is reissued on every boot while the env var is set, and each new token revokes the previous one. If the deployment restarts (autoscale spin-up, crash recovery, etc.) between when you copy the link and when you click it, your link will already be dead. Always grab the link from the **most recent** stderr block.
- After successfully signing in with the new password, **unset `BOOTSTRAP_RESET_ADMIN` and redeploy promptly**. Leaving it set means every subsequent restart mints another super-admin reset link in the logs and clears any lockout state.

## Password setup (no-temp-password flow)

Admins never see, type, or transmit user passwords. Creating a user (`POST /users`), resetting one (`POST /users/:id/reset-password`), and `POST /users/:id/resend-invite` all issue a one-time setup token via `lib/passwordSetupTokens.ts` (32 random bytes → base64url, stored as SHA-256). Admin-issued invite/resend links expire in 48 hours; admin-triggered password-reset links expire in 2 hours. Issuing a fresh link revokes any prior live link of the same kind. Setup uses two routes:

- `GET /password-setup/:token` — returns the email/name/kind/expiry so the page can render.
- `POST /password-setup/:token/complete` — validates the new password (`lib/passwordPolicy.ts`: 12–128 chars, letter + non-letter/non-whitespace char, not the email/name, not in HIBP) and atomically consumes the token, sets the new password, clears lockout state, and writes the audit row in a single transaction.

Responses to `POST /users`, `POST /users/:id/reset-password`, and `POST /users/:id/resend-invite` always return `{ setupUrl, expiresAt }` (plus `user` on create). The admin UI displays the URL with a copy button so the admin can deliver it to the user through a secure channel.

## Two-factor authentication (TOTP)

Admin and super-admin roles **must** complete a TOTP second factor at sign-in; standard users may opt in from `Settings → My Security`. The flow:

- `POST /auth/login` returns `{ requiresTotp: true, enrollmentRequired: bool }` for admin/super_admin instead of the SessionUser. The session has `pendingTotpUserId` parked but **no** `userId` — the user is not yet logged in. Pending state expires after 5 minutes.
- `POST /auth/login/totp { code }` accepts a 6-digit TOTP **or** a 10-character recovery code (`XXXXX-XXXXX`). On success the session is regenerated, `userId` set, and the SessionUser body returned. Failures count toward the same per-user lockout as `/auth/login` (10 / 15min).
- First-time required users go through enrollment in the same flow: the frontend calls `POST /auth/totp/enroll/start` (returns `otpauthUri`, `qrDataUrl`, `secret`; secret is held only in the session as an encrypted candidate). After scanning the QR, `POST /auth/totp/enroll/verify { code }` persists the secret, mints 10 single-use recovery codes, and — when called during pending login — completes the login automatically.
- Settings: `GET /auth/totp/status`, `POST /auth/totp/recovery-codes/regenerate` (re-auth gated), `POST /auth/totp/disable` (re-auth gated; admin/super_admin cannot self-disable — they must downgrade or have a super_admin reset).
- Super-admin recovery: `POST /users/:id/totp/reset` (re-auth gated) clears the target's enrollment and recovery codes, forcing re-enrollment on their next sign-in.

Storage & crypto: `users.totpSecretEncrypted` (AES-256-GCM, key = scrypt(SESSION_SECRET, "ctp-totp-v1", 32)) and `users.totpEnrolledAt`. Recovery codes live in `totp_recovery_codes` (bcrypt hash of normalized code, per-row salt, cost 10; raw codes shown exactly once and downloadable as a .txt). otplib v13 functional API with `period=30s`, `epochTolerance=30s` (±1 step ≈ 90s drift). Rotating `SESSION_SECRET` invalidates every enrolled secret — operator must reset all enrollments.

Audit actions: `totp_enrolled`, `totp_disabled`, `totp_used`, `recovery_codes_regenerated`, `recovery_code_used`, `totp_reset`.

## Login lockout

- Failed sign-ins are tracked persistently per user (`users.failed_login_attempts`, `users.locked_until`) via `lib/lockout.ts`. After **10 consecutive failures** the account is locked for **15 minutes**; successful sign-in clears the counters. The login route returns `429` with a `Retry-After` header while locked. Pre-auth IP-based rate limiting in `lib/rateLimit.ts` still applies.

## Super-admin deletes

`DELETE /users/:id` and `DELETE /campaigns/:id` are super-admin-only. Deleting a user reassigns ownership of campaigns, exports, and uploads to the calling super-admin, nulls non-essential creator FKs, refuses self-deletion and the last super-admin, and writes an audit entry. Deleting a campaign cascades all of its audience/touch/threshold/suppression/seed/export rows; audit-log entries persist.

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- API: Express 5 + express-session (PG-backed) + bcryptjs
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`) + drizzle-zod
- API contract: OpenAPI → Orval-generated React Query hooks + Zod schemas
- Web: React + Vite + wouter + TanStack Query + shadcn/ui + Recharts

## Where things live

- DB schema (single source of truth): `lib/db/src/schema/index.ts`
- API contract (single source of truth): `lib/api-spec/openapi.yaml`
- Generated zod: `lib/api-zod/src/generated/api.ts`
- Generated hooks: `lib/api-client-react/src/generated/`
- API routes: `artifacts/api-server/src/routes/*`
- Threshold + export logic: `artifacts/api-server/src/lib/threshold.ts`
- Donor ID parsing/normalization + CSV escape: `artifacts/api-server/src/lib/donor.ts`
- Password tokens / policy / lockout: `artifacts/api-server/src/lib/passwordSetupTokens.ts`, `passwordPolicy.ts`, `lockout.ts`
- Setup URL building: `artifacts/api-server/src/lib/appUrl.ts`
- Web app: `artifacts/touchpoint-planner/src/` (setup-link page: `pages/setup-password.tsx`, forgot-password page: `pages/forgot-password.tsx`)
- Email transport: `artifacts/api-server/src/lib/email.ts` (fetch-based Resend wrapper, `sendInviteEmail` / `sendResetEmail` / `emailEnabled`)

## Hardening (May 2026 bundle)

- **HTTP headers** — `helmet` is enabled with a strict API CSP (`default-src 'none'`, `frame-ancestors 'none'`), HSTS 1y/includeSubDomains, `Referrer-Policy: same-origin`, `nosniff`, `Cross-Origin-Resource-Policy: same-site`, plus the existing `X-Robots-Tag`. `X-Powered-By` is disabled.
- **Body limits** — global `express.json({ limit: "256kb" })`. Only `POST /campaigns/:id/audience` opts into 20mb via a per-route `express.json({ limit: "20mb" })` parser.
- **Session hardening** — `sameSite: "strict"`, `path: "/api"` on the cookie. Per-role TTL: super_admin 4h, others 12h. `req.session.regenerate()` is called on successful login and on `POST /password-setup/:token/complete` to defeat session fixation.
- **Re-auth gate** — `lib/recentAuth.ts` exports `requireRecentAuth` (5-minute window, tracked via `req.session.lastAuthAt`). Wired into `DELETE /users/:id`, `DELETE /campaigns/:id`, and `PATCH /users/:id` when granting `super_admin`. Blocked requests return HTTP 403 with `code: "reauth_required"`.
- **Pre-auth rate limits** — `GET /password-setup/:token` adds a per-IP cap (30 / 15min). Still responds 404 either way to avoid leaking throttle state.
- **Export quota** — `POST /campaigns/:id/export` is capped at 20 / hour / user via `checkExportQuota`. Returns 429 with `code: "export_quota_exceeded"` when exceeded.
- **Audit-log integrity** — Postgres triggers `audit_log_no_update` and `audit_log_no_delete` block `UPDATE`/`DELETE` on `audit_log` even at the DB layer. Installed by `installAuditLogAppendOnlyTrigger()` on every boot (idempotent).
- **Re-auth endpoint** — `POST /auth/reauth { password }` re-verifies the current user's password and bumps `req.session.lastAuthAt`. The frontend's `<ReauthDialog>` is shown automatically when a destructive mutation responds with `code: "reauth_required"`, then retries the original action on success. Failed attempts feed the same per-user lockout as `/auth/login`.
- **Session invalidation on password change** — `POST /auth/change-password` and `POST /password-setup/:token/complete` call `revokeOtherSessionsForUser`, deleting every other session row for that user from the `session` table. A stolen session cookie stops working as soon as the legitimate owner sets a new password.
- **Login enumeration timing parity** — `POST /auth/login` runs a dummy `bcrypt.compare` against a constant hash on the no-such-user / inactive path so response time matches the real-user/wrong-password path. Combined with the existing identical 401/429 message, the endpoint does not leak account existence.
- **Session table pruning** — `connect-pg-simple` is configured with `pruneSessionInterval: 3600` so expired session rows are swept hourly. Without this the `session` table grows unbounded.
- **Setup-link redaction in logs** — `pino-http` request serializer redacts `/password-setup/:token` paths to `/password-setup/[REDACTED]` so a single info log line can't leak a live token.
- **Per-export row cap** — `POST /campaigns/:id/export` rejects (HTTP 413, `code: "export_row_cap_exceeded"`) any export whose total rows across touches exceed `MAX_EXPORT_ROWS` (default 500,000). Layered on top of the 20/hour quota so neither rate nor volume alone yields a near-total dump.
- **Audit-log access gating** — `GET /audit-log` is `admin`/`super_admin` only (was `requireAuth`). The audit feed exposes staff names, roles, and the full timeline of admin actions; it is not safe to expose to standard users. The frontend nav groups "Audit Log" with the other Administration items.
- **Donor-lookup query bounding** — `GET /donors/:donorId/touchpoints` filters its campaign-name resolution with `inArray(campaignsTable.id, campaignIds)` instead of `select().from(campaignsTable)`. Without the filter an authenticated user could amplify a single lookup into a full campaigns-table scan on every call.

## Architecture decisions

- Donor IDs are stored and rendered as 8-character zero-padded strings (text column).
- Per-donor threshold checks combine planned touches in this campaign + historical touchpoints from non-voided campaigns within rolling windows.
- Seed IDs do not count toward thresholds and are excluded from history checks (`isSeed`/`countsTowardThreshold`).
- One CSV per touch on export. CSV cells beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with a single quote (formula injection guard).
- Sessions are PostgreSQL-backed via `connect-pg-simple` on the `session` table, cookie name `ctp.sid`, 12h TTL.

## Product

Three roles: standard, admin, super_admin. Workflow: create campaign → upload audience (paste/CSV) → add touches → configure thresholds → review conflicts (with overrides) → add suppressions/seeds → preview → finalize → export. Reports: dashboard, upcoming volume, high-volume donors, upload/export history. Donor lookup, audit log, settings, and (super_admin) retention deletion.

## Gotchas

- Drizzle `date` columns expect `YYYY-MM-DD` strings, not `Date` objects. Generated Zod schemas coerce dates to `Date` — convert before insert/update.
- Composite libs (`@workspace/db`, `@workspace/api-zod`) are consumed from `dist/`. After editing schema, run `pnpm run typecheck:libs` (or `typecheck`) to refresh declarations before typechecking the API server.
- Always seed `SESSION_SECRET` — the server throws on startup if missing.

## User preferences

_None recorded yet._
