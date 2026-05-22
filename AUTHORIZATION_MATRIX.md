# Authorization Matrix

Control taxonomy: **Preventative (P)** | **Detective (D)** | **Compensating (C)** | **Operational assumption (O)**

Enforcement layers: **route** | **service** | **database** | **infrastructure** | **logging**

## Auth & session

| Route | Method | Role | Middleware | Notes |
|-------|--------|------|------------|-------|
| `/api/healthz` | GET | Public | — | SAML health in body |
| `/api/auth/login` | POST | Public | rate limit (P/route) | TOTP split admin; `password_login_disabled` dummy timing (P/service) |
| `/api/auth/login/totp` | POST | Public | pending session (P/service) | Lockout parity |
| `/api/auth/saml/enabled` | GET | Public | — | Login UI flag |
| `/api/auth/saml/metadata` | GET | Public | SAML enabled | 5m cache |
| `/api/auth/saml/login` | GET | Public | rate limit | returnTo validated (P/service) |
| `/api/auth/saml/acs` | POST | Public | rate limit, no-store | Full SAML validation (P/service); session regen (P/service) |
| `/api/auth/saml/sp-info` | GET | super_admin | requireRole | SP URLs |
| `/api/auth/me` | GET | Auth | requireAuth | |
| `/api/settings` | GET | Auth | requireAuth | `samlEnabled` for all; full SAML config super_admin only |
| `/api/settings/saml` | PATCH | super_admin | requireRole | Zod strict |
| `/api/settings/saml/refresh-metadata` | POST | super_admin | requireRole | |
| `/api/users` | GET/PATCH | admin+ | requireRole | Role sync lock for SAML users (P/service) |

## SAML trust transitions

| Transition | Controls |
|------------|----------|
| Assertion → session | Signature, pinned cert fingerprint, issuer/audience/recipient, time skew, InResponseTo, replay table (P/service + P/DB) |
| Groups → role | `saml_role_group_map`, most-privileged-wins (P/service); optional sync toggle |
| NameID → user | Unique index `users.saml_subject_nameid` (P/DB) |
| Email → account | Normalized lookup before JIT (P/service) |
| JIT → user row | Domain allowlist only (P/service); audit `saml_jit_provisioned` (D/logging) |
| RelayState → redirect | Relative path only `/...` (P/service) |
| Metadata → signing cert | HTTPS + host allowlist + SHA-256 pin (P/service + O/env) |

## Campaigns (representative)

| Route | Method | Role | Ownership |
|-------|--------|------|-----------|
| `/api/campaigns/:id` | PATCH | Auth | `canMutateCampaign` (P/service) |
| `/api/campaigns/:id` | DELETE | super_admin | + `requireRecentAuth` (P/route) |

Full route inventory: `artifacts/api-server/src/routes/*.ts` (24 routers). OpenAPI: `lib/api-spec/openapi.yaml`.
