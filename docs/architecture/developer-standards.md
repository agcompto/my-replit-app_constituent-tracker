# Developer Standards

Related Issue: #35

## Purpose

Provide consistent standards for development, reviews, documentation, security, accessibility, and AI governance.

## Code Documentation Standard

Business-critical modules should include documentation similar to:

```ts
/**
 * Purpose:
 *
 * Inputs:
 *
 * Outputs:
 *
 * Security Considerations:
 *
 * Related Issues:
 *
 * Future Extensions:
 */
```

Apply to:

- Services
- API routes
- Security-sensitive utilities
- AI integrations
- Import/export workflows

## Pull Request Requirements

Every PR should include:

- Purpose
- Related issue
- Testing performed
- Security considerations
- Accessibility considerations
- Future follow-up items

## Security Review Checklist

Review:

- Authentication
- Authorization
- Ownership validation
- Audit logging
- Data exposure
- Rate limiting
- Secret handling

Required for:

- New routes
- New exports
- AI features
- Integrations

## Accessibility Review Checklist

Review:

- Keyboard navigation
- Focus management
- Form labels
- Error messaging
- Screen reader support
- Table accessibility
- Color contrast

Target:

WCAG 2.2 AA

## Testing Requirements

Minimum expectations:

- Typecheck passes
- Build passes
- Manual workflow validation completed

Where practical:

- Unit tests
- Integration tests

## Lobo Terminology Standard

Use the term:

- Lobo

Avoid introducing alternate names for the system of record.

Documentation and UI should remain consistent.

## AI Guardrails

Allowed:

- Risk detection
- Recommendations
- Summaries
- Operational insights
- Data quality analysis

Not Allowed:

- Email generation
- SMS generation
- Solicitation content
- Stewardship content
- Marketing copy

## Architecture Principle

Constituent Tracker is:

- A Constituent Operations Platform

Constituent Tracker is not:

- A CRM replacement
- A marketing automation platform
- A communication authoring tool

## Future Contributors

When adding new features:

1. Update documentation.
2. Review security impacts.
3. Review accessibility impacts.
4. Consider audit logging.
5. Confirm alignment with platform guardrails.
6. Confirm no communication-authoring functionality was added.