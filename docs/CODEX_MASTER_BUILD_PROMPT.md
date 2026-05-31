# Codex Master Build Prompt

Repository: `agcompto/my-replit-app_constituent-tracker`

## Product Identity

This application is a **Constituent Operations Platform**.

It is not:

- A CRM replacement
- A marketing automation platform
- A message authoring tool

It is a system that helps users understand:

- Who is being contacted
- When they are being contacted
- Why they are being contacted
- Who owns the relationship
- Whether constituent data is current
- Whether communications are coordinated
- What actions require attention

The platform should optimize:

1. Campaign Tracking
2. Audience Health
3. Calendar & Scheduling
4. Tasks & Accountability
5. Data Quality & Governance

Do not build:

- AI-generated emails
- AI-generated SMS
- AI-generated solicitation copy
- Marketing content creation

Use **Lobo** consistently throughout the application.

## Final Product Principle

The home dashboard should always answer:

- What is overdue?
- What is scheduled?
- What needs attention?
- What needs Lobo refresh?
- What data is risky?
- What conflicts exist?
- What tasks are mine?
- What should I do next?

## Required Process Before Coding

Before coding:

1. Review repository structure.
2. Identify existing models.
3. Identify existing workflows.
4. Recommend implementation phases.
5. Recommend PR breakdowns.
6. Produce implementation plan before coding.

## Required Process After Coding

After coding:

1. List modified files.
2. Explain architecture decisions.
3. Provide manual testing steps.
4. Identify assumptions.
5. Identify future improvements.
6. Confirm no communication-authoring functionality was added.

## Post-Phase Requirements

After each feature phase:

1. Run security review.
2. Run accessibility review.
3. Run performance review.
4. Update architecture documentation.
5. Update data model documentation.
6. Add developer-facing code comments where business logic exists.
7. Confirm WCAG 2.2 AA compliance.
8. Confirm authorization checks exist.
9. Confirm audit logging exists where appropriate.
10. Confirm no communication-authoring functionality was introduced.

Code should be understandable by a developer unfamiliar with the project.

Favor clarity over cleverness.

Every feature should include:

- Purpose
- Security considerations
- Dependencies
- Future extension points
- Testing instructions

## Implementation Phases

### Phase 1: Calendar Publishing & Scheduling

Build one application-wide calendar.

Requirements:

- Calendar feed private by default
- Public sharing optional
- Live ICS feed
- Downloadable ICS
- Google Calendar subscription link
- Public calendar page
- Public embed code
- Grid view
- List view
- EST default timezone
- Deleted events removed from feed
- Public pages hidden from search engines

Admin controls:

- Enable/disable feed
- Enable/disable public calendar
- Enable/disable embed
- Regenerate feed token

### Phase 2: Campaign Cloning

Users can clone:

- Campaign configuration only
- Campaign configuration + audience

Audience cloning:

- Creates new audience record
- Copies exact audience snapshot
- Does not reference original audience

Warning:

> Best practice is to refresh from Lobo before each send.

Do not copy:

- Send history
- Analytics
- Performance
- Logs

Track:

- `copiedFromCampaignId`
- `copiedFromAudienceId`

New campaign:

- Draft only
- Unscheduled

### Phase 3: Reference Data Manager

Replace simple on/off setup areas.

Manage:

- Campaign Types
- Communication Types
- Event Categories
- Tags
- Regions
- Departments
- Statuses

Capabilities:

- Add
- Edit
- Disable
- Archive
- Reassign

Use:

- Soft delete
- Audit history

Renaming updates historical records.

Add:

- Description
- Display Order

Track:

- `createdBy`
- `createdAt`
- `updatedBy`
- `updatedAt`
- `archivedBy`
- `archivedAt`

### Phase 4: Saved Audiences

Support:

- Save audience definitions
- Refresh from Lobo
- Reuse audiences
- Archive audiences

Display:

- Last refresh
- Estimated size
- Owner
- Status

### Phase 5: Activity Timeline

Track events across:

