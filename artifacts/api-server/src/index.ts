import { closeDb } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaults } from "./lib/seed";
import { startRetentionScheduler, stopRetentionScheduler } from "./lib/retention";
import { validateEnv } from "./lib/env";

validateEnv();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedDefaults().catch((err) => {
  logger.error({ err }, "Failed to seed defaults");
});

// Start the in-process retention scheduler. The scheduler is a no-op until
// a super-admin enables it via PATCH /retention/schedule, and serializes
// across replicas via a Postgres advisory lock.
startRetentionScheduler();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Graceful shutdown. Without this, SIGTERM (deploys, container restarts)
// drops in-flight exports/audience uploads on the floor and leaves the PG
// pool's sockets in TIME_WAIT. The handler:
//   1. Stops accepting new connections (server.close())
//   2. Waits up to SHUTDOWN_TIMEOUT_MS for in-flight requests to finish
//   3. Closes the PG pool
//   4. Hard-exits if step 2 stalls
const SHUTDOWN_TIMEOUT_MS = 25_000;
let shuttingDown = false;
function gracefulShutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received; draining");
  const forceExit = setTimeout(() => {
    logger.error(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "Graceful shutdown timed out; forcing exit",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't block process exit on the timer itself.
  forceExit.unref();
  stopRetentionScheduler();
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error closing HTTP server");
    }
    closeDb()
      .then(() => {
        logger.info("Shutdown complete");
        clearTimeout(forceExit);
        process.exit(0);
      })
      .catch((poolErr: unknown) => {
        logger.error({ err: poolErr }, "Error closing DB pool");
        clearTimeout(forceExit);
        process.exit(1);
      });
  });
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
