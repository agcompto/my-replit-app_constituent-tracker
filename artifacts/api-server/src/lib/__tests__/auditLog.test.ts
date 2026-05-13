import { describe, it, expect } from "vitest";
import {
  AUDIT_ACTIONS,
  decodeCursor,
  encodeCursor,
  parseAuditFilters,
  parseLimit,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../auditLog";

describe("auditLog filter parsing", () => {
  it("returns empty filters for empty query", () => {
    const r = parseAuditFilters({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it("parses every supported field", () => {
    const r = parseAuditFilters({
      actorId: "12",
      campaignId: "3",
      targetUserId: "4",
      from: "2024-01-01",
      to: "2024-12-31",
      q: "  password  ",
      action: ["create_user", "delete_user"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        actorId: 12,
        campaignId: 3,
        targetUserId: 4,
        from: "2024-01-01",
        to: "2024-12-31",
        q: "password",
        actions: ["create_user", "delete_user"],
      });
    }
  });

  it("accepts comma-separated action list", () => {
    const r = parseAuditFilters({ action: "create_user,delete_user" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.actions).toEqual(["create_user", "delete_user"]);
  });

  it("rejects an unknown action name", () => {
    const r = parseAuditFilters({ action: ["totally_made_up"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("bad_action");
  });

  it("rejects an invalid date", () => {
    const r = parseAuditFilters({ from: "2024-13-40" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ kind: "bad_date", field: "from" });
  });

  it("rejects an out-of-order date range", () => {
    const r = parseAuditFilters({ from: "2024-12-01", to: "2024-01-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("date_order");
  });

  it("rejects a non-numeric integer field", () => {
    const r = parseAuditFilters({ actorId: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ kind: "bad_int", field: "actorId" });
  });

  it("ignores empty strings", () => {
    const r = parseAuditFilters({ q: "   ", from: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it("AUDIT_ACTIONS is a non-empty const array of unique strings", () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(10);
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});

describe("auditLog limit parsing", () => {
  it("falls back to default when omitted", () => {
    const r = parseLimit(undefined);
    expect(r.ok && r.value).toBe(DEFAULT_PAGE_SIZE);
  });
  it("clamps to MAX_PAGE_SIZE", () => {
    const r = parseLimit("9999");
    expect(r.ok && r.value).toBe(MAX_PAGE_SIZE);
  });
  it("rejects 0 / negative / non-numeric", () => {
    expect(parseLimit("0").ok).toBe(false);
    expect(parseLimit("abc").ok).toBe(false);
  });
});

describe("auditLog cursor codec", () => {
  it("round-trips ts + id", () => {
    const c = { ts: 1_700_000_000_000, id: 12_345 };
    const enc = encodeCursor(c);
    const dec = decodeCursor(enc);
    expect(dec.ok).toBe(true);
    if (dec.ok) expect(dec.value).toEqual(c);
  });
  it("rejects garbage", () => {
    expect(decodeCursor("not-a-real-cursor").ok).toBe(false);
    expect(decodeCursor("").ok).toBe(false);
  });
});