- Constituents
- Campaigns
- Audiences
- Calendar Items
- Imports
- Tasks
- Reference Data
- Admin Settings

Examples:

- Campaign Created
- Campaign Cloned
- Audience Refreshed
- Audience Copied
- Import Completed
- Import Failed
- Calendar Updated
- Setup Area Archived

### Phase 6: Audience Health Review

Detect:

- Stale Lobo Data
- Missing Contact Information
- Duplicate Constituents
- Suppressed Constituents
- Over-contact Risk
- Import Issues

Provide recommendations.

### Phase 7: Campaign Preflight

Before scheduling, verify:

- Audience selected
- Audience refreshed
- Required fields complete
- Owner assigned
- Suppressions reviewed
- Duplicates reviewed
- Tasks completed
- Calendar item attached

### Phase 8: Campaign Lifecycle

Statuses:

- Draft
- Ready For Review
- Approved
- Scheduled
- Completed
- Archived

### Phase 9: Global Search

Search:

- Constituents
- Campaigns
- Audiences
- Calendar
- Tasks
- Notes
- Imports

### Phase 10: Constituent Activity Profile

Show:

- Campaign History
- Audience Membership
- Event Participation
- Tasks
- Notes
- Lobo Refresh History
- Suppressions
- Activity Timeline

### Phase 11: Import History

Track:

- User
- Date
- Source
- Records Added
- Records Updated
- Records Removed
- Errors
- Warnings

### Phase 12: Required Fields Engine

Super Admin configurable requirements for:

- Campaigns
- Audiences
- Events
- Tasks

### Phase 13: Notifications

Support:

- Email
- In-app

Future-ready:

- Teams
- Slack
- SMS

### Phase 14: Scheduled Communication Reminders

Default reminders:

- 14 Days
- 7 Days
- 3 Days
- 1 Day
- Day Of

Include:

- Campaign
- Audience
- Audience Size
- Last Lobo Refresh
- Freshness Status
- Owner
- Link

Add:

- Overdue alerts
- Reminder preferences

Require owner action when overdue:

- Complete
- Reschedule
- Cancel
- Still Pending

### Phase 15: Task Management

Tasks tied to:

- Constituents
- Campaigns
- Audiences
- Calendar
- Imports

Support:

- Priority
- Due Date
- Owner
- Status

### Phase 16: Ownership & Assignment

Assignable:

- Constituents
- Campaigns
- Audiences
- Tasks
- Calendar Items

Filters:

- Assigned To Me
- Unassigned

### Phase 17: Interaction Notes

Support:

- Call
- Meeting
- Event Conversation
- Email Log
- Text Log
- General Note

Allow task creation from notes.

### Phase 18: Contact Frequency Controls

Warn when thresholds are exceeded.

Configurable by:

- Communication Type
- Channel
- Time Window

### Phase 19: Saved Views

Users can save filtered views.

Examples:

- Needs Lobo Refresh
- Open Tasks
- Overdue Campaigns
- Unassigned Records

### Phase 20: Data Quality Dashboard

Track:

- Missing Data
- Invalid Data
- Duplicates
- Stale Lobo Records
- Import Issues
- Missing Ownership

### Phase 21: Suppression Management

Track:

- Reason
- Source
- Start Date
- End Date
- Notes

Prevent accidental inclusion.

### Phase 22: Team Dashboard

Show:

- Workload
- Upcoming Deadlines
- Open Tasks
- Data Quality Issues
- Recent Activity

### Phase 23: Duplicate Management

AI-assisted duplicate review.

Allow:

- Merge
- Dismiss
- Mark Not Duplicate

Audit all merges.

### Phase 24: Export Center

Controlled exports:

- Audiences
- Campaigns
- Activities
- Tasks
- Calendar
- Reports

Audit export activity.

### Phase 25: Campaign Conflict Detection

Warn when audiences overlap.

Show:

- Overlap Count
- Campaign Names
- Conflict Window

Configurable:

- 7 days
- 14 days
- 30 days
- 60 days

