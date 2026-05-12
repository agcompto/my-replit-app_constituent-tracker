# Threat Model

## Project Overview

Constituent Touchpoint Planner is an internal web application for NC State University Advancement staff to plan donor communication campaigns, upload donor ID audiences, compute rolling-window touchpoint thresholds, and export CSV send lists. The production stack is a React/Vite frontend and an Express 5 API backed by PostgreSQL and session-based authentication. The application intentionally handles donor identifiers and staff account data, while the mockup sandbox artifact is development-only and out of scope unless production reachability is demonstrated.

## Assets

- **Staff accounts and sessions** — user emails, password hashes, roles, session cookies, and forced-password-change state. Compromise allows impersonation and privilege escalation.
- **Donor communication data** — donor IDs, campaign audiences, suppressions, seeds, touchpoint history, export job history, and threshold overrides. Exposure reveals sensitive constituent targeting and communication history.
- **Administrative controls** — user management, taxonomy management, settings, reporting access, and retention-deletion controls. Abuse can change who has access, reveal organization-wide donor activity, or permanently delete data.
- **Application secrets and bootstrap state** — `SESSION_SECRET`, database credentials, and any first-run provisioning behavior. Weak bootstrap controls can hand full control to an attacker.
- **Audit records** — actor, action, target, and timestamp data used to support accountability for exports, uploads, settings changes, and destructive actions.

## Trust Boundaries

