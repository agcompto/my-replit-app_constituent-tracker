# Constituent Tracker Platform - System Overview

## Product Identity

Constituent Tracker is a Constituent Operations Platform.

The platform helps users understand:

- Who is being contacted
- When they are being contacted
- Why they are being contacted
- Who owns the relationship
- Whether constituent data is current
- Whether communications are coordinated
- What actions require attention

The platform is intentionally not:

- A CRM replacement
- A marketing automation platform
- A communication authoring tool

## Core Platform Pillars

1. Campaign Tracking
2. Audience Health
3. Calendar & Scheduling
4. Tasks & Accountability
5. Data Quality & Governance

## Lobo Integration Boundary

Lobo remains the system of record.

Constituent Tracker consumes and evaluates operational information from Lobo but does not replace constituent management functions that belong in the source system.

Key principles:

- Refresh from Lobo whenever practical
- Surface stale data warnings
- Track refresh history
- Preserve source-of-truth ownership

## Major Domains

### Constituents

Operational visibility into constituent engagement, assignments, activity, notes, and data quality.

### Audiences

Reusable audience definitions, snapshots, health reviews, and refresh workflows.

### Campaigns

Planning, governance, scheduling, coordination, and lifecycle management.

### Calendar

Organization-wide communication visibility and scheduling coordination.

### Tasks

Ownership, accountability, due dates, and operational follow-up.

### Data Governance

Reference data, suppressions, imports, duplicates, confidence scoring, and quality monitoring.

### Operational Intelligence

AI-powered analysis, risk detection, recommendations, and summarization.

No communication generation is permitted.

## Security Model

Security follows least-privilege principles.

Core controls:

- Authentication
- Role-based access control
- Ownership validation
- Audit logging
- Export controls
- Rate limiting
- Security headers

## Accessibility Model

The platform targets WCAG 2.2 AA compliance.

Accessibility requirements apply to:

- Forms
- Tables
- Filters
- Modals
- Dashboards
- Administrative workflows

## AI Guardrails

AI capabilities are limited to:

- Analysis
- Recommendations
- Risk detection
- Summaries
- Operational insights

AI may not generate:

- Emails
- SMS messages
- Solicitation content
- Marketing content
- Stewardship copy

## Home Dashboard Principle

The dashboard should always answer:

- What is overdue?
- What is scheduled?
- What needs attention?
- What needs Lobo refresh?
- What data is risky?
- What conflicts exist?
- What tasks are mine?
- What should I do next?

## Documentation Standards

Business-critical modules should document:

- Purpose
- Inputs
- Outputs
- Security considerations
- Related issues
- Future extension points

## Roadmap Alignment

This document serves as the architectural foundation for the multi-phase roadmap including:

- Calendar Publishing & Scheduling
- Activity Timeline
- Data Quality Dashboard
- Communication Calendar
- Team Dashboard
- Integration Hub
- AI Operational Intelligence

All future features should be evaluated against the platform identity and guardrails defined above.