### Phase 26: Constituent Journey View

Timeline from constituent perspective.

### Phase 27: Smart Segments

Examples:

- Recently Engaged
- Over Contact Risk
- Needs Follow Up
- Stale Lobo Data
- Missing Information

### Phase 28: Data Confidence Score

Factors:

- Lobo Freshness
- Completeness
- Duplicate Risk
- Valid Contact Info
- Import Health

Display on:

- Constituent
- Audience
- Campaign

### Phase 29: Campaign Comparison

Compare:

- Audience Overlap
- Freshness
- Confidence
- Workload
- Status

### Phase 30: Team Workspaces

Filter by:

- Department
- Team
- Region
- Campaign Group

### Phase 31: Saved Reports

Support recurring reports.

### Phase 32: Admin Rules Engine

Allow configurable rules.

Examples:

- Refresh warning after 30 days
- Frequency warning
- Incomplete preflight warning
- Suppression warning
- Campaign conflict warning

### Phase 33: Bulk Operations

Allow:

- Assign
- Archive
- Tag
- Remove
- Refresh from Lobo
- Export

Audit all actions.

### Phase 34: AI Operational Intelligence

Build AI that analyzes, summarizes, flags, and recommends.

Do not generate communications.

Features:

- AI Campaign Assistant: setup guidance only
- AI Audience Health Review
- AI Constituent Summary
- AI Next Best Action
- AI Duplicate Detection
- AI Import Error Resolver
- AI Campaign Performance Insights
- AI Calendar Description Cleanup
- AI Admin Copilot

Questions AI may answer:

- Which audiences are stale?
- Which campaigns are overdue?
- Which records have low confidence?

### Phase 35: Executive Dashboard

Show:

- Active Campaigns
- Upcoming Communications
- Overdue Communications
- Audience Health
- Lobo Freshness
- Open Tasks
- Data Quality Score
- User Workload

### Phase 36: Communication Calendar

Organization-wide communication visibility.

Show:

- Emails
- Texts
- Events
- Stewardship Touches
- Direct Mail

Filter by:

- Audience
- Date
- Team
- Owner

### Phase 37: Engagement Score

Configurable score using:

- Events
- Participation
- Volunteer Activity
- Survey Activity
- Interactions

### Phase 38: Permission Matrix

Roles:

- Super Admin
- Admin
- Campaign Manager
- Audience Manager
- Viewer

Granular permissions.

### Phase 39: AI Readiness Advisor

Generate:

- Readiness Score
- Risks
- Recommendations

Before campaign scheduling.

### Phase 40: AI Executive Summaries

Generate operational summaries:

- Overdue items
- Data quality issues
- Audience health
- Upcoming deadlines

No content generation.

### Phase 41: Integration Hub

Inspired by 3minapi.

Purpose:

Allow controlled integrations without custom development.

Features:

#### API Keys

- Sandbox Keys
- Production Keys

#### Endpoint Management

Support:

- Constituents
- Campaigns
- Audiences
- Notes
- Tasks
- Calendar
- Imports

#### API Console

Allow:

- Endpoint Testing
- Payload Testing
- Response Review

#### Request Logging

Track:

- Timestamp
- User
- Status
- Errors
- Payload

#### Webhooks

Support:

- Campaign Updated
- Audience Refreshed
- Import Completed
- Task Created
- Calendar Updated

Features:

- Retry Queue
- Failure Logs
- Enable/Disable

Security:

- Token Authentication
- Rate Limiting
- Audit Logging
- Permissions

Super Admin only.

Do not expose unrestricted database access.

## Next Hardening Workstream

After the current Saved Searches work is completed and merged, focus on:

1. Code optimization
2. Data security
3. ADA / WCAG 2.2 AA compliance
4. Developer tagging and documentation

Developer tagging means business-critical code should be documented well enough for a developer unfamiliar with the project to understand:

- Purpose
- Inputs and outputs
- Security considerations
- Related models and routes
- Extension points
- Testing notes
