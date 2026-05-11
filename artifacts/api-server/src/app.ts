import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { attachUser } from "./lib/auth";

const app: Express = express();

app.set("trust proxy", 1);

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
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
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
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(sessionMiddleware);
app.use(attachUser);

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
