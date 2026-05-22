# Security Checklist

## SAML / Entra

- [ ] `SAML_IDP_CERT_FINGERPRINT_SHA256` set (comma-separated for rollover)
- [ ] `SAML_IDP_METADATA_HOST_ALLOWLIST` restricts metadata fetch host
- [ ] Entra app: Identifier = SP Entity ID; Reply URL = ACS; Sign-on URL = `/api/auth/saml/login`
- [ ] Group claims = Group ID, security groups assigned to app
- [ ] JIT domains configured in Settings → Single Sign-On
- [ ] Group Object IDs pasted into role map when sync enabled
- [ ] Bootstrap super-admin password login remains available for break-glass

## Controls verified in code

| Control | Type | Layer |
|---------|------|-------|
| Pinned IdP cert SHA-256 | P | service + env |
| Assertion replay table | P | database |
| Session regenerate on ACS | P | service |
| Password login disabled + timing parity | P | service |
| SAML admin skips app TOTP (Entra CA) | C | service |
| Password admin still requires TOTP | P | service |
| returnTo relative-only | P | service |
| Audit `saml_login_rejected` | D | logging |
| helmet / CSP on API | P | route |
| Session cookie httpOnly strict /api | P | infrastructure |

## Tests

Run: `pnpm --filter @workspace/api-server run test`

Includes `security.adversarial.test.ts` (returnTo, weak algorithms, SSRF guard, OpenAPI smoke).
