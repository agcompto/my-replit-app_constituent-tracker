# Constituent Touchpoint Planner Architecture

This document explains how the application is organized and how its major systems fit together. It is intended for a future developer who needs to understand the codebase without prior context from Replit, Codex, or earlier conversations.

## 1. What the Application Does

The Constituent Touchpoint Planner is an internal advancement-operations application for planning constituent communications while avoiding over-contacting donors or constituents.

At a high level, users can:

- create communication campaigns;
- upload or paste constituent IDs;
- define planned touches across dates, channels, and campaign types;
- apply thresholds to detect excessive communication volume;
- add suppressions and seed groups;
- preview campaign health;
- finalize and export audience files;
- view campaign history, reports, audit logs, and administrative settings.

The system is intentionally designed around **Constituent IDs only**. Names, emails, phone numbers, addresses, giving amounts, and other personal details should not be entered into the app.

## 2. Repository Layout

The repository is a pnpm workspace with application code split into `artifacts` and shared libraries under `lib`.

```text
.
├── artifacts/
│   ├── api-server/              # Express API and production static web server
│   └── touchpoint-planner/       # React/Vite frontend
├── lib/
│   ├── db/                      # Drizzle schema, DB client, migrations/push config
│   └── api-zod/                 # Shared request/response schemas and validators
├── scripts/                     # Project scripts and helper tooling
├── docs/                        # Architecture, review, and operational docs
├── package.json                 # Root workspace scripts
├── pnpm-workspace.yaml          # Workspace package membership
├── Dockerfile                   # Production container build
└── .github/workflows/ci.yml     # CI checks
```

The two most important runtime packages are:

- `@workspace/api-server` — the backend process that serves API routes and, in production, the built frontend.
- `@workspace/touchpoint-planner` — the browser UI.

Shared packages are used to keep data validation and database access consistent between systems.

## 3. Runtime Architecture

Production runs as a single long-lived Node process:

```text
Browser
  |
  | HTTPS
  v
Express API server
  |-- /api/* JSON and file endpoints
  |-- static frontend assets
  |
  v
PostgreSQL
```

The production API server is responsible for:

- validating required environment variables;
- configuring security headers, CORS, sessions, and auth middleware;
- mounting all API routes;
- serving the built React frontend;
- managing graceful shutdown;
- starting the retention scheduler.

The frontend is built separately by Vite and then served by the API process. This is why Railway, Render, Fly.io, or Docker-based hosting fit better than static-only platforms.

## 4. Build and Start Flow

Root scripts are the primary interface for development and deployment.

Common commands:

```bash
pnpm install
pnpm dev
pnpm run typecheck
pnpm run build:deploy
pnpm start
pnpm run db:push
```

Production build flow:

1. TypeScript validates shared packages and artifacts.
2. Vite builds the frontend.
3. The API server builds into `artifacts/api-server/dist`.
4. `pnpm start` runs `artifacts/api-server/dist/index.mjs`.

The API server expects required environment variables to be present before it starts.

## 5. Backend Architecture

Backend entry points live in:

```text
artifacts/api-server/src/index.ts
artifacts/api-server/src/app.ts
```

### `index.ts`

The `index.ts` file is the process entry point. It:

- validates environment variables;
- imports and starts the Express app;
- seeds default lookup data;
- starts the retention scheduler;
- listens on `PORT`;
- handles graceful shutdown for HTTP and PostgreSQL connections.

### `app.ts`

The `app.ts` file constructs the Express application. It configures:

- reverse-proxy trust;
- framework header suppression;
- request logging;
- CORS allowlists;
- security headers via Helmet;
- request body limits;
- session middleware;
- user attachment middleware;
- password-change enforcement;
- API routes;
- production static frontend serving;
- centralized error handling.

### Route Organization

API route modules live under:

```text
artifacts/api-server/src/routes/
```

Representative route groups include:

- auth and session management;
- campaigns;
- audience upload and validation;
- touch planning;
- thresholds;
- suppressions;
- seed groups;
- exports;
- reports;
- audit logs;
- retention;
- settings;
- users;
- AI-assisted helpers.

Most routes follow this pattern:

