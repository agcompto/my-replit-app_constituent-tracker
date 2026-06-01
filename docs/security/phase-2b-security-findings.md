# Phase 2B Security Findings

Related issue: #28

This document captures the initial evidence-based findings from the first security hardening pass. It complements `phase-2b-security-hardening-checklist.md` by recording what has already been observed in the repository and what still needs follow-up.

## Current Security Controls Observed

### Application Security Headers

The API server disables the Express `x-powered-by` header, applies an `X-Robots-Tag` default, and uses Helmet with an explicit Content Security Policy, frame-ancestor policy, referrer policy, cross-origin resource policy, and HSTS configuration.

Observed controls:

- `x-powered-by` disabled
- `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`
- `default-src 'self'`
- `connect-src 'self'`
- `frame-ancestors 'none'`
- `base-uri 'none'`
- `form-action 'none'`
- `Referrer-Policy: same-origin`
- `Strict-Transport-Security` configured

Follow-up:

- Revisit frame/embed policy when Calendar Publishing & Scheduling introduces public embeds.
- Confirm production deployment terminates TLS before relying on HSTS.

### CORS Boundary

Allowed origins are built from environment configuration, including `REPLIT_DOMAINS`, `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, and `RAILWAY_PUBLIC_DOMAIN`. Production rejects non-allowlisted origins.

Follow-up:

- Document the expected production values for `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, and `RAILWAY_PUBLIC_DOMAIN`.
- Confirm preview deployments do not accidentally inherit overly broad production origins.

### Request Logging Redaction

The request logger serializes only request ID, method, and a path-only URL. Password setup tokens are redacted from matching password setup routes.

Follow-up:

- Extend redaction review to any future tokenized routes, including calendar feed tokens, public embed tokens, API keys, and webhook secrets.

### Authentication Hardening

The login route includes several strong controls:

- Request body validation
- Per-email/IP rate limiting
- Dummy bcrypt comparison for missing/inactive users to reduce enumeration via timing
- Persistent account lockout
- Password-disabled user audit event
- Admin/super-admin TOTP split flow
- Session regeneration before pending TOTP state
- Pending TOTP expiration
- Dummy TOTP verification for missing/expired pending sessions
- Recovery code auditing

Follow-up:

- Confirm failed login audit behavior is sufficient for operational visibility.
- Confirm user-facing login errors remain enumeration-safe.
- Confirm admin password reset and forgot-password flows are covered in the same audit pass.

### Rate Limiting and Quotas

The rate limit module includes controls for:

- Login attempts
- Password changes
- AI per-user requests
- Password setup link validation
- Export quotas
- Admin password reset
- Forgot password
- SAML login
- SAML ACS

Follow-up:

- Confirm every sensitive route actually invokes the relevant limiter.
- Confirm rate limit keys use trusted IP behavior behind Railway proxy settings.
- Consider moving high-risk limits from in-memory buckets to a shared store if horizontal scaling becomes significant.

### Export Protection Foundation

Export quota support exists and includes a per-user hourly quota plus a bulk-export slot accounting helper.

Follow-up:

- Verify all export endpoints enforce authentication, authorization, quota checks, and audit logging.
- Confirm exports do not include fields that are not required for the operational workflow.

### AI Guardrail Foundation

The rate limit module already includes a per-user AI throttle.

Follow-up before Issue #26:

- Confirm AI enablement checks.
- Confirm AI usage logging.
- Confirm token budget enforcement.
- Confirm audit logging.
- Confirm PII filtering or aggregation-only payloads.
- Confirm AI prompts cannot generate communications, solicitation copy, SMS, or marketing content.

## Findings and Follow-Up Items

### F-001: Security checklist is documentation-only

Severity: Low

The current Phase 2B checklist is a strong starting point, but the next hardening PRs should convert checklist items into code-backed findings, route matrices, and fixes.

Recommended action:

- Add an API route authorization matrix.
- Add findings documents for authentication, authorization, exports, AI, and infrastructure.

### F-002: Frame policy will need an explicit exception design for future calendar embeds

Severity: Medium future-risk

Current Helmet configuration denies all framing using `frame-ancestors 'none'`. That is secure by default and appropriate today. The future public calendar embed feature will require a deliberate exception design.

Recommended action:

- Keep `frame-ancestors 'none'` globally.
- For future public embed routes, define a narrowly scoped embed policy instead of weakening the global policy.

### F-003: In-memory rate limiting may not protect consistently across multiple replicas

Severity: Medium future-risk

Current rate limits are in-memory. This is simple and effective for a single API instance, but limits will be per-instance when the app scales horizontally.

Recommended action:

- Document this as acceptable for the current deployment if running one API replica.
- Move high-risk limits to a shared store before scaling horizontally or exposing integration/API-key endpoints.

### F-004: Railway private database connectivity needs environment verification

Severity: Medium

The security checklist calls out private service-to-service database traffic. This cannot be fully verified from code alone because it depends on Railway environment variables.

Recommended action:

- Confirm the API service uses the private Railway database URL for internal database connections.
- Avoid using `DATABASE_PUBLIC_URL` / TCP proxy endpoints for internal service connections unless explicitly required.

### F-005: Tokenized routes require a central redaction rule

Severity: Medium future-risk

Password setup token paths are redacted today. Future calendar feed tokens, embed tokens, API keys, and webhook secrets should follow the same pattern.

Recommended action:

- Add a central route-token redaction helper before adding public feed, embed, API key, or webhook features.

## Next Recommended PRs

1. API route authorization matrix under `/docs/security/api-route-authorization-matrix.md`.
2. Export security review covering authorization, quotas, audit logging, and field exposure.
3. AI security review before Issue #26 begins.
4. Infrastructure note documenting Railway private networking and required database environment variables.
5. Token redaction helper for future public tokenized routes.

## Guardrail Confirmation

No communication-authoring functionality was added by this documentation update.

The platform boundary remains: Constituent Operations Platform, not CRM replacement, not marketing automation platform, and not message authoring tool.
