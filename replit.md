# Constituent Touchpoint Planner

Internal NC State University Advancement tool for planning donor communication touchpoints, checking cumulative volume against rolling-window thresholds, and exporting one-Donor-ID-per-row CSV send lists with strict no-PII handling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port from `PORT`)
- `pnpm --filter @workspace/touchpoint-planner run dev` — web frontend
- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod from `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Default credentials (dev)

- `admin@example.com` / `changeme123` (super_admin) — change after first login.

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
- Web app: `artifacts/touchpoint-planner/src/`

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