1. Validate path/body/query input with shared schemas or local parsing.
2. Require authentication and, where needed, role authorization.
3. Check campaign-level permission or mutability.
4. Perform database operations through Drizzle.
5. Write audit events for sensitive actions.
6. Return JSON or generated file output.

## 6. Frontend Architecture

Frontend source lives in:

```text
artifacts/touchpoint-planner/src/
```

Key frontend areas:

```text
src/App.tsx                         # Top-level router and providers
src/components/layout/AppLayout.tsx  # Authenticated app shell and navigation
src/pages/                          # Route-level pages
src/components/                     # Shared UI and domain components
src/hooks/                          # React hooks
src/lib/                            # Frontend utilities
```

The app uses:

- React;
- Vite;
- Wouter for routing;
- TanStack Query for server state;
- generated API client hooks from shared API definitions;
- a component library under `components/ui`.

The authenticated shell wraps most pages. Login, password setup, password reset, and forced password change routes live outside or partially outside the authenticated layout.

## 7. Data Model Overview

The database schema lives primarily in:

```text
lib/db/src/schema/index.ts
```

Major tables include:

### Users and Authentication

- `users`
- `password_setup_tokens`
- `totp_recovery_codes`
- `session`

These support local authentication, password setup/reset, TOTP recovery, and PostgreSQL-backed sessions.

### Campaign Planning

- `campaigns`
- `campaign_type_links`
- `audience_donors`
- `touches`
- `touch_audience_donors`

These tables represent campaign metadata, constituent audiences, and planned communications.

### Rules and Exceptions

- `thresholds`
- `threshold_templates`
- `threshold_overrides`
- `suppression_reason_codes`
- `suppressions`
- `seed_groups`

These tables drive contact-frequency rules, exceptions, suppressions, and seed audiences.

### History and Exports

- `touchpoints`
- `export_jobs`
- `upload_jobs`
- `campaign_health_checks`

These preserve campaign export history, upload metadata, and health-check snapshots.

### Governance and Settings

- `audit_log`
- `app_settings`
- `saved_report_views`
- `calendar_preferences`
- `ai_usage`

These tables support auditability, system configuration, saved views, UI preferences, and AI usage accounting.

## 8. Core Domain Concepts

### Campaign

A campaign is the main planning container. It includes metadata such as name, status, owning unit, intended send date, audience description, notes, and upload/export counts.

Common statuses include:

- `draft`
- `uploaded`
- `previewed`
- `finalized`
- `exported`
- `archived`
- `voided`

### Audience

The campaign audience is a set of Constituent IDs. The system validates IDs and intentionally avoids storing rejected upload samples or unnecessary PII.

### Touch

A touch is a planned communication within a campaign. It has:

- channel;
- campaign type;
- send date;
- optional notes and marketing metadata;
- audience mode.

A touch may use the campaign-wide audience or a custom per-touch audience.

### Threshold

A threshold is a rule used to detect too many communications in a defined window. Thresholds can apply globally or be scoped by channel, campaign type, or both.

Threshold action modes include concepts such as tracking, flagging, removing, or manual review depending on the route logic and UI.

### Suppression

A suppression removes or excludes constituents from communications based on configured scope and reason.

### Seed Group

Seed groups add internal/test constituent IDs to exports so staff can verify delivery or downstream handling.

### Export

Export converts finalized touch plans into CSV audience files and records touchpoint history. Exporting is a high-risk data movement action and should remain audited and rate-limited.

## 9. Campaign Lifecycle

A typical campaign lifecycle is:

```text
Create draft campaign
  -> Add campaign metadata
  -> Upload/paste Constituent IDs
  -> Add touches
  -> Configure thresholds/suppressions/seeds
  -> Preview threshold impact and health checks
  -> Finalize campaign
  -> Export files
  -> Archive or retain history
```

The backend enforces mutability rules so voided or finalized/exported states cannot be modified in unsafe ways.

## 10. Authentication and Authorization

Authentication is session-based. The API uses Express sessions persisted to PostgreSQL.

Important auth components:

