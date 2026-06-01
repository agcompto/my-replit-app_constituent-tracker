# Documentation Hotspots

Related Issue: #35

## Purpose

Identify high-priority files and modules where future developer-facing comments or feature-level README updates would improve maintainability.

This document is a living checklist and should be updated as the codebase evolves.

## Priority Criteria

A file or module should be documented when it includes:

- Authorization or ownership checks
- Export behavior
- Import or migration behavior
- Complex data transformations
- Business rules not obvious from code
- Lobo refresh or freshness logic
- Public feed, embed, or integration behavior

## High-Priority Documentation Targets

### API Routes

#### `artifacts/api-server/src/routes/campaigns.ts`

Why it matters:

- Campaign lifecycle rules
- Clone behavior
- Bulk archive and export behavior
- Campaign PDF and manifest generation
- Authorization and mutation rules

Documentation needs:

- Route responsibility summary
- Export notes
- Clone behavior notes
- Ownership and role assumptions

#### Saved Constituent Search Routes

Why it matters:

- User-owned saved filter state
- Permission and ownership behavior
- Reusable lookup state

Documentation needs:

- Ownership model
- CRUD behavior
- Serialization expectations

#### Export Routes

Why it matters:

- High-risk data movement
- Quota enforcement
- Audit logging
- Data exposure risk

Documentation needs:

- Field exposure notes
- Authorization expectations
- Audit requirements

#### Operational Intelligence Routes

Why it matters:

- Enablement checks
- Rate limiting
- Data minimization
- Communication-authoring guardrails

Documentation needs:

- Input policy
- Output schema expectations
- Audit and usage logging requirements

### Libraries and Services

#### Authentication and Authorization Utilities

Documentation needs:

- Role definitions
- Authorization helper responsibilities
- Error behavior expectations

#### Rate Limiting Utilities

Documentation needs:

- Scope of each limiter
- In-memory limitation notes
- Future shared-store migration path

#### Campaign Export Utilities

Documentation needs:

- Export field inventory
- Filename safety assumptions
- Streaming behavior

#### Clone Campaign Logic

Documentation needs:

- Copy rules
- Do-not-copy rules
- Audit requirements

### Frontend Modules

#### Constituent Lookup

Documentation needs:

- State model
- Query behavior
- Accessibility considerations

#### Dashboard Components

Documentation needs:

- Data loading expectations
- Empty/error/loading states
- Accessibility notes

#### Table Components

Documentation needs:

- Header and sort semantics
- Keyboard expectations
- Pagination or virtualization notes

## Recommended Code Comment Template

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

## Review Cadence

Update this document when:

- New route groups are added
- Export behavior changes
- Lobo refresh behavior changes
- New public calendar/feed/embed functionality is introduced
- Major dashboard or table workflows are added

## Guardrail Confirmation

This document improves developer review and maintainability.

No communication-authoring functionality is added by this document.
