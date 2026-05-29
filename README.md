# Constituent Tracker

Production-ready constituent tracking and communication planning platform.

## Stack

- Node.js 22
- pnpm workspaces
- Express API
- React + Vite frontend
- PostgreSQL
- Drizzle ORM
- SAML SSO support

## Recommended Hosting

Recommended production host: Railway

Why:
- Excellent Node + PostgreSQL support
- Handles monorepos cleanly
- Automatic HTTPS
- Environment variable management
- Easy scaling and deployments
- Works well with Express + Vite hybrid apps

## Environment Variables

Copy `.env.example` and configure:

```bash
cp .env.example .env
```

Required:

- DATABASE_URL
- SESSION_SECRET
- PORT
- APP_PUBLIC_URL

## Install

```bash
pnpm install
```

## Local Development

```bash
pnpm dev
```

## Database Setup

Apply schema:

```bash
pnpm run db:push
```

## Production Build

```bash
pnpm run build:deploy
```

## Start Production Server

```bash
pnpm start
```

## Docker Deployment

Build:

```bash
docker build -t constituent-tracker .
```

Run:

```bash
docker run -p 8080:8080 --env-file .env constituent-tracker
```

## Health Checks

Application health endpoint:

```text
/api/healthz
```

Returns:
- database connectivity
- SAML metadata health
- runtime readiness

## Security Hardening Included

- Secure HTTP headers via Helmet
- Credentialed CORS allowlists
- Session-based authentication
- PostgreSQL-backed sessions
- Login and SAML rate limiting
- Replay protection for SAML assertions
- Graceful shutdown handling
- Structured logging with redaction
- Production-only secure cookies
- Supply-chain protections via pnpm minimum release age

## Deployment Notes

### Railway

Build command:

```bash
pnpm install --frozen-lockfile && pnpm run build:deploy
```

Start command:

```bash
pnpm start
```

### Render

Use:
- Node 22
- pnpm
- PostgreSQL service

### Fly.io

Works well with the included Dockerfile.

## Recommended Next Steps

- Add Redis-backed distributed rate limiting for horizontal scaling
- Add CI/CD workflow validation
- Add automated database backups
- Add observability (OpenTelemetry/Sentry)
- Add secret rotation policies