- login/logout routes;
- password setup/reset flows;
- forced password change handling;
- role checks;
- SAML configuration support;
- optional TOTP/recovery-code support depending on configured flows.

Role concepts include:

- standard users;
- admins;
- super admins.

Common authorization patterns:

- `requireAuth` ensures there is a logged-in user.
- `requireRole` gates admin/super-admin actions.
- campaign-specific checks ensure users can only mutate permitted campaigns.
- recent-auth checks protect destructive actions such as retention deletion.

## 11. Data Security Model

The security model is based on minimizing sensitive data and controlling high-risk movement.

Key principles:

- Store only Constituent IDs for audiences.
- Do not collect names, emails, phone numbers, addresses, or giving amounts.
- Do not send donor-level data to AI providers.
- Audit privileged and export-related actions.
- Cap and throttle export activity.
- Prevent downloaded CSVs from being cached.
- Use secure sessions and production-only secure cookies.
- Require explicit environment configuration for production.

CSV exports are especially sensitive. Developers should treat any route that returns CSV, ZIP, manifest, or donor-level rows as a data exfiltration risk and review accordingly.

## 12. AI Architecture

AI helper logic lives in:

```text
artifacts/api-server/src/routes/ai.ts
artifacts/api-server/src/lib/ai.ts
```

AI features are intended for operational assistance, not donor-level analysis.

The AI layer:

- requires AI assist to be enabled in app settings;
- requires provider credentials through environment variables;
- rate-limits requests;
- tracks token usage per user;
- blocks common PII patterns;
- sends structured metadata rather than raw constituent lists;
- records audit events for AI actions.

Developers should not add AI prompts that include raw donor IDs, names, free-text PII, giving details, or exported audience rows.

## 13. Retention Architecture

Retention logic is responsible for deleting old records according to system settings.

Important characteristics:

- super-admin-only schedule configuration;
- dry-run mode by default;
- recent-auth requirement before destructive manual runs;
- advisory locking to avoid duplicate scheduler execution;
- persisted last-run metadata in app settings.

Retention should be treated as a destructive operation. Any future changes should prioritize dry-run visibility, auditability, and explicit confirmation.

## 14. Reporting Architecture

Reports and dashboards consume campaign, touchpoint, export, and settings data. They should generally avoid returning raw donor-level rows unless the page is explicitly an export or detail workflow requiring them.

Saved report views are stored per user and may contain filter/config JSON. Avoid storing sensitive free-text data in saved-view payloads.

## 15. Frontend State and Data Fetching

The frontend uses TanStack Query for server state.

Typical pattern:

- generated API hook fetches data;
- page displays loading, empty, and error states;
- mutation success invalidates related query keys;
- server remains source of truth for authorization and validation.

Do not rely on frontend role checks as the only authorization layer. UI role checks are for usability; backend route guards are the real control.

## 16. Validation Strategy

Validation occurs at several layers:

- frontend form controls for immediate user feedback;
- shared Zod schemas for API contract validation;
- backend route-level validation for path/body/query safety;
- database constraints for uniqueness, references, and required fields.

Future developers should prefer shared schemas in `lib/api-zod` when request/response structures are used by both frontend and backend.

## 17. Error Handling and Logging

The API uses structured logging and centralized error handling.

Guidelines:

- Do not log raw donor IDs in bulk.
- Do not log passwords, tokens, cookies, SAML assertions, or provider credentials.
- Keep user-facing errors clear but avoid leaking object existence or permissions.
- For security-sensitive actions, write audit records separately from application logs.

## 18. Deployment Architecture

Recommended deployment target: Railway.

Why Railway fits:

- long-running Node service;
- PostgreSQL support;
- environment variables;
- automatic HTTPS;
- simple monorepo deployment;
- compatible with server-side sessions.

Other viable options:

- Render;
- Fly.io;
- Docker hosts;
- Replit Deployments for demos or lower-stakes environments.

Poor fit:

- static-only hosting;
- serverless-only deployments without careful session/database adaptation.

## 19. Environment Variables

The app requires production environment variables for database, sessions, public URL/origins, and optional integrations.

See:

```text
.env.example
README.md
```

Important variables include:

