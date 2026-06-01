# Export Security Review

Related Issues:
- #28 Security Hardening
- Future Phase 24 Export Center

## Purpose

Exports are one of the highest-risk operations in the Constituent Operations Platform because they can move large volumes of constituent information outside the application.

This review establishes required controls for all export functionality.

## Security Objectives

- Ensure only authorized users can export data.
- Prevent excessive extraction of constituent data.
- Audit export activity.
- Limit accidental disclosure.
- Support compliance and governance requirements.

## Required Controls

### Authentication

All export endpoints must require authentication.

Status: Review Required

### Authorization

Exports must verify:

- User role
- Record ownership where applicable
- Team/workspace restrictions when implemented

Status: Review Required

### Audit Logging

Every export should record:

- User
- Timestamp
- Export type
- Record count
- Success/failure

Status: Review Required

### Rate Limiting and Quotas

Existing export quota controls have been identified in the API server.

Current expectation:

- Per-user quota enforcement
- Bulk export quota accounting

Status: Partially Reviewed

### Data Minimization

Exports should include only fields required for the operational workflow.

Review:

- Constituent exports
- Campaign exports
- Audience exports
- Activity exports
- Task exports

Status: Review Required

## PII Review

High-risk fields require explicit justification before export.

Examples:

- Personal email
- Personal phone
- Address information
- Sensitive notes
- Authentication-related data

Never export:

- Password hashes
- Session information
- MFA secrets
- API keys
- Internal security metadata

## Future Export Center Requirements

Phase 24 introduces a centralized Export Center.

Required controls:

- Audit trail
- Ownership validation
- Export history
- Permission matrix integration
- Download accountability

## Findings Tracker

### E-001

Verify every export route enforces quota checks.

Severity: Medium

### E-002

Verify every export route writes audit events.

Severity: High

### E-003

Review exported fields for unnecessary PII exposure.

Severity: High

### E-004

Document export retention and download history requirements.

Severity: Medium

## Guardrail Confirmation

No communication-authoring functionality is included.

The platform remains focused on governance, coordination, accountability, and operational intelligence.