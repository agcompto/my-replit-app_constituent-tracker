# Phase 1 Calendar Publishing Build Plan

## Decision After PR 45 Conflict Loop

The archiver compatibility work should be paused on the conflicted PR path. The current branch has been reverted back to the target-base tree for that work so the team can close or clear the conflicted PR before attempting the archiver runtime fix again in a fresh branch.

The next product build item is Phase 1: Calendar Publishing & Scheduling.

## Current Repository Findings

### Repository Structure

- API routes live under `artifacts/api-server/src/routes` and are mounted from the API application.
- The API uses Express middleware with `attachUser`, `requireAuth`, `requireRole`, `requireRecentAuth`, and shared audit helpers.
- Database schema is centralized in `lib/db/src/schema/index.ts` using Drizzle `pgTable` definitions.
- The React application uses Wouter routes in `artifacts/touchpoint-planner/src/App.tsx` and already has a `/calendar` route placeholder/page.
- The UI shell already includes a Calendar navigation item.

### Current Data Model

Existing calendar-adjacent data is campaign/touch driven:

- `campaigns` store operational campaign status, owner, intended send date, audience metadata, and lifecycle timestamps.
- `touches` store per-campaign communication touch dates and channels.
- `audit_log` is already available for operational event recording.

There are no dedicated calendar, calendar event, sharing, visibility, or feed token tables yet.

### Current Auth and Audit Patterns

Phase 1 should reuse existing patterns:

- Private calendar routes require `requireAuth`.
- Admin-only calendar settings and token regeneration should use `requireRole("admin", "super_admin")` or `requireRole("super_admin")`, depending on final governance.
- High-risk actions such as publishing, unpublishing, deleting, and regenerating feed tokens should call `audit(...)`.
- Ownership checks should mirror campaign patterns: standard users can mutate only records they own, while admin and super-admin users can manage globally.

### Current UI Routing Pattern

The current Wouter router already includes a `/calendar` authenticated route. Phase 1 should enhance that page rather than add an unrelated navigation surface.

### Email / Notification Infrastructure

No Phase 1 outbound email is required. Calendar publishing should not send constituent communications. Google Calendar support should be a subscription URL only, not an outbound invite or email.

## Proposed Phase 1 Scope

### Include In First Calendar PR Series

1. Calendar schema and migration-ready Drizzle definitions.
2. Private operational calendar API.
3. Calendar event CRUD.
4. Campaign/touch linking where possible.
5. Public sharing controls.
6. Feed token regeneration.
7. ICS feed endpoint.
8. Authenticated grid/list UI.
9. Public read-only calendar page with `noindex` protections.
10. Security, accessibility, and performance documentation updates.

### Defer From First Calendar PR Series

- Weekly digest email delivery.
- Slack/Teams integrations.
- AI-generated outbound copy.
- Constituent-facing communications.
- Full organizational communication calendar analytics.
- Complex recurrence rules beyond basic date/time events.

## Recommended PR Breakdown

### PR 1: Calendar Schema and API Foundation

Status update (2026-06-02): schema exports have been added for the core Phase 1 calendar tables in `lib/db/src/schema/index.ts`. Private API routes, audit wiring, and UI workflows remain the next implementation items.

Add:

- `calendars`
- `calendar_events`
- `calendar_visibility_rules`
- `calendar_shares`
- `calendar_feed_tokens`

API endpoints:

- `GET /api/calendars`
- `POST /api/calendars`
- `GET /api/calendars/:id`
- `PATCH /api/calendars/:id`
- `DELETE /api/calendars/:id`

Security:

- Auth required for all private routes.
- Owner/admin visibility checks.
- Audit logs for create/update/delete.
- Input validation for all request bodies and params.

### PR 2: Calendar Event Scheduling

API endpoints:

- `GET /api/calendars/:id/events`
- `POST /api/calendars/:id/events`
- `GET /api/calendar-events/:id`
- `PATCH /api/calendar-events/:id`
- `DELETE /api/calendar-events/:id`

Event fields:

- title
- description
- startsAt
- endsAt
- timezone defaulting to America/New_York
- allDay
- ownerUserId
- campaignId
- audience or segment reference placeholder
- visibility
- deletedAt

Security:

