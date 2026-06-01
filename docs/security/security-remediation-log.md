# Security Remediation Log

Date: 2026-06-01  
Scope: Phase 0 hardening before product expansion.

## Incident: Exposed Database Credential

### Summary

A database credential was previously exposed outside the intended secret boundary. The application must treat that credential as compromised even if no unauthorized access is confirmed.

### Status

- Credential rotation: Completed per Phase 0 requirement.
- Application code review: Completed for this pass.
- Follow-up prevention recommendations: Documented below.

## Mitigation Steps Completed

1. Rotated the exposed database credential and invalidated the previous value.
2. Confirmed database credentials should be supplied through environment/secret management and not committed to source control.
3. Reviewed API route security posture for authentication, authorization, audit logging, rate limiting, export controls, and AI boundaries.
4. Reviewed export handling for sensitive download headers, scope validation, quota checks, and CSV/spreadsheet injection prevention.
5. Reviewed AI boundaries to confirm advisory-only, aggregate/metadata-focused model payloads.
6. Fixed the campaign ZIP export `archiver` runtime import pattern.

## Future Prevention

- Keep `.env`, local database URLs, private keys, webhook secrets, API keys, and generated tokens out of git.
- Require GitHub secret scanning and push protection for the repository.
- Add recurring local secret scans before release branches are opened.
- Prefer Railway/private service database URLs for app-to-database traffic; avoid public proxy URLs unless explicitly required.
- Rotate secrets immediately after any accidental paste into issues, logs, screenshots, PRs, or chat tools.
- Keep production credentials separate from preview/development credentials.
- Avoid writing raw secrets to request logs, audit log details, error messages, or analytics.

## Secret Scanning Recommendations

### Repository Controls

- Enable GitHub Advanced Security secret scanning if available.
- Enable push protection for common secret formats.
- Add a required pre-merge check using a scanner such as Gitleaks or TruffleHog.
- Review PR diffs for `.env`, `DATABASE_URL`, `ANTHROPIC`, `SAML`, `SESSION_SECRET`, API keys, private keys, and webhook secrets.

### Local Developer Controls

- Add a documented local command for secret scanning.
- Encourage developers to keep secrets in untracked `.env.local` files or platform secret stores.
- Rotate any credential that appears in terminal transcripts or screenshots shared outside the secret boundary.

### Runtime Controls

- Redact tokens and credential-like values in logs.
- Keep tokenized public routes out of request logs or log only path templates without token values.
- Add token-specific redaction for future calendar feeds, public embeds, API keys, and webhook signatures.

## Remediation Items

| ID | Item | Status | Notes |
| --- | --- | --- | --- |
| SEC-REM-001 | Rotate exposed DB credential | Complete | Treat the prior value as compromised. |
| SEC-REM-002 | Document credential incident and prevention | Complete | This file. |
| SEC-REM-003 | Review API route security posture | Complete | See `docs/security/security-review.md`. |
| SEC-REM-004 | Review export route protections | Complete | See export review section in `security-review.md`. |
| SEC-REM-005 | Review AI data boundary | Complete | See AI boundary section in `security-review.md`. |
| SEC-REM-006 | Fix campaign ZIP export archiver runtime issue | Complete | `campaigns.ts` uses the shared `createZipArchive(...)` helper. |
| SEC-REM-007 | Add automated secret scanning check | Recommended | Future CI hardening. |
| SEC-REM-008 | Move rate limits/quotas to shared store | Recommended before scale | Required before multi-replica/API-key features. |

## Guardrail Confirmation

No communication-authoring functionality was added as part of remediation. No constituent communications were sent or enabled.
