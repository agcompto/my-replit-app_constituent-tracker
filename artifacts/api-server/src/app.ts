import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, applyRoleSessionTtl } from "./lib/session";
import { attachUser } from "./lib/auth";

const app: Express = express();

// `trust proxy: 1` is correct for Replit's single-hop proxy. Do not set to
// `true` — that would let clients spoof X-Forwarded-For and bypass per-IP
// rate limiting / lockout.
app.set("trust proxy", 1);
// Don't advertise the framework — small but standard practice.
app.disable("x-powered-by");

const allowedOrigins = (process.env.REPLIT_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .flatMap((d) => [`https://${d}`, `http://${d}`]);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        // Strip query string AND redact bearer-style path tokens so
        // password-setup links never appear verbatim in request logs.
        // The full token is enough to take over an account, so a single
        // log line capturing it is enough to compromise a user.
        const rawUrl = req.url?.split("?")[0] ?? "";
        // Routes are mounted under /api, so live request URLs are
        // /api/password-setup/:token[/complete] — the regex must match
        // both the bare and /api-prefixed forms or the redaction is a
        // no-op and tokens leak verbatim into access logs.
        const url = rawUrl.replace(
          /^(\/api)?\/password-setup\/[^/]+(\/complete)?$/,
          "$1/password-setup/[REDACTED]$2",
        );
        return {
          id: req.id,
          method: req.method,
          url,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // Allow same-origin / non-browser requests (no Origin header)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true); // dev fallback
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed by CORS"));
    },
  }),
);
// Defense-in-depth: this app holds non-public constituent data and must never
// appear in search engines or AI training corpora. Send a strong X-Robots-Tag
// header on every API response in addition to the meta tag and robots.txt on
// the static frontend.
app.use((_req, res, next) => {
  res.setHeader(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex",
  );
  next();
});
// helmet baseline. CSP for the API itself is intentionally strict — the API
// returns JSON, never inline scripts/styles. The static frontend ships its
// own CSP via index.html if/when it needs one.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "same-origin" },
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: false,
    },
    // We already set X-Robots-Tag explicitly above; helmet doesn't.
  }),
);
// Tight global body limit. Routes that legitimately accept large payloads
// (audience uploads) override this with a per-route express.json({limit}).
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(sessionMiddleware);
app.use(attachUser);
// Re-apply the per-role session TTL on every request. With rolling sessions,
// express-session resets cookie.maxAge to the middleware default on every
// response, which would otherwise silently re-extend super_admin sessions
// from 4h back to 12h. Must run AFTER attachUser.
app.use(applyRoleSessionTtl);

// Block all API access (except a small allowlist) for users who must change their password.
const passwordChangeAllowlist = new Set([
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "POST /api/auth/change-password",
  "GET /api/healthz",
]);
app.use((req, res, next) => {
  if (!req.currentUser?.mustChangePassword) return next();
  const key = `${req.method} ${req.path}`;
  if (passwordChangeAllowlist.has(key)) return next();
  if (!req.path.startsWith("/api")) return next();
  res.status(403).json({
    error: "Password change required before continuing.",
    code: "must_change_password",
  });
});

app.use("/api", router);

export default app;
