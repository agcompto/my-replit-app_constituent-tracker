# Phase 0 Accessibility Review

Date: 2026-06-01  
Scope: `artifacts/touchpoint-planner/src/App.tsx`, route pages, shared UI components, tables, forms, dialogs, dropdowns, modals, navigation, buttons, error states, and loading states.

## Executive Summary

The frontend has a solid accessibility foundation because it uses reusable UI primitives, semantic components, labels, dialogs, alerts, loading states, and an authenticated app shell. The main Phase 0 accessibility risk is consistency: future roadmap expansion will add more complex calendars, tables, dashboards, filters, modals, and admin tooling. Those features need a repeatable WCAG 2.2 AA review gate before release.

No UI code changes were made in this pass.

## Findings and Plan Documented Before Expansion

### Repository/UI Structure Reviewed

- `App.tsx` defines routes, app providers, query defaults, and authenticated routing.
- `components/ui/` contains reusable primitives for buttons, dialogs, dropdowns, tables, forms, selects, sheets, tooltips, toasts, pagination, and related controls.
- `pages/` contains dashboard, campaigns, donors, reports, exports, audit, settings, users, calendar, and auth pages.
- `components/patterns/` contains shared loading/empty/page-header patterns.

### Implementation Plan for Accessibility Remediation

1. Establish WCAG 2.2 AA as the target.
2. Add keyboard-only manual test coverage for each primary workflow.
3. Add screen-reader spot checks for dialogs, tables, filters, and form errors.
4. Standardize page-level headings, landmarks, loading announcements, and empty/error state copy.
5. Prioritize complex tables and future calendar views for deeper testing.
6. Add automated checks where feasible, but do not rely on automation alone.

## Audit Areas

### Tables

Current table-heavy areas include campaigns, donors/constituents, audit log, reports, exports, and user/admin screens.

Checklist:

- Use semantic `<table>`, `<thead>`, `<tbody>`, `<th>`, and `<td>` where tabular data is shown.
- Ensure sortable headers expose state with `aria-sort` when sorting is implemented.
- Provide accessible names for row actions.
- Preserve keyboard access to pagination and filters.
- Provide empty states and loading states that explain what is happening.
- For large future datasets, evaluate virtualization carefully so screen-reader and keyboard navigation remain usable.

### Forms

Checklist:

- Every input, select, textarea, checkbox, and radio group needs an associated label or accessible name.
- Required fields should be visually and programmatically identified.
- Validation errors should be linked to fields with `aria-describedby` where practical.
- Form submissions should not rely on color alone to indicate errors.
- Destructive forms should include confirmation and clear recovery paths.

### Dialogs / Modals / Sheets

Checklist:

- Dialogs need accessible titles and descriptions.
- Focus should move into the dialog on open and return to the trigger on close.
- Escape behavior should be predictable unless blocked for a documented reason.
- Destructive dialogs should announce consequences and require intentional confirmation.
- Reauth dialogs should clearly explain why reauthentication is required.

### Dropdowns / Selects / Popovers

Checklist:

- Trigger controls need visible and programmatic labels.
- Menus should support keyboard navigation and dismissal.
- Multi-select controls should expose selected state and removal controls accessibly.
- Popovers that contain interactive content must manage focus predictably.

### Navigation

Checklist:

- The app shell should expose clear landmarks.
- Active navigation state should be indicated visually and programmatically.
- Keyboard shortcut help should not interfere with standard browser or assistive technology shortcuts.
- Future global search should be reachable by keyboard and labeled clearly.

### Buttons and Interactive Controls

Checklist:

- Icon-only buttons need accessible names.
- Disabled states should explain why an action is unavailable where the reason is not obvious.
- Loading buttons should expose busy state or equivalent text.
- Destructive actions should be visually distinct and confirmed when high risk.

### Error States

Checklist:

- Errors should be plain-language and actionable.
- Error summaries should be announced to screen readers for form submissions.
- Avoid leaking sensitive implementation details in user-visible errors.
- Preserve focus when validation fails.

### Loading States

Checklist:

- Loading indicators should have accessible text, not only animation.
- Long-running actions such as exports should show progress or a clear pending state.
- Avoid layout shifts that move the user's focus unexpectedly.

## Roadmap-Specific Accessibility Risks

| Future phase | Accessibility risk | Mitigation |
| --- | --- | --- |
| Calendar publishing | Keyboard grid navigation, timezone clarity, public noindex pages | Use tested calendar patterns and list fallback. |
| Weekly digest settings | Complex filters and unsubscribe/test-send workflows | Label controls and expose validation. |
| Reference data manager | Sort/reassign/archive flows | Ensure drag/sort alternatives and confirmations. |
| Activity timeline | Dense chronological content | Provide headings, filters, and screen-reader-friendly grouping. |
| Global search | Command/search interactions | Label input, announce result counts, support keyboard navigation. |
| Data quality dashboards | Charts and risk badges | Provide text summaries and non-color indicators. |
| Integration Hub | API key handling and logs | Clear labels, masked secrets, confirmation dialogs. |

## Manual Test Steps

1. Navigate the authenticated app shell using only keyboard.
2. Open and close campaign clone/delete dialogs and confirm focus returns to the trigger.
3. Complete a campaign setup form with missing fields and confirm errors are announced/readable.
4. Navigate campaigns/donors/audit tables by keyboard and verify row actions have accessible names.
5. Trigger loading and error states for reports/exports and confirm the state is visible in text.
6. Use a screen reader spot check on dashboard, campaign detail, donors, and settings pages.

## Guardrail Confirmation

This review adds documentation only. It does not add communication-authoring, solicitation, SMS, email-copy, or stewardship-message generation features.
