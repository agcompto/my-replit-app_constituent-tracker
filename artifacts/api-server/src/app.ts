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

// Allow configurable reverse-proxy trust for Railway, Render, Fly.io,
// Replit, and other hosted environments.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", trustProxy === "true" ? true : Number(trustProxy));
} else if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

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
        const rawUrl = req.url?.split("?")[0] ?? "";
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
      if (!origin) return cb(null, true);
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
app.use((_req, res, next) => {
  res.setHeader(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex",
  );
  next();
});
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
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false,
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(sessionMiddleware);
app.use(attachUser);
app.use(applyRoleSessionTtl);

const passwordChangeAllowlist = new Set([
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "POST /api/auth/change-password",
  "GET /api/healthz",
]);

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
