/**
 * Unit tests for the multi-slot export quota helpers used by the bulk
 * export endpoints. The bulk endpoints must be able to (a) ask how many
 * export slots a user has left in the rolling hour and (b) consume N at
 * once, since a 5-campaign bulk download must count as 5 against the
 * 20/hour cap — not 1.
 */
import { describe, it, expect } from "vitest";
import {
  checkExportQuota,
  peekExportQuotaSlots,
  recordExportQuota,
} from "../rateLimit";

describe("export quota slot accounting", () => {
  it("peek returns full quota for a fresh user", () => {
    const userId = 1_000_000 + Math.floor(Math.random() * 100_000);
    const peek = peekExportQuotaSlots(userId);
    expect(peek.remaining).toBe(20);
    expect(peek.retryAfterSec).toBe(0);
  });

  it("recordExportQuota(N) consumes N slots in one shot", () => {
    const userId = 1_100_000 + Math.floor(Math.random() * 100_000);
    expect(peekExportQuotaSlots(userId).remaining).toBe(20);
    recordExportQuota(userId, 5);
    expect(peekExportQuotaSlots(userId).remaining).toBe(15);
    recordExportQuota(userId, 15);
    const peek = peekExportQuotaSlots(userId);
    expect(peek.remaining).toBe(0);
    expect(peek.retryAfterSec).toBeGreaterThan(0);
  });

  it("recordExportQuota and per-call checkExportQuota share the same bucket", () => {
    const userId = 1_200_000 + Math.floor(Math.random() * 100_000);
    recordExportQuota(userId, 3);
    const r = checkExportQuota(userId);
    expect(r.allowed).toBe(true);
    // After the single per-call check, total used should be 4.
    expect(peekExportQuotaSlots(userId).remaining).toBe(16);
  });

  it("recordExportQuota(0) is a no-op", () => {
    const userId = 1_300_000 + Math.floor(Math.random() * 100_000);
    recordExportQuota(userId, 0);
    expect(peekExportQuotaSlots(userId).remaining).toBe(20);
  });
});
