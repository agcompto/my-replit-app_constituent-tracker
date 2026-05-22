import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, applyRoleSessionTtl } from "./lib/session";
import { attachUser } from "./lib/auth";
import { mountProductionWeb } from "./lib/staticWeb";

const app: Express = express();

// `trust proxy: 1` is correct for Replit's single-hop proxy. Do not set to
// `true` — that would let clients spoof X-Forwarded-For and bypass per-IP
// rate limiting / lockout.
app.set("trust proxy", 1);
// Don't advertise the framework — small but standard practice.
app.disable("x-powered-by");

function buildAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (url: string) => {
    const trimmed = url.trim().replace(/\/$/, "");
    if (trimmed) origins.add(trimmed);
  };
  for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
    const host = d.trim();
    if (!host) continue;
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  for (const o of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    add(o);
  }
  if (process.env.APP_PUBLIC_URL) add(process.env.APP_PUBLIC_URL);
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  return [...origins];
}

const allowedOrigins = buildAllowedOrigins();

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
      // Fail closed in production when REPLIT_DOMAINS is unset.
      if (allowedOrigins.length === 0) {
        if (process.env.NODE_ENV === "production") {
          return cb(new Error("Origin not allowed by CORS"));
        }
        return cb(null, true);
      }
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

/** Token-based setup/reset routes must stay reachable even when the browser
 *  still holds an old session with `mustChangePassword` (common on first boot). */
function isPasswordSetupRoute(method: string, path: string): boolean {
  if (method === "GET" && /^\/api\/password-setup\/[^/]+$/.test(path)) return true;
  if (method === "POST" && /^\/api\/password-setup\/[^/]+\/complete$/.test(path)) {
    return true;
  }
  return false;
}

function isSamlPublicRoute(method: string, path: string): boolean {
  if (method === "GET" && path.startsWith("/api/auth/saml/")) return true;
  if (method === "POST" && path === "/api/auth/saml/acs") return true;
  return false;
}

app.use((req, res, next) => {
  if (!req.currentUser?.mustChangePassword) return next();
  const key = `${req.method} ${req.path}`;
  if (passwordChangeAllowlist.has(key)) return next();
  if (isPasswordSetupRoute(req.method, req.path)) return next();
  if (isSamlPublicRoute(req.method, req.path)) return next();
  if (!req.path.startsWith("/api")) return next();
  res.status(403).json({
    error: "Password change required before continuing.",
    code: "must_change_password",
  });
});

app.use("/api", router);

mountProductionWeb(app);

// Central error handler — unhandled async rejections and middleware errors.
app.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const log = (req as Request & { log?: { error: (o: unknown, msg: string) => void } }).log;
    if (log) {
      log.error({ err }, "Unhandled request error");
    } else {
      logger.error({ err }, "Unhandled request error");
    }
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message === "Origin not allowed by CORS"
        ? 403
        : message.includes("Not allowed")
          ? 403
          : 500;
    res.status(status).json({
      error: status === 500 ? "Internal server error" : message,
    });
  },
);

export default app;
