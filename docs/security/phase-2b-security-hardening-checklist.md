# Phase 2B Security Hardening Checklist

Related issue: #28

## Purpose

This checklist defines the first security hardening pass for the Constituent Operations Platform before additional major roadmap features are added.

The goal is to confirm that current and future work protects constituent operations data, enforces authorization consistently, avoids unnecessary sensitive data exposure, and preserves the product boundary: this is not a CRM replacement, marketing automation tool, or communication-authoring system.

## Product Security Principles

- Use Lobo terminology consistently.
- Minimize constituent data exposure.
- Prefer aggregate data where detailed records are not required.
- Enforce route-level authorization.
- Enforce ownership checks for user-owned records.
- Audit sensitive administrative and export actions.
- Do not log passwords, tokens, session identifiers, secrets, sensitive notes, or unnecessary PII.
- Do not add AI-generated emails, SMS, solicitation copy, or marketing content tooling.

## Review Areas

### 1. Authentication

- [ ] Confirm login routes apply appropriate rate limiting.
- [ ] Confirm password setup/reset flows do not leak account existence unnecessarily.
- [ ] Confirm password hashes are never logged or returned.
- [ ] Confirm session expiration behavior is documented.
- [ ] Confirm failed login attempts are auditable where appropriate.

### 2. Authorization

Review every API route for:

- [ ] Authentication requirement.
- [ ] Role or permission requirement.
- [ ] Ownership requirement for user-owned records.
- [ ] Super-admin-only behavior where applicable.
- [ ] Consistent 401 vs 403 behavior.

High-priority route groups:

- [ ] Auth and password setup
- [ ] Users and admin routes
- [ ] Campaigns
- [ ] Audiences
- [ ] Exports
- [ ] Reports
- [ ] Audit logs
- [ ] Settings
- [ ] AI routes
- [ ] Saved views/searches
- [ ] Suppressions
- [ ] Imports/seeds

### 3. Data Exposure

- [ ] Confirm API responses only return fields required by the UI.
- [ ] Confirm exports are permission-protected and auditable.
- [ ] Confirm sensitive notes or suppression reasons are not exposed in broad list endpoints unless required.
- [ ] Confirm errors do not include stack traces or database internals in production.
- [ ] Confirm logs do not expose secrets, tokens, session IDs, passwords, or unnecessary PII.

### 4. AI Guardrails

Before Issue #26 or later AI features:

- [ ] Confirm AI enablement checks exist.
- [ ] Confirm AI routes use rate limiting.
- [ ] Confirm token budget enforcement exists.
- [ ] Confirm usage logging exists.
- [ ] Confirm audit logging exists.
- [ ] Confirm PII checks exist.
- [ ] Confirm prompts use aggregate facts only where possible.
- [ ] Confirm AI cannot generate communications, solicitation copy, SMS, or marketing content.
- [ ] Confirm AI output is advisory and staff-reviewed.

### 5. Security Headers

- [ ] Review current HTTP security headers.
- [ ] Add or confirm `Content-Security-Policy` where practical.
- [ ] Add or confirm `Strict-Transport-Security` in production.
- [ ] Add or confirm `X-Content-Type-Options`.
- [ ] Add or confirm `Referrer-Policy`.
- [ ] Add or confirm frame/embed policy appropriate for public calendar/embed use cases.

### 6. Rate Limiting

Review rate limits for:

- [ ] Login
- [ ] Password setup/reset
- [ ] AI endpoints
- [ ] Export endpoints
- [ ] Public calendar/feed endpoints when implemented
- [ ] Future integration/API key endpoints

### 7. Database and Infrastructure

- [ ] Confirm Railway service-to-service database traffic uses private networking where possible.
- [ ] Confirm production does not use public database URLs for internal service connections.
- [ ] Confirm secrets are managed through environment variables or platform secrets.
- [ ] Confirm no secrets are committed to the repository.
- [ ] Confirm migrations/schema changes are reviewed before deployment.

### 8. Audit Logging

Confirm audit coverage for:

- [ ] Admin setting changes
- [ ] User/role changes
- [ ] Exports
- [ ] AI usage
- [ ] Saved search create/update/delete
- [ ] Suppression changes
- [ ] Campaign finalization/export/status changes
- [ ] Future API key and webhook changes

## Deliverables

For the security hardening pass:

1. Findings summary.
2. Prioritized remediation list.
3. Critical/high-severity fixes as separate PRs.
4. Documentation updates under `/docs/security`.
5. Confirmation that no communication-authoring functionality was added.

## Developer Notes

When adding or modifying security-sensitive code, include nearby comments documenting:

- Purpose of the check.
- Who is allowed to perform the action.
- What data is intentionally returned.
- What is intentionally excluded.
- Related audit event names.
- Future extension points.

Favor explicit authorization checks over implicit assumptions.
