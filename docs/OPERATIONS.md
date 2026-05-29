# Operations Guide

This document covers the minimum operational practices recommended before using real constituent data.

## 1. Environment Strategy

Recommended environments:

| Environment | Purpose |
|---|---|
| local | developer testing |
| staging | QA, UAT, pilot validation |
| production | real institutional use |

Each environment should use:

- separate PostgreSQL databases;
- separate secrets;
- separate session stores;
- separate domains/subdomains;
- separate AI credentials (if enabled).

Never share production credentials with staging.

## 2. Recommended Hosting

Recommended first production host:

- Railway

Other acceptable options:

- Render
- Fly.io
- Docker/Kubernetes hosts

Avoid static-only platforms because the app requires:

- long-running Express server;
- sessions;
- PostgreSQL;
- retention scheduler;
- file export handling.

## 3. Required Environment Variables

Minimum production variables:

```bash
DATABASE_URL=
SESSION_SECRET=
APP_PUBLIC_URL=
PORT=8080
NODE_ENV=production
```

Strongly recommended:

```bash
TRUST_PROXY=1
DATABASE_SSL=1
PGSSLMODE=require
MAX_EXPORT_ROWS=500000
SUSPICIOUS_EXPORT_ROWS=100000
```

Optional integrations:

- SAML
- email
- AI assist

## 4. Session Security

Recommendations:

- rotate `SESSION_SECRET` periodically;
- use HTTPS only;
- use secure cookies in production;
- limit admin account access;
- require MFA if institutionally possible.

## 5. Backup Requirements

Minimum recommendation:

- nightly PostgreSQL backups;
- 30-day retention;
- encrypted backup storage;
- quarterly restore test.

Recommended backup test:

1. Restore staging DB from backup.
2. Verify campaigns and exports load.
3. Verify login/session behavior.
4. Verify audit logs remain readable.

## 6. Monitoring

Minimum monitoring:

- uptime checks;
- deploy failure alerts;
- database connectivity alerts;
- export failure alerts;
- error logging.

Recommended services:

- Sentry
- Better Stack
- Datadog
- Railway health checks

## 7. Export Governance

CSV exports are the highest-risk operational workflow.

Recommendations:

- audit every export;
- audit every download;
- set export row thresholds;
- alert on suspicious export sizes;
- limit export access by role;
- review export activity regularly.

## 8. Recommended Admin Practices

- separate admin accounts from daily-use accounts;
- least-privilege role assignment;
- quarterly access reviews;
- disable inactive accounts;
- immediately revoke access after staff departure.

## 9. Retention Operations

Retention deletion should:

- remain dry-run until validated;
- be tested in staging first;
- require recent auth confirmation;
- be audited.

Before enabling destructive retention:

1. confirm backups work;
2. validate retention windows;
3. verify legal/compliance expectations.

## 10. Dependency Management

The project uses pnpm workspaces.

Before production merge:

```bash
pnpm install
```

Then commit the updated:

```text
pnpm-lock.yaml
```

After lockfile refresh:

- restore `--frozen-lockfile` in CI;
- restore `--frozen-lockfile` in Docker builds.

## 11. CI Expectations

CI should validate:

- install
- typecheck
- production build
- audit
- Docker build

Future recommended additions:

- automated tests
- accessibility smoke tests
- security scanning
- container scanning

## 12. Security Review Checklist

Before production:

- verify HTTPS;
- verify DB SSL;
- verify no secrets committed;
- verify export limits;
- verify audit logging;
- verify role permissions;
- verify retention settings;
- verify backup restore;
- verify staging environment separation.

## 13. Incident Response

If suspicious export activity occurs:

1. disable affected account;
2. preserve audit logs;
3. review export/download history;
4. rotate sessions/secrets if needed;
5. assess exposed data scope;
6. notify institutional stakeholders.

## 14. MVP Production Gate

Recommended minimum gate before real constituent data:

- staging validated;
- backup restore tested;
- CI passing;
- export workflow reviewed;
- admin access reviewed;
- accessibility smoke-tested;
- documentation reviewed.
