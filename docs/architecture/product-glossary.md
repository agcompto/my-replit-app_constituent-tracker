# Product Glossary and Lobo Terminology Guide

Related Issue: #35

## Purpose

Define core product terms so developers, reviewers, and future contributors use consistent language across code, documentation, and user-facing workflows.

## Product Identity

### Constituent Operations Platform

The application helps teams coordinate constituent-facing operations, data quality, accountability, scheduling, ownership, and risk review.

It is not a CRM replacement, marketing automation platform, or communication-authoring tool.

### Lobo

Lobo is the system of record for constituent data.

Use the term `Lobo` consistently in documentation, UI copy, comments, and issue descriptions.

Avoid introducing alternate names such as:

- CRM
- Salesforce replacement
- donor database replacement
- source database

When describing integration behavior, prefer:

- Refresh from Lobo
- Lobo freshness
- Lobo refresh history
- Stale Lobo data

## Core Terms

### Constituent

An individual record surfaced for operational coordination, assignment, data quality review, campaign participation, tasks, notes, and activity history.

### Campaign

A coordinated communication, engagement, stewardship, event, or operational effort that may involve audiences, calendar items, tasks, suppressions, and review workflows.

### Audience

A defined or snapshotted group of constituents used for planning, review, campaign coordination, or health checks.

### Audience Snapshot

A point-in-time copy of an audience. A snapshot should preserve the exact set of records used for a campaign or review.

### Saved Audience

A reusable audience definition that may be refreshed from Lobo.

### Saved Search

A reusable set of filters or lookup state used to find constituents or operational records.

### Calendar Item

A scheduled operational event, communication, or coordination item that may be private, public, embedded, or included in a calendar feed depending on admin controls.

### Task

An assigned operational action with an owner, status, priority, and due date.

### Owner

The accountable user or team assigned to a constituent, campaign, audience, task, or calendar item.

### Suppression

A rule or record preventing accidental inclusion of a constituent in a campaign, export, audience, or workflow.

### Reference Data

Admin-managed configuration values such as campaign types, communication types, event categories, tags, regions, departments, and statuses.

### Activity Timeline

An append-style operational history of meaningful events across constituents, campaigns, audiences, imports, tasks, settings, calendar items, and reference data.

### Data Confidence Score

A future score reflecting operational trust in a record, audience, or campaign based on Lobo freshness, completeness, duplicate risk, valid contact information, and import health.

### Engagement Score

A future configurable score based on events, participation, volunteer activity, survey activity, and interactions.

### Communication Risk Review

An AI-assisted advisory workflow that detects over-contact risk, threshold concerns, timing issues, conflicts, duplicates, and recommended operational actions.

It must not generate emails, texts, solicitation copy, stewardship messages, or marketing content.

## Preferred Product Language

Use:

- Review audience risk
- Refresh from Lobo
- Data quality issue
- Over-contact risk
- Communication conflict
- Operational recommendation
- Advisory AI guidance
- Staff review required

Avoid:

- Generate email
- Write text message
- Draft solicitation
- Replace CRM
- Automate marketing journey
- Autonomous sending

## AI Language Rules

Allowed AI terms:

- analyze
- summarize
- flag
- recommend
- review
- detect
- classify risk

Avoid AI terms that imply authorship or autonomous outreach:

- write
- draft
- compose
- send
- auto-message
- generate campaign copy

## Documentation Guardrail

Every new feature document should explicitly confirm whether it affects:

- Security
- Accessibility
- Performance
- Lobo freshness
- Audit logging
- Communication-authoring boundaries

## Guardrail Confirmation

This glossary reinforces the Constituent Operations Platform boundary and preserves Lobo terminology.

No communication-authoring functionality is added by this document.
