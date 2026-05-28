# Developer Review Guide: Deployment Hardening

This branch turns the Replit-originated app into a more deployment-ready, security-conscious, and accessible production candidate.

## Review Order

Recommended review order:

1. Deployment/runtime changes
2. Data-security changes
3. UX/layout changes
4. Accessibility changes
5. Documentation and CI changes

This order keeps the riskiest operational changes first and the presentation-layer changes later.

## Deployment and Runtime Review

Files to review:

- `package.json`
- `.env.example`
- `Dockerfile`
- `.dockerignore`
- `.github/workflows/ci.yml`
- `artifacts/api-server/src/lib/env.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `README.md`

Key intent:

- Make production build/start commands explicit.
- Fail fast when required environment variables are missing or unsafe.
- Support portable deployment targets such as Railway, Render, Fly.io, and Docker hosts.
- Add baseline CI checks for install, typecheck, build, audit, and Docker image construction.

Reviewer notes:

- Confirm the production host injects `PORT`.
- Confirm `SESSION_SECRET` is unique and generated outside the repo.
- Confirm `APP_PUBLIC_URL` matches the deployed origin.
- Confirm PostgreSQL connection settings match the selected host.

## Data-Security Review

Files to review:

- `artifacts/api-server/src/routes/exports.ts`
- `.env.example`
- `README.md`
- Existing supporting files:
  - `artifacts/api-server/src/routes/audience.ts`
  - `artifacts/api-server/src/routes/ai.ts`
  - `artifacts/api-server/src/lib/ai.ts`
  - `artifacts/api-server/src/routes/retention.ts`
  - `lib/db/src/schema/index.ts`

Key intent:

- Prevent cached CSV export artifacts from lingering in browsers or proxies.
- Add audit events for export file downloads, not just export generation.
- Keep AI features on a data-minimization footing.
- Document operational controls for export size thresholds, SSL, and AI credentials.

Important security assumptions:

- Constituent IDs are sensitive internal identifiers and should be treated as protected data.
- Export CSVs are high-risk data movement events.
- AI features should remain disabled unless approved and configured intentionally.
- Audit logs are useful but not immutable unless shipped to external storage or SIEM.

Reviewer checks:

- Verify CSV downloads set `Cache-Control: no-store`.
- Verify download audit events do not include raw donor IDs.
- Verify row counts and campaign IDs are sufficient for investigation without overexposing data.
- Confirm `MAX_EXPORT_ROWS` and `SUSPICIOUS_EXPORT_ROWS` defaults are appropriate for production.

## UX Review

Files to review:

- `artifacts/touchpoint-planner/src/components/layout/AppLayout.tsx`

Key intent:

- Restore navigation usability on mobile where the desktop sidebar is hidden.
- Keep desktop navigation behavior consistent.
- Reduce header crowding on smaller screens.
- Preserve existing app routing and page behavior.

Reviewer checks:

- Test at mobile, tablet, and desktop widths.
- Confirm all primary pages remain reachable from the mobile navigation dialog.
- Confirm admin links appear only for admin and super-admin users.
- Confirm logout and change-password controls remain usable on small screens.

## Accessibility / ADA Review

Files to review:

- `artifacts/touchpoint-planner/src/index.css`
- `artifacts/touchpoint-planner/src/components/layout/AppLayout.tsx`

Key intent:

- Add a keyboard-visible skip link.
- Improve landmark and navigation labeling.
- Add visible focus treatment.
- Respect reduced-motion user preferences.
- Improve dark-mode muted text contrast.
- Mark decorative icons as hidden from assistive technologies.

Reviewer checks:

- Navigate the app shell with only a keyboard.
- Confirm the skip link appears on first Tab and moves focus to main content.
- Confirm active navigation items expose `aria-current="page"`.
- Confirm mobile navigation announces as a dialog and closes after navigation.
- Confirm icon-only controls have accessible labels.
- Test with prefers-reduced-motion enabled.

## Known Follow-Up Recommendations

These are intentionally not all implemented in this branch because they require product or infrastructure decisions:

- External immutable audit-log shipping.
- Redis-backed distributed rate limiting for multi-replica deployments.
- Suspicious export alert emails or SIEM alerts.
- Formal RBAC split between export, retention, SAML admin, and user admin.
- Quarterly backup restore drills.
- Full end-to-end accessibility test suite.
- Responsive card layout for large data tables on very small screens.

## Suggested Manual QA Script

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Run `pnpm run typecheck`.
3. Run `pnpm run build:deploy`.
4. Run `docker build -t constituent-tracker:review .`.
5. Start the app with production-like env vars.
6. Log in as standard user and verify navigation, campaign list, and exports.
7. Log in as admin and verify admin navigation.
8. Test keyboard-only navigation.
9. Test mobile viewport navigation.
10. Export a campaign CSV and verify response headers and audit-log entry.

## Deployment Recommendation

Railway remains the recommended first production target because the app is a long-running Node/Express service with PostgreSQL and server-side sessions. Vercel/Netlify are not the best fit for this architecture.
