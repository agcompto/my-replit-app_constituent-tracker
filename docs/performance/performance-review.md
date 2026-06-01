# Phase 0 Performance Review

Date: 2026-06-01  
Scope: frontend bundle/routing, dashboard/table behavior, repeated API calls, backend export processing, API build stability, and future roadmap performance risks.

## Executive Summary

The app has a workable baseline for the current feature set, including React Query caching defaults, server-side export row caps, chunked touchpoint inserts, and streaming ZIP generation for campaign summary PDFs. The primary Phase 0 performance opportunities are route-level code splitting, bundle visibility, large table handling, dashboard query consolidation, and shared-store rate limit/queue design before expansion.

The only code change in this pass is runtime-stability related: campaign ZIP exports now instantiate `ZipArchive` directly instead of calling the `archiver` namespace object.

## Findings and Plan Documented Before Expansion

### Repository Structure Reviewed

- Frontend: `artifacts/touchpoint-planner/src/` with route pages and reusable UI components.
- API: `artifacts/api-server/src/` with route modules and export/AI/reporting helpers.
- Shared validation/schema: `lib/api-zod/` and `lib/db/`.
- Build: root `pnpm` workspace with TypeScript project references and Vite/esbuild builds.

### Current Performance Patterns Reviewed

- React Query is configured with `staleTime: 5 * 60 * 1000` and `refetchOnWindowFocus: false`, reducing repeated reference-data calls.
- `App.tsx` statically imports all route pages, which is simple but prevents route-level code splitting.
- Export creation uses row caps (`MAX_EXPORT_ROWS`) and chunked insert batches.
- Bulk summary ZIP export streams PDFs through `PassThrough` entries instead of buffering each PDF in memory.
- Bulk audience CSV ZIP currently appends generated CSV buffers; future high-volume exports may need full streaming or background jobs.

## Investigation Areas

### Large Bundle Size

Risk:

- Static imports in `App.tsx` pull every route page into the initial bundle, including admin, reports, exports, donors, and campaign wizard code.

Recommended remediation:

- Convert route pages to `React.lazy` / `Suspense` or an equivalent route-level splitting pattern.
- Add bundle analyzer output for production builds.
- Track initial JS size budgets before adding calendar, search, dashboards, and integration hub features.

### Lazy Loading / Route-Level Code Splitting

Recommended first candidates:

- Reports
- Exports
- Audit log
- Users/admin
- Settings/SAML panel
- Campaign wizard substeps
- Donors/constituent search
- Calendar page once expanded

### Dashboard Performance

Risk:

- Future home/team/executive dashboards will combine overdue, scheduled, Lobo freshness, data risk, conflicts, task, and admin-attention queries.

Recommended remediation:

- Prefer consolidated dashboard endpoints over many independent client calls.
- Cache reference data separately from volatile operational counts.
- Add server-side pagination and date-window filters for dashboard cards.

### Table Rendering

Risk:

- Constituents, audit logs, reports, data quality, global search, activity timeline, and export center can become large-table surfaces.

Recommended remediation:

- Use server-side pagination/filtering/sorting for large datasets.
- Consider virtualization only after accessibility review.
- Avoid rendering thousands of rows in the DOM.
- Keep row actions memoized and avoid per-row expensive calculations.

### Export Processing

Current controls:

- Per-export row caps.
- Per-user export quota for export creation.
- Chunked inserts for generated touchpoints.
- Streaming ZIP entries for summary PDFs.

Recommended remediation:

- Move large exports to background jobs when Export Center expands.
- Store export job status and downloadable artifacts with expiration.
- Apply quotas to repeated downloads if abuse is observed.
- Keep CSV formula injection prevention centralized.

### Repeated API Calls

Current controls:

- React Query default stale time and disabled refetch-on-focus.

Recommended remediation:

- Audit pages for duplicate hooks requesting the same data.
- Keep lookup/reference data in shared hooks.
- Use invalidation narrowly after mutations.
- Consolidate summary/report endpoints where multiple cards need the same source rows.

## Findings

### PERF-001 — No route-level code splitting yet

Severity: Medium

All route pages are statically imported by `App.tsx`. This is acceptable for a small app but will increase initial load cost as roadmap phases add calendar, digest settings, saved audiences, global search, dashboards, and integration hub screens.

Status: Documented follow-up.

### PERF-002 — Bundle size lacks a tracked budget/artifact

Severity: Medium

There is no documented production bundle-size budget or analyzer output in CI.

Status: Documented follow-up.

### PERF-003 — Bulk CSV ZIP generation may need background jobs later

Severity: Medium future-risk

Bulk audience CSV ZIP generation currently builds CSV content before appending buffers. Row caps reduce risk today, but Export Center and larger audiences should move long-running exports to background jobs with status polling.

Status: Documented follow-up.

### PERF-004 — In-memory rate/quota state is not horizontally scalable

Severity: Medium future-risk

In-memory rate limiting is simple and fast now, but multi-replica deployments require a shared counter store.

Status: Documented follow-up.

## Recommended Performance PR Breakdown

1. Add bundle analyzer and baseline size documentation.
2. Add route-level lazy loading for low-frequency pages.
3. Consolidate dashboard data endpoints and query invalidation patterns.
4. Add server-side pagination/sorting audits for large tables.
5. Design background export jobs for future Export Center.
6. Move quotas/rate limits to a shared store before Integration Hub/API key release.

## Manual Performance Test Steps

1. Run production frontend build and record chunk sizes.
2. Load dashboard and verify no duplicate reference-data requests on initial render.
3. Load campaigns/donors/audit pages with large fixtures and verify pagination/filter responsiveness.
4. Run single and bulk campaign exports near the row cap and monitor memory/time.
5. Confirm ZIP summary export downloads successfully after the `ZipArchive` runtime fix.

## Guardrail Confirmation

No performance recommendation weakens authentication, authorization, audit logging, input validation, accessibility, export protections, or AI PII boundaries. No communication-authoring functionality was added.
