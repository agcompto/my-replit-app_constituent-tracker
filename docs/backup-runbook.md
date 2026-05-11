# Backup & Restore Runbook

This document describes operational procedures for backing up and restoring the
Constituent Touchpoint Planner database. The application is single-tenant and
state-bearing only in PostgreSQL; the API server is stateless.

## What needs to be backed up

The PostgreSQL database is the only system of record. Everything else (deployed
artifacts, secrets, generated CSVs) can be reconstructed from source.

Critical tables (in order of recovery priority):

1. `users`, `session` — restoring access for staff.
2. `campaigns`, `audience_donors`, `touches`, `touch_audience_donors`,
   `thresholds`, `threshold_overrides`, `threshold_templates` — active and
   draft campaigns.
3. `suppressions`, `seeds`, `seed_donors`, `suppression_reason_codes` — needed
   to reconstruct an export.
4. `touchpoints`, `export_jobs`, `upload_jobs` — historical send record used
   for rolling-window threshold checks; losing this rewinds the system to a
   "no history" state but does not block future use.
5. `audit_log`, `ai_usage` — accountability records.
6. `app_settings`, `channels`, `campaign_types`, `owning_units`,
   `saved_report_views` — configuration; can be re-seeded if lost.

## Replit-managed PostgreSQL

The `DATABASE_URL` env var points at a Replit-managed Postgres instance.
Replit takes platform-level snapshots on a schedule managed by the Replit
team. Workspace owners can request a point-in-time restore by contacting
Replit Support.

For self-managed disaster recovery, take application-level dumps as below.

## Manual `pg_dump` backup

Run from the workspace shell (uses the same `DATABASE_URL` the app uses):

```bash
mkdir -p backups
pg_dump --no-owner --no-acl --format=custom \
  --file="backups/ctp-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$DATABASE_URL"
```

This produces a single file containing schema + data. Files in `backups/`
should be downloaded out of the workspace (e.g. via `scp` or the Files
panel) and stored in NC State institutional storage.

### Recommended cadence

- **Before a production deploy that includes schema changes** (`pnpm --filter
  @workspace/db run push` against prod): always dump first.
- **Before a retention-deletion run** by a `super_admin`: always dump first.
- **Routine**: nightly automated dump retained for 30 days, weekly retained
  for 1 year.

## Restoring a dump

Restore into an empty database:

```bash
# 1. Provision a fresh database, set DATABASE_URL.
# 2. Apply the latest schema.
pnpm --filter @workspace/db run push

# 3. Restore data only (the schema is already applied).
pg_restore --no-owner --no-acl --data-only \
  --dbname="$DATABASE_URL" backups/ctp-YYYYMMDDTHHMMSSZ.dump
```

If `pg_restore --data-only` reports duplicate-key errors, the target database
was not empty. Drop and recreate it before restoring.

## Verifying a restore

After restoring:

1. Boot the API server: `pnpm --filter @workspace/api-server run dev`
2. Confirm `/api/healthz` returns 200 (it now performs a `select 1`).
3. Log in as the bootstrap super_admin and visit `/audit`. The most recent
   audit entry should pre-date the dump.
4. Open a recently exported campaign and re-run the export (it is
   idempotent); the manifest should match the pre-dump file list.

## Incident response

If production data is suspected to be lost or corrupted:

1. **Stop the API**. From Replit Deployments, pause the deployment to prevent
   further writes that would interleave with stale data.
2. **Capture forensics**. Take a `pg_dump` of the current (possibly damaged)
   database before any restore so you can compare later.
3. **Restore the most recent verified dump** into a *new* database; do not
   restore on top of the existing one.
4. **Cut the deployment over** to the restored database by updating
   `DATABASE_URL` in Replit Secrets, then resume the deployment.
5. **Audit**. Review `audit_log` rows around the incident timestamp.
