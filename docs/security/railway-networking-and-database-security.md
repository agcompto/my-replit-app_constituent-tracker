# Railway Networking and Database Security

Related issues:

- #28 Security Hardening
- Future Integration Hub work

## Purpose

Define the approved database connectivity model, environment variable expectations, and networking standards for the Constituent Operations Platform.

## Security Principle

Internal services should communicate using private networking whenever possible.

Avoid routing internal application-to-database traffic through public endpoints.

Benefits:

- Reduced attack surface
- Reduced exposure of infrastructure endpoints
- Lower networking costs
- Avoidance of Railway egress charges where applicable
- Better alignment with least-privilege architecture

## Known Warning

A prior Railway warning identified a configuration similar to:

DATABASE_PUBLIC_URL -> RAILWAY_TCP_PROXY_DOMAIN

This can cause internal traffic to traverse public networking paths.

## Preferred Configuration

Application services should use Railway private networking.

Preferred pattern:

DATABASE_URL -> RAILWAY_PRIVATE_DOMAIN

The exact variable names may vary by Railway service configuration, but the objective remains:

- API server uses private database connectivity.
- Internal traffic stays inside Railway networking.

## Environment Variable Standards

### Required

- DATABASE_URL
- APP_PUBLIC_URL
- NODE_ENV
- PORT

### Recommended

- TRUST_PROXY
- ALLOWED_ORIGINS

### Sensitive

The following must never be logged:

- Database passwords
- Session secrets
- SAML secrets
- API keys
- Encryption keys
- Future webhook secrets

## Database Security Requirements

### Authentication

- Unique credentials per environment
- Production credentials separate from development
- No shared personal credentials

### Access Control

- Application account receives minimum required permissions
- Administrative access restricted to approved operators

### Backups

- Verify automated backup strategy
- Verify recovery process documentation

### Encryption

- Encryption in transit
- Encryption at rest where supported

## Logging Requirements

Never log:

- Connection strings
- Passwords
- Secrets
- Tokens
- API keys

Use redaction whenever tokenized routes are introduced.

## Future Features Requiring Review

Before implementation, review networking and secret handling for:

- Calendar feeds
- Public embeds
- API keys
- Integration Hub
- Webhooks
- AI integrations

## Verification Checklist

- Confirm API service uses private database networking.
- Confirm no production service relies on DATABASE_PUBLIC_URL for internal traffic.
- Confirm Railway networking configuration is documented.
- Confirm secrets are injected through environment variables.
- Confirm sensitive values are excluded from logs.

## Guardrail Confirmation

No communication-authoring functionality is included in this document.

This guidance supports platform security, governance, and operational integrity only.