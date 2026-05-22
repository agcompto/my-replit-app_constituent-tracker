# Deployment on Railway

This app is designed to run as **one Railway web service**: the API serves `/api/*` and the production Vite build from the same process. Replit uses two services (API + static); Railway is simpler with a combined deploy.

## Recommended topology

| Option | When to use |
|--------|-------------|
| **One service (recommended)** | Default. API + SPA on one domain; session cookies on `/api` work with same-site fetches. |
| **Two services** | Only if you need a separate CDN for static files. Requires `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, and CORS tuning. |

## Railway service settings

| Setting | Value |
|---------|--------|
| **Root directory** | `/` (repository root) |
| **Build command** | `pnpm install && pnpm run build:deploy` |
| **Start command** | `pnpm run start` |
| **Health check path** | `/api/healthz` |

Railway injects **`PORT`** automatically. The server reads `process.env.PORT` and fails fast if it is missing (do not hardcode a port in the start command).

## PostgreSQL

1. Add a **PostgreSQL** plugin to the project (or attach an existing database).
2. Railway sets **`DATABASE_URL`** on the web service (reference variable from the database service).
3. External Railway Postgres URLs usually include `sslmode=require`. The app enables TLS when:
   - `DATABASE_URL` contains `sslmode=require`, or
   - `DATABASE_SSL=1`, or
   - `PGSSLMODE=require`
4. **Schema migration** (run once per release, from your machine or a Railway one-off shell):

   ```bash
   export DATABASE_URL="<from Railway>"
   pnpm --filter @workspace/db run push
   ```

   Do not run `push` on every deploy unless you intend to apply schema changes.

## Required environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | From Railway Postgres |
| `SESSION_SECRET` | Yes | Long random string (32+ bytes). Rotating invalidates sessions and TOTP secrets. |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Auto | Set by Railway — do not override unless you know why |

## Strongly recommended

| Variable | Purpose |
|----------|---------|
| `APP_PUBLIC_URL` | Public HTTPS origin, e.g. `https://your-app.up.railway.app` — password links, SAML SP URLs, CORS |
| `REPLIT_DOMAINS` | Not needed on Railway |
| `RAILWAY_PUBLIC_DOMAIN` | Often set automatically by Railway; used as fallback for public URLs and CORS |

## Optional

| Variable | Purpose |
|----------|---------|
| `ALLOWED_ORIGINS` | Comma-separated extra CORS origins (split frontend only) |
| `STATIC_WEB_ROOT` | Override path to SPA build (default: `artifacts/touchpoint-planner/dist/public`) |
| `SAML_IDP_CERT_FINGERPRINT_SHA256` | Required if SAML SSO is enabled |
| `SAML_SP_ENTITY_ID` / `SAML_ACS_URL` | Override SAML endpoints |
| `RESEND_API_KEY` + `EMAIL_FROM` | Transactional email for invites/resets |
| `PASSWORD_HIBP_DISABLED` | Set `1` only for isolated test environments |
| `LOG_LEVEL` | Default `info` |
| `DATABASE_SSL` | Set `1` to force SSL if URL omits `sslmode` |
| `DATABASE_POOL_MAX` | Default `10` |

## SAML on Railway

1. Set `APP_PUBLIC_URL` to your Railway HTTPS URL.
2. In Entra, use:
   - **Entity ID:** `{APP_PUBLIC_URL}/api/auth/saml/metadata`
   - **ACS:** `{APP_PUBLIC_URL}/api/auth/saml/acs`
3. Configure fingerprints and IdP metadata URL in app settings (super_admin).

## Build output layout

```
artifacts/touchpoint-planner/dist/public/   # Vite SPA (index.html, assets)
artifacts/api-server/dist/index.mjs         # Node entrypoint
```

The API resolves the SPA path relative to `dist/index.mjs` unless `STATIC_WEB_ROOT` is set.

## Local verification before deploy

```bash
pnpm install
pnpm run build:deploy
export DATABASE_URL="postgresql://..."
export SESSION_SECRET="..."
export APP_PUBLIC_URL="http://127.0.0.1:8080"
export PORT=8080
export NODE_ENV=production
pnpm run start
# Open http://127.0.0.1:8080/ and http://127.0.0.1:8080/api/healthz
```

## Security notes

- Session cookies: `httpOnly`, `sameSite=strict`, `secure` in production, path `/api`.
- CORS: production fails closed unless `APP_PUBLIC_URL`, `RAILWAY_PUBLIC_DOMAIN`, `REPLIT_DOMAINS`, or `ALLOWED_ORIGINS` includes the browser origin.
- Never commit `.env` files (listed in `.gitignore`).
- Bootstrap admin setup URL is printed to **stderr** on first boot only — read Railway deploy logs once.

## Replit vs Railway

| | Replit | Railway (this guide) |
|---|--------|----------------------|
| Services | API + static web split | Single Node service |
| Public URL | `REPLIT_DOMAINS` | `APP_PUBLIC_URL` / `RAILWAY_PUBLIC_DOMAIN` |
| CORS | Replit domains | `ALLOWED_ORIGINS` + public URL helpers |
| Static files | Replit CDN | Express `static` + SPA fallback |

Replit-specific Vite plugins are disabled when `REPL_ID` is unset (normal on Railway).
