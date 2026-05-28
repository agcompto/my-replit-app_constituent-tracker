# Phase 1 Production Readiness Checklist

Use this checklist before deploying the MVP with real constituent data.

## Dependency and Build Hygiene

- [ ] Run `pnpm install` locally on the branch.
- [ ] Commit the refreshed `pnpm-lock.yaml`.
- [ ] Switch CI back from `--no-frozen-lockfile` to `--frozen-lockfile`.
- [ ] Switch Dockerfile back from `--no-frozen-lockfile` to `--frozen-lockfile`.
- [ ] Confirm GitHub Actions passes.
- [ ] Confirm Docker image builds.

## Environment Separation

- [ ] Create separate Railway services for staging and production.
- [ ] Create separate PostgreSQL databases.
- [ ] Configure separate secrets.
- [ ] Configure `VITE_APP_ENV=staging` in staging.
- [ ] Configure `VITE_APP_ENV=production` or omit it in production.
- [ ] Configure `APP_PUBLIC_URL` correctly for each environment.
- [ ] Verify the environment banner appears in staging and not in production.

## Access Control

- [ ] Create named admin accounts; avoid shared admin credentials.
- [ ] Confirm super-admin access is limited.
- [ ] Disable bootstrap reset variables after first setup.
- [ ] Review user roles before launch.
- [ ] Confirm inactive users cannot sign in.

## Data Security

- [ ] Confirm real `.env` files are not committed.
- [ ] Confirm `SESSION_SECRET` is strong and environment-specific.
- [ ] Confirm DB SSL is enabled.
- [ ] Confirm exports are audited.
- [ ] Confirm export downloads are no-cache/no-store.
- [ ] Confirm export row cap is acceptable.
- [ ] Confirm suspicious export threshold is acceptable.

## Backup and Recovery

- [ ] Enable automated database backups.
- [ ] Document retention period.
- [ ] Run one restore test into staging.
- [ ] Verify restored data loads.
- [ ] Verify audit logs survive restore.

## Monitoring

- [ ] Configure uptime monitor for `/api/healthz`.
- [ ] Configure deploy failure alerts.
- [ ] Configure database health alerts.
- [ ] Configure error reporting.
- [ ] Define who receives operational alerts.

## MVP Functional QA

- [ ] Login/logout.
- [ ] Password change.
- [ ] Campaign create/edit.
- [ ] Audience upload/paste.
- [ ] Touch creation.
- [ ] Threshold preview.
- [ ] Finalize campaign.
- [ ] Export CSV.
- [ ] Download export manifest.
- [ ] Audit log review.
- [ ] Admin system status endpoint.
- [ ] Mobile navigation.
- [ ] Keyboard navigation.

## Accessibility QA

- [ ] Skip link appears on first Tab.
- [ ] Active navigation announces current page.
- [ ] Icon-only buttons have labels.
- [ ] Dialogs are keyboard usable.
- [ ] Reduced-motion setting is respected.
- [ ] Color contrast is acceptable in light/dark mode.

## Launch Decision

Do not launch with real constituent data until:

- CI passes;
- staging has passed QA;
- backups are enabled and restore-tested;
- admin users are reviewed;
- export governance has been approved.
