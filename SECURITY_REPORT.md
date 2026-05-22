# Security Report — SAML SSO (Task #50)

## Summary

Implemented Microsoft Entra SAML 2.0 SSO with JIT provisioning, optional group-to-role sync, password-login disable per user (bootstrap super-admin exempt), SAML health in `/api/healthz`, and adversarial test scaffolding.

## Findings addressed

| Severity | Issue | Fix |
|----------|-------|-----|
| High | Password-setup blocked when session had `mustChangePassword` | Allowlisted `/api/password-setup/*` and SAML public routes in `app.ts` |
| High | No pinned IdP certificate validation | `SAML_IDP_CERT_FINGERPRINT_SHA256` + metadata fingerprint check |
| Medium | Open redirect via RelayState | `validateSamlReturnTo()` — relative paths only |
| Medium | Assertion replay | `saml_assertion_replay` table with insert-on-conflict |

## Trust-transition catalog

See `AUTHORIZATION_MATRIX.md` SAML section.

## Operational assumptions ledger

| Assumption | Exploitability | Blast radius | Likelihood | Compensating controls | Dependencies | Reevaluation |
|------------|----------------|--------------|------------|----------------------|--------------|--------------|
| Entra MFA via Conditional Access | Medium | High | Medium | App TOTP still required for password admin login | Azure AD policy | Entra policy change |
| Pinned cert fingerprints maintained | Low | High | Low | Last-known-good metadata on mismatch | Operator rotation runbook | Cert rollover |
| `SESSION_SECRET` confidentiality | Medium | Critical | Low | httpOnly cookies, no logging | Secret store | Secret rotation |

## Verification

- `pnpm --filter @workspace/api-server run typecheck` — pass
- `pnpm --filter @workspace/api-server run test` — unit + adversarial smoke
- `pnpm --filter @workspace/db run push` — schema already includes SAML columns

## Dependency audit

Run `pnpm audit --json` in CI and document critical/high in release notes.
