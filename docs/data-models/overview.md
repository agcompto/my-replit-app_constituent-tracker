# Data Model Overview

Related Issue: #35 Developer Documentation & Architecture

## Purpose

This document provides a high-level overview of the core data domains within the Constituent Operations Platform and how they relate to Lobo, governance, security, and operational workflows.

## Design Principles

- Lobo remains the system of record.
- Operational tracking belongs in Constituent Tracker.
- Ownership and accountability should be explicit.
- Auditability is preferred over destructive changes.
- Soft-delete and archival patterns should be favored where appropriate.

## Constituent

Purpose:
- Central operational record for an individual.

Relationships:
- Campaigns
- Audiences
- Tasks
- Notes
- Suppressions
- Activities

Security Considerations:
- May contain PII.
- Export access must be controlled.
- AI workflows should use aggregated or filtered data.

Lobo Interaction:
- Refreshable from Lobo.
- Refresh history should be tracked.

## Audience

Purpose:
- Defines a reusable or snapshot group of constituents.

Relationships:
- Campaigns
- Constituents
- Audience Health Reviews

Security Considerations:
- Ownership required.
- Refresh operations should be audited.

Lobo Interaction:
- Refresh from Lobo supported.
- Snapshot copies preserve historical targeting context.

## Campaign

Purpose:
- Represents a coordinated communication or engagement effort.

Relationships:
- Audiences
- Calendar Items
- Tasks
- Activities

Security Considerations:
- Ownership required.
- Lifecycle changes should be auditable.

## Calendar Item

Purpose:
- Organization-wide scheduling and visibility.

Relationships:
- Campaigns
- Tasks
- Owners

Security Considerations:
- Public publishing requires explicit controls.
- Feed tokens must be protected.

## Task

Purpose:
- Accountability and operational follow-up.

Relationships:
- Constituents
- Campaigns
- Audiences
- Calendar Items

Security Considerations:
- Ownership enforcement required.

## Note

Purpose:
- Stores operational context and interactions.

Types:
- Call
- Meeting
- Event Conversation
- Email Log
- Text Log
- General Note

Security Considerations:
- May contain sensitive information.
- Export review required.

## Activity

Purpose:
- Immutable operational history.

Examples:
- Campaign Created
- Audience Refreshed
- Import Completed
- Task Completed

Security Considerations:
- Prefer append-only behavior.
- Preserve audit integrity.

## Suppression

Purpose:
- Prevent accidental inclusion of restricted constituents.

Fields:
- Reason
- Source
- Start Date
- End Date
- Notes

Security Considerations:
- Must be enforced consistently.

## Import

Purpose:
- Records constituent and operational data ingestion.

Tracks:
- Source
- User
- Counts
- Errors
- Warnings

Security Considerations:
- Validate inputs.
- Audit outcomes.

## Reference Data

Purpose:
- System-managed configuration values.

Examples:
- Campaign Types
- Communication Types
- Event Categories
- Regions
- Departments
- Statuses

Security Considerations:
- Admin-controlled.
- Changes should be audited.

## Future Models

Planned roadmap entities include:
- Communication Calendar
- Team Workspace
- Saved Reports
- Integration Hub
- API Keys
- Webhooks
- Data Confidence Scores
- Engagement Scores

## Guardrail Confirmation

This model supports operational coordination, governance, accountability, and intelligence.

No communication-authoring functionality is part of the data model.