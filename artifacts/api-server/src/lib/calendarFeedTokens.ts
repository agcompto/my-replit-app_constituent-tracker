import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function generateCalendarFeedToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCalendarFeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isCalendarFeedTokenFormat(token: string): boolean {
  return FEED_TOKEN_PATTERN.test(token);
}
