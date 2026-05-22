# Engineering improvement plan

Living checklist for incremental quality, security, and production-readiness work.

## 1. Architecture summary

| Layer | Stack |
|-------|--------|
| Monorepo | pnpm workspaces (`artifacts/*`, `lib/*`, `scripts`) |
| API | Express 5, express-session (PG store), Drizzle ORM, Zod (`@workspace/api-zod`) |
| DB | PostgreSQL, schema in `lib/db/src/schema/index.ts` |
| Contract | OpenAPI → Orval (`lib/api-spec/openapi.yaml` → hooks + Zod) |
| Web | React 19, Vite 7, wouter, TanStack Query, shadcn/ui |
| Deploy | Replit autoscale (`.replit`), `REPLIT_DOMAINS` for CORS |

Auth: session cookie (`/api`, httpOnly, strict). Roles: `standard` / `admin` / `super_admin`. TOTP for admin roles. Optional Entra SAML SSO.

## 2. Highest-risk technical debt

- **Campaign list N+1** — `GET /campaigns` calls `loadCampaignSummary` per row (~6+ queries each).
- **Org-wide read model** — any authenticated user can read campaigns/reports; mutation gated per-campaign. Documented, not IDOR-safe for confidential campaigns.
- **Large settings page** — 1100+ lines, many `any` handlers; hard to maintain.
- **OpenAPI drift** — some routes (e.g. `/auth/saml/enabled`) use `customFetch` only.
- **Uncommitted SSO fixes** — dev `APP_PUBLIC_URL` fallback, SSO panel UX (on branch).

## 3. Quick wins

- [x] SSO settings: error state + local form state (no per-keystroke PATCH)
- [x] Split `samlXmlPolicy.ts` for testability
- [x] Shared frontend `apiErrorMessage()` helper
- [x] Settings page: surface `/api/settings` load failures
- [x] `replit.md`: consolidated local development section
- [x] Unit test for `samlPublicBaseUrl()` dev fallback

## 4. Recommended refactors (phased)

| Phase | Focus |
|-------|--------|
| A | Quick wins above + docs |
| B | Batch `loadCampaignSummaries(ids)` for list + dashboard |
| C | Extract settings sub-panels; tighten `any` on mutation errors |
| D | Authz integration tests (role matrix samples) |
| E | Route-level OpenAPI coverage for SAML public routes |
| F | `React.lazy` for wizard/reports (bundle) |

## 5. Test gaps

- SAML ACS / account resolution (mocked IdP)
- `GET /settings` super_admin SAML fields
- `canMutateCampaign` / forbidden paths
- Export quota + health-check failure paths
- Frontend: settings/SSO error states (optional RTL)

## 6. Security / privacy risks

| Risk | Control | Honest assessment |
|------|---------|-------------------|
| Session hijack | httpOnly, strict, role TTL | Single layer (cookie) |
| Credential stuffing | lockout + IP rate limits | Good |
| SAML assertion replay | DB replay table | Good when enabled |
| Log leakage | password-setup URL redaction | Good; verify SAML XML never logged |
| CORS | `REPLIT_DOMAINS`; prod fail-closed | Must set in prod |
| PII in exports | no-PII policy, donor IDs only | Process + code paths need review per export |

## 7. UX improvements

- Settings load error banner (admin)
- Destructive actions: retention already confirmed; audit delete campaigns
- Campaign list loading skeleton (if batching adds latency spike, show progress)
- Form validation messages from API `error` field consistently

## 8. Deployment / readiness

- Run `pnpm --filter @workspace/db push` after index migrations
- Required: `DATABASE_URL`, `SESSION_SECRET`, `REPLIT_DOMAINS` (prod)
- SAML: `SAML_IDP_CERT_FINGERPRINT_SHA256`, `APP_PUBLIC_URL`
- macOS dev: `@rollup/rollup-darwin-x64` required (pnpm overrides)

## Commands (verification)

```bash
pnpm run typecheck
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/constituent_tracker"
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/touchpoint-planner run build
```