- `DATABASE_URL`
- `SESSION_SECRET`
- `PORT`
- `APP_PUBLIC_URL`
- `ALLOWED_ORIGINS`
- `MAX_EXPORT_ROWS`
- `SUSPICIOUS_EXPORT_ROWS`
- AI provider variables, if AI is enabled
- SAML variables, if SAML is enabled

Never commit real secrets.

## 20. CI and Quality Gates

GitHub Actions run baseline checks on the branch:

- dependency install;
- typecheck;
- production build;
- dependency audit;
- Docker build.

Developers should run the same checks locally before merging major changes.

## 21. Accessibility Architecture

The app shell includes accessibility features such as:

- visible focus outlines;
- skip-to-content link;
- semantic landmarks;
- accessible mobile navigation;
- reduced-motion handling;
- active navigation indication via `aria-current`;
- improved dark-mode text contrast.

Future UI work should preserve:

- keyboard navigation;
- visible focus;
- screen-reader labels for icon-only controls;
- logical heading order;
- accessible loading and error states;
- sufficient color contrast.

## 22. Where to Start as a New Developer

Recommended onboarding path:

1. Read `README.md`.
2. Read this architecture document.
3. Review `package.json` scripts.
4. Review `lib/db/src/schema/index.ts` to understand the data model.
5. Review `artifacts/api-server/src/app.ts` and `index.ts` to understand runtime setup.
6. Review route modules under `artifacts/api-server/src/routes`.
7. Review `artifacts/touchpoint-planner/src/App.tsx` and `components/layout/AppLayout.tsx`.
8. Run the app locally.
9. Create a sample campaign and walk through upload, touch planning, preview, finalize, and export.

## 23. Common Change Scenarios

### Add a New API Endpoint

1. Add or update shared schema in `lib/api-zod` if the frontend will use it.
2. Add route handler in `artifacts/api-server/src/routes`.
3. Add auth/role checks.
4. Validate all inputs.
5. Add audit logging if the endpoint is privileged or data-sensitive.
6. Expose frontend hook/client as needed.
7. Add UI integration.

### Add a New Campaign Field

1. Add database column in `lib/db/src/schema/index.ts`.
2. Update migration/push flow.
3. Update shared API schemas.
4. Update backend create/update/read routes.
5. Update frontend forms and display components.
6. Consider whether the field may contain PII.

### Add a New Export Type

1. Treat the feature as sensitive data movement.
2. Add authorization checks before revealing whether data exists.
3. Add row caps and/or rate limiting.
4. Add audit events for generation and download.
5. Set no-cache/no-store response headers.
6. Avoid including unnecessary donor-level data.

### Add an AI Feature

1. Confirm the use case does not require donor-level data.
2. Send only aggregate or structured metadata.
3. Use `assertNoPii` before provider calls.
4. Add token accounting.
5. Add per-user rate limiting.
6. Add audit logging.

## 24. Architectural Risks to Keep in Mind

The main long-term risks are operational rather than purely code-level:

- export misuse after account compromise;
- insider misuse of export access;
- audit logs being altered in the same database they audit;
- weak secret rotation;
- lack of external monitoring/alerting;
- missed backup restore testing;
- accidental future introduction of PII fields.

When making future changes, ask:

- Does this collect more data than necessary?
- Does this expose donor-level rows?
- Does this need an audit event?
- Does this need a role boundary?
- Does this need export throttling or row limits?
- Does this remain usable with keyboard and screen readers?

## 25. Glossary

- **Constituent ID**: Internal identifier for a donor/constituent. Sensitive, but less identifying than full PII.
- **Campaign**: Planning container for a communication effort.
- **Touch**: A planned communication within a campaign.
- **Threshold**: Rule for detecting excessive communication volume.
- **Suppression**: Exclusion rule for contacts or touches.
- **Seed Group**: Internal/test IDs added to output files.
- **Export Job**: Record of generated campaign output.
- **Touchpoint**: Historical record of a constituent receiving or being scheduled for a touch.
- **Retention**: Scheduled or manual deletion of old records.
- **SAML**: Single sign-on integration mechanism.
- **PII**: Personally identifiable information that should not be entered into this app.
