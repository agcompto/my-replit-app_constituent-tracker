# Constituent Touchpoint Planner

Internal NC State University Advancement tool for planning donor communication touchpoints, checking cumulative volume against rolling-window thresholds, and exporting one-Donor-ID-per-row CSV send lists with strict no-PII handling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from `PORT`)
- `pnpm --filter @workspace/touchpoint-planner run dev` — web frontend
- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes
- Required env: `DATABASE_URL`, `SESSION_SECRET`
- Optional: `RESEND_API_KEY`, `EMAIL_FROM` — when set, account-setup and password-reset emails are delivered via Resend. When unset, admins still receive a copyable one-time setup URL in the API response.
- Optional: `PUBLIC_APP_URL` — base URL embedded in setup links (e.g. `https://planner.advancement.ncsu.edu`). Falls back to `REPLIT_DOMAINS`/`localhost` so dev still works.
- Optional: `PASSWORD_HIBP_DISABLED=1` — escape hatch for offline test/dev that skips the Have-I-Been-Pwned k-anonymity breach check.
- Optional bootstrap: `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` — override the seeded super-admin identity.

## Bootstrap super-admin (dev / fresh DB)

On first startup against an empty database, a `super_admin` account is created (default `admin@example.com`) with **no password**. A 48-hour single-use setup link is generated. If `RESEND_API_KEY`/`EMAIL_FROM`/`BOOTSTRAP_ADMIN_EMAIL` are configured, the link is emailed; otherwise it is printed once to the server log at level `warn`. Open the link, choose a password, and sign in.

## Password setup (no-temp-password flow)

Admins never see, type, or transmit user passwords. Creating a user (`POST /users`), resetting one (`POST /users/:id/reset-password`), and `POST /users/:id/resend-invite` all issue a one-time setup token via `lib/passwordSetupTokens.ts` (32 random bytes → base64url, stored as SHA-256). Admin-issued invite/resend links expire in 48 hours; both admin- and self-service password-reset links expire in 2 hours. Issuing a fresh link revokes any prior live link of the same kind. Setup uses two routes:

- `GET /password-setup/:token` — returns the email/name/kind/expiry so the page can render.
- `POST /password-setup/:token/complete` — validates the new password (`lib/passwordPolicy.ts`: 12–128 chars, letter + non-letter/non-whitespace char, not the email/name, not in HIBP) and atomically consumes the token, sets the new password, clears lockout state, and writes the audit row in a single transaction.

Responses to `POST /users` and `POST /users/:id/reset-password` return `{ inviteSent, expiresAt, setupUrl? }`. The URL is only returned when email delivery failed — the UI then offers a copy-link fallback so the admin can hand it to the user securely.

## Forgot password & lockout

- `POST /auth/forgot-password` always responds **204** regardless of whether the email exists, then emails a 2-hour reset link if the account is real and active.
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
- Email + URL building: `artifacts/api-server/src/lib/email.ts`, `lib/appUrl.ts`
- Web app: `artifacts/touchpoint-planner/src/` (setup-link pages: `pages/forgot-password.tsx`, `pages/setup-password.tsx`)

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
