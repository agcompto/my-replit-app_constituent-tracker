import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { logger } from "./logger";

/** Directory containing Vite build output (`index.html` + assets). */
export function resolveStaticWebRoot(): string | null {
  if (process.env.STATIC_WEB_ROOT) {
    const root = path.resolve(process.env.STATIC_WEB_ROOT);
    return fs.existsSync(path.join(root, "index.html")) ? root : null;
  }
  const apiDist = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(apiDist, "../../touchpoint-planner/dist/public");
  return fs.existsSync(path.join(candidate, "index.html")) ? candidate : null;
}

/** Serve built SPA after API routes (single-service production deploy). */
export function mountProductionWeb(app: Express): void {
  const root = resolveStaticWebRoot();
  if (!root) {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "Frontend build not found (expected touchpoint-planner/dist/public). Only /api will be served.",
      );
    }
    return;
  }
  logger.info({ root }, "Serving static web assets");
  app.use(express.static(root, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(root, "index.html"), (err) => (err ? next(err) : undefined));
  });
}