- **Browser to API** — every client request crosses from an untrusted browser into the Express API. Authentication, authorization, and input validation must be enforced server-side.
- **API to PostgreSQL** — the API has broad read/write access to campaign, donor, session, and admin tables. Injection or broken authorization at the API layer would directly expose or corrupt protected data.
- **Authenticated user to privileged user** — the app has `standard`, `admin`, and `super_admin` roles. Administrative and destructive operations must be gated on the server, not just hidden in the UI.
- **Shared visibility to restricted actions** — the product intentionally allows all staff to view all campaigns, but ownership and role boundaries still apply to campaign mutation, exports, reporting, user administration, and retention operations.
- **Development-only to production** — `artifacts/mockup-sandbox/` is not production. Security scanning should ignore it unless a production code path imports or serves it.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/touchpoint-planner/src/main.tsx`
- **Highest-risk API areas:** `artifacts/api-server/src/routes/auth.ts`, `routes/users.ts`, `routes/settings.ts`, `routes/exports.ts`, `routes/campaigns.ts`, `routes/audience.ts`, `routes/reports.ts`, `routes/donors.ts`, `src/lib/seed.ts`
- **Auth and session code:** `artifacts/api-server/src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/rateLimit.ts`
- **Data-processing logic:** `artifacts/api-server/src/lib/donor.ts`, `src/lib/threshold.ts`, `src/lib/campaigns.ts`
- **Public vs authenticated vs admin:** health and login/logout are public; campaign viewing and donor lookup are authenticated; user management, settings, retention, and system-wide reporting/export boundaries require stronger role or ownership checks.
- **Usually ignore:** `artifacts/mockup-sandbox/**`, generated client/zod output unless it changes runtime enforcement.

## Threat Categories

### Spoofing

The application relies on server-side sessions stored in PostgreSQL and password-based login. Session identifiers must be unpredictable, protected with secure cookie settings in production, and bound to legitimate login flows. Bootstrap behavior must not create predictable privileged accounts that allow an attacker to impersonate a trusted administrator: the seeded super-admin starts with **no password** and is only usable via a one-time setup link printed once to stderr at first boot. Account-setup and password-reset rely on cryptographically random 256-bit tokens (32 bytes from `crypto.randomBytes`, base64url-encoded). Only the SHA-256 of the token is stored; the raw token is returned to the calling admin (or printed at bootstrap) once and never persisted. Tokens are single-use and time-bounded (48 h for invites, 2 h for password resets); issuing a new token of the same kind invalidates any earlier live token. The system intentionally does not send email — admins deliver setup URLs to users out-of-band — which removes the entire forgot-password attack surface (no public email-based enumeration oracle, no email-provider trust dependency, no inbound bearer credentials in third-party mailbox storage). Password-based sign-in is throttled by per-user lockout (10 consecutive failures → 15-minute lock, persisted in `users.locked_until`) on top of per-IP rate limiting, raising the cost of credential-stuffing and brute-force attacks. Self-chosen passwords are validated against length, composition, and the HIBP k-anonymity breach corpus (only the SHA-1 prefix leaves the host) before being accepted.

### Tampering

Authenticated users can create campaigns, upload audiences, define thresholds, add suppressions and seeds, finalize campaigns, and export touchpoint history. The API must validate all request bodies and must ensure users can only modify data they are authorized to change. Administrative settings and retention actions must remain restricted to the intended roles.

### Repudiation

Exports, uploads, settings changes, user administration, and destructive retention operations materially affect institutional data. These actions must produce trustworthy audit records tied to the acting user and timestamp so that privileged activity can be investigated later.

### Information Disclosure

The system stores and returns donor IDs, campaign metadata, touchpoint history, reporting aggregates, and staff account details. Shared campaign visibility is intentional, but reporting feeds, export downloads, audit-style operational history, and any donor-level data must not leak beyond the role or ownership model defined by the product requirements. Logs and bootstrap messages must not disclose secrets or sensitive credentials. There is no public forgot-password endpoint — password resets are admin-issued only — which closes the most common email-enumeration oracle. Password-setup token validation treats unknown, expired, consumed, or inactive-user tokens identically to avoid creating a token oracle.

### Denial of Service

Audience upload and export flows can process large donor lists and write many database rows. The application must keep request sizes bounded, avoid unauthenticated expensive operations, and ensure login abuse is rate-limited enough for production deployment. Concrete defenses: the global request body is capped at 256 kb (only audience uploads opt into 20 MB); `GET /password-setup/:token` is per-IP rate-limited (30 / 15 min); `POST /campaigns/:id/export` is capped at 20 exports / hour / user to defend against an account-takeover dump-and-run on the audience CSVs.

### Audit Integrity

`audit_log` is enforced as append-only **at the database layer** by Postgres triggers `audit_log_no_update` and `audit_log_no_delete`, installed by `installAuditLogAppendOnlyTrigger()` on every boot. Even an attacker with full app DB privileges cannot tamper with audit history without first dropping the trigger, which would itself be a visible schema change.

### AI Provider Boundary

The application optionally calls an external AI provider (Anthropic, reached via
the Replit AI Integrations proxy). This adds a new trust boundary: any text or
structured payload sent to the provider leaves the application's data plane.
The product's no-PII contract therefore extends to AI calls and is enforced
defense-in-depth at three layers:

- **Settings gate** — every AI route checks `app_settings.ai_assist_enabled`
  (`ensureAiEnabled`). When the org disables AI, the routes return 403 before
  any external call is made.
- **Field allowlist** — AI routes pass only structured, pre-approved fields
  (status, owning unit, dates, channel/type names, counts). Free-text fields
  the user might have populated (campaign names, audience descriptions, touch
  names, suppression notes) are excluded from the prompt unless the route is
  explicitly text-classifying that field.
- **Pattern guard** — `assertNoPii` scans every string in the outbound payload
  for email, phone, SSN, and donor-ID patterns and refuses the call (HTTP 422)
  rather than redacting silently.

AI usage is rate-limited per user per minute and recorded in the `ai_usage`
table for auditability and budget review. AI routes also write `audit_log`
entries (`ai_audience_summary`, `ai_suggest_cadence`, `ai_classify_reason`).

### Transport & Browser Hardening

The API ships strict HTTP security headers via `helmet`: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, `Strict-Transport-Security` (1 year, `includeSubDomains`), `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-site`, and an explicit `X-Robots-Tag` on every response. `X-Powered-By` is disabled. Session cookies are `httpOnly`, `secure` (in production), `sameSite=strict`, scoped to `path=/api`. The global JSON body limit is 256 kb; the audience-upload route opts into 20 MB via a per-route parser so a forgotten body-size check on a new endpoint cannot accidentally accept a 20 MB payload. Session IDs are regenerated on the unauth → auth boundary at login and on password-setup completion to defeat session fixation. Per-role session TTLs (4h for `super_admin`, 12h otherwise) shrink the window of a stolen session for the most privileged accounts.

### Re-Authentication for Destructive Actions

Hard deletes (`DELETE /users/:id`, `DELETE /campaigns/:id`) and grants of `super_admin` (via `PATCH /users/:id`) require a fresh password authentication within the last 5 minutes (`requireRecentAuth`, tracked via `req.session.lastAuthAt`). Blocked requests return HTTP 403 with `code: "reauth_required"` so the frontend can prompt the user to re-enter their password. The frontend ships a `<ReauthDialog>` that POSTs to `POST /auth/reauth`, which verifies the current user's bcrypt hash and bumps `lastAuthAt` on success; failed attempts feed the same per-user lockout as the login route, so an attacker with a stolen session cannot grind passwords here. This raises the bar for an attacker with a stolen session cookie or unattended workstation: even with a valid session, they cannot escalate or destroy data without also producing the user's password.

### Session Invalidation on Credential Change

Whenever a user's password changes — via `POST /auth/change-password` or via the token-driven `POST /password-setup/:token/complete` — the server calls `revokeOtherSessionsForUser` to delete every other session row for that user from the `session` table. The current session is preserved on `change-password` so the user isn't logged out of the tab they just used; on token completion no session is preserved. This guarantees that an attacker who stole a session cookie loses access the moment the legitimate user resets their password, instead of surviving until the cookie's TTL.

### Login Enumeration Timing

`POST /auth/login` returns the same status/body for "unknown email", "inactive user", and "wrong password". To prevent timing-based enumeration, the no-user / inactive path runs a dummy `bcrypt.compare` against a constant hash so response time roughly matches the path where a real user exists and the password is wrong. Pre-auth per-IP rate limiting and per-account lockout further constrain the attack rate.

### Per-Export Volume Cap

The 20/hour per-user export quota limits frequency, but a single export against a giant audience would still constitute a near-total leak. `POST /campaigns/:id/export` therefore also caps total rows across all touches in the batch at `MAX_EXPORT_ROWS` (default 500,000) and rejects with HTTP 413 + `code: "export_row_cap_exceeded"`.

### Logged Token Exposure

Password-setup tokens are bearer credentials in the URL path (`GET /password-setup/:token`). The `pino-http` request serializer redacts these paths to `/password-setup/[REDACTED]` so a single info-level access log line can't leak a live token. Bootstrap `seed.ts` writes the bootstrap super-admin's setup URL once to stderr at first boot of an empty DB; this is the only way for the operator to obtain credentials for the seeded account (the system does not send email), it fires only once per cold-start against an empty users table, and the operator running the boot is the sole intended reader of stderr at that moment. Admin-issued setup URLs (create-user, reset-password, resend-invite) are returned only in the JSON response of an authenticated admin API call; they are never logged.

### Session Store Hygiene

`connect-pg-simple` is configured with `pruneSessionInterval: 3600` so expired session rows are swept hourly. Without this the `session` table grows unbounded as every login adds a row that is never reaped automatically.

### Elevation of Privilege

This project has a sharp privilege boundary between `standard`, `admin`, and `super_admin`. The server must prevent lower-privileged users from granting themselves stronger roles, resetting higher-privileged accounts, reaching destructive retention features, or abusing bootstrap paths to obtain super-admin access. Hard deletes (`DELETE /users/:id`, `DELETE /campaigns/:id`) are gated to `super_admin`; user delete additionally refuses self-deletion and refuses to remove the last remaining super-admin, and reassigns owned records to the acting super-admin so audit accountability is preserved. All privileged actions, including invite/resend/reset/delete, write to `audit_log` with the actor and target.