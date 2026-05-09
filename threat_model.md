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

The application relies on server-side sessions stored in PostgreSQL and password-based login. Session identifiers must be unpredictable, protected with secure cookie settings in production, and bound to legitimate login flows. Bootstrap behavior must not create predictable privileged accounts that allow an attacker to impersonate a trusted administrator.

### Tampering

Authenticated users can create campaigns, upload audiences, define thresholds, add suppressions and seeds, finalize campaigns, and export touchpoint history. The API must validate all request bodies and must ensure users can only modify data they are authorized to change. Administrative settings and retention actions must remain restricted to the intended roles.

### Repudiation

Exports, uploads, settings changes, user administration, and destructive retention operations materially affect institutional data. These actions must produce trustworthy audit records tied to the acting user and timestamp so that privileged activity can be investigated later.

### Information Disclosure

The system stores and returns donor IDs, campaign metadata, touchpoint history, reporting aggregates, and staff account details. Shared campaign visibility is intentional, but reporting feeds, export downloads, audit-style operational history, and any donor-level data must not leak beyond the role or ownership model defined by the product requirements. Logs and bootstrap messages must not disclose secrets or sensitive credentials.

### Denial of Service

Audience upload and export flows can process large donor lists and write many database rows. The application must keep request sizes bounded, avoid unauthenticated expensive operations, and ensure login abuse is rate-limited enough for production deployment.

### Elevation of Privilege

This project has a sharp privilege boundary between `standard`, `admin`, and `super_admin`. The server must prevent lower-privileged users from granting themselves stronger roles, resetting higher-privileged accounts, reaching destructive retention features, or abusing bootstrap paths to obtain super-admin access.