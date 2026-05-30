# AI Module

This module centralizes all AI functionality for the Constituent Tracker.

## Initial Use Cases

1. Constituent Touch Summary
2. Campaign Risk Review
3. Communication Frequency Explanation
4. Dashboard Narrative Insights

## Guardrails

- Avoid sending names, email addresses, phone numbers, street addresses, and gift amounts.
- Use constituent IDs and communication metadata whenever possible.
- Log all AI requests for auditability.
- Enforce role-based access controls.

## Environment Variables

OPENAI_API_KEY=
AI_ENABLED=true
AI_MODEL=gpt-4.1-mini