- Events inherit calendar access.
- Public calendars remain read-only.
- Deleted events are excluded from feeds and normal list endpoints.

### PR 3: ICS Feed and Public Sharing

Add:

- Tokenized ICS feed endpoint.
- Downloadable ICS route.
- Google Calendar subscription URL helper.
- Token regeneration endpoint.
- Public calendar read-only endpoint/page.
- `X-Robots-Tag: noindex` or page-level noindex handling for public calendar pages.

Security:

- Feed tokens should be high entropy and stored hashed where feasible.
- Token regeneration should invalidate old feed tokens.
- Public feeds should expose operational calendar fields only, never sensitive notes or constituent PII.
- All token regeneration and publish/unpublish actions must be audited.

### PR 4: Calendar UI

Add:

- Calendar list view.
- Calendar grid view.
- Event form dialog/page.
- Share settings panel.
- Copy subscription URL action.
- Token regeneration confirmation.

Accessibility:

- Keyboard navigation for grid/list.
- Accessible event dialogs.
- Form labels and validation messages.
- Visible focus states.
- Loading and error states.

### PR 5: Documentation and Review Closeout

Update:

- Security review.
- Accessibility review.
- Performance review.
- Data model overview.
- Architecture overview.
- Manual testing checklist.

## Migration Notes

Use soft-delete behavior for events and calendars where possible:

- `deletedAt` for events.
- `archivedAt` or `deletedAt` for calendars.
- Old feed tokens should be invalidated via `revokedAt` rather than hard deletion.

Index recommendations:

- calendar owner and visibility.
- event calendar/date range.
- campaign-linked events.
- feed token hash.
- public slug/token lookups.

## Security Requirements

- Private calendars are private by default.
- Public sharing is opt-in.
- Public calendars and feeds are read-only.
- Public endpoints must not reveal email addresses, phone numbers, mailing addresses, unrestricted notes, tokens, credentials, or raw constituent records.
- All private routes require auth.
- Admin/global operations require role checks.
- Standard users must pass ownership checks before mutation.
- Token regeneration, publish, unpublish, create, update, and delete actions must be audited.
- Public pages and feeds should include noindex protections.

## Accessibility Requirements

- Calendar grid must not rely on color alone.
- Grid cells need meaningful labels for dates and event counts.
- Event actions must be reachable by keyboard.
- Dialogs must trap focus and return focus on close.
- Forms need visible labels, descriptions, and error messages.
- Loading and empty states must be screen-reader friendly.

## Performance Requirements

- Calendar event queries should be date-range scoped.
- UI should avoid loading all historical events by default.
- ICS feeds should stream or cap generated events.
- Public feed responses should use safe cache headers, with care around tokenized URLs.
- Route-level code splitting should be considered if the calendar UI adds large dependencies.

## Manual Test Plan

1. Create a private calendar as an authenticated user.
2. Confirm another standard user cannot edit it.
3. Confirm an admin can manage it if global calendar governance permits.
4. Create events with Eastern Time defaults.
5. Link an event to a campaign where applicable.
6. Delete an event and confirm it disappears from the ICS feed.
7. Enable public sharing and verify public read-only access.
8. Regenerate the feed token and confirm the old URL no longer works.
9. Confirm public pages are noindexed.
10. Confirm audit log entries exist for create/update/delete/share/token actions.
11. Keyboard-test grid, list, dialogs, and share settings.
12. Confirm no email, SMS, solicitation, stewardship, or outbound message authoring was added.

## Assumptions

- Eastern Time should be represented as `America/New_York`, not a fixed EST offset, so daylight saving time is handled correctly.
- The first calendar implementation can use explicit single events before recurrence support.
- Public calendar sharing is operational visibility only and not constituent communication.
- Calendar events may link to campaigns/touches but should not duplicate campaign send history or analytics.

## Risks

- Public token leakage if feed URLs are copied too broadly.
- Accidentally exposing internal notes in public feeds/pages.
- Large ICS feeds if queries are not bounded.
- Calendar grid accessibility regressions if keyboard and screen-reader behavior are not designed up front.
- Confusion between operational calendar publishing and outbound communication authoring.

## Confirmation

This plan does not add communication-authoring functionality, does not send constituent communications, and does not generate outreach copy.
