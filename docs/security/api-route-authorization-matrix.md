# API Route Authorization Matrix

Related issue: #28

## Purpose

Document authorization expectations for all API route groups.

This document serves as the baseline security review artifact for the Constituent Operations Platform and should be updated whenever new route groups are added.

## Review Status Key

- ☐ Not reviewed
- ◐ Partially reviewed
- ☑ Reviewed

## Route Groups

| Route Group | Auth Required | Role Restrictions | Ownership Checks | Audit Logging | Status |
|------------|--------------|------------------|-----------------|--------------|--------|
| /auth | Mixed | Mixed | N/A | Partial | ◐ |
| /auth/saml | Mixed | Mixed | N/A | Partial | ◐ |
| /users | Expected | Admin/Super Admin review required | N/A | Required | ☐ |
| /campaigns | Expected | Role dependent | Required | Required | ☐ |
| /audience | Expected | Role dependent | Required | Required | ☐ |
| /touches | Expected | Role dependent | Required | Required | ☐ |
| /thresholds | Expected | Admin review required | N/A | Required | ☐ |
| /threshold-templates | Expected | Admin review required | N/A | Required | ☐ |
| /suppressions | Expected | Role dependent | Required | Required | ☐ |
| /suppression-reasons | Expected | Admin review required | N/A | Required | ☐ |
| /exports | Expected | Role dependent | Required | Required | ☐ |
| /reports | Expected | Role dependent | Required | Required | ☐ |
| /audit | Expected | Admin/Super Admin review required | N/A | N/A | ☐ |
| /settings | Expected | Admin/Super Admin review required | N/A | Required | ☐ |
| /retention | Expected | Super Admin review required | N/A | Required | ☐ |
| /ai | Expected | Role dependent | N/A | Required | ☐ |
| /ai-constituents | Expected | Role dependent | N/A | Required | ☐ |
| /saved-report-views | Expected | Owner required | Required | Recommended | ☐ |
| /saved-constituent-searches | Expected | Owner required | Required | Recommended | ☐ |
| /me | Expected | None | Current user only | Recommended | ☐ |
| /admin | Expected | Super Admin review required | N/A | Required | ☐ |

## Review Requirements

For each route group:

1. Verify authentication enforcement.
2. Verify role-based authorization.
3. Verify ownership validation for mutable resources.
4. Verify audit logging for create/update/delete operations.
5. Verify exports do not expose unnecessary constituent data.
6. Verify AI routes follow aggregate-data and no-communication-generation rules.
7. Verify errors do not leak implementation details.

## High-Risk Areas

Priority review order:

1. Admin routes
2. Settings routes
3. Export routes
4. AI routes
5. Saved searches
6. Campaign management
7. Audience management

## Future Roadmap Reviews

The following roadmap features require authorization review before release:

- Calendar Publishing & Scheduling
- Public Calendar Embeds
- Integration Hub
- API Keys
- Webhooks
- Team Workspaces
- Export Center

## Guardrail Confirmation

No communication-authoring functionality is included in this review artifact.

The platform remains a Constituent Operations Platform focused on coordination, governance, accountability, data quality, and operational intelligence.