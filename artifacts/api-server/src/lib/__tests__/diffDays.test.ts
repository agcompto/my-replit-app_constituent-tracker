import { describe, it, expect } from "vitest";
import { diffDays } from "../threshold";

describe("diffDays", () => {
  it("returns 0 for the same day", () => {
    expect(diffDays("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("returns 1 for adjacent days", () => {
    expect(diffDays("2026-01-01", "2026-01-02")).toBe(1);
    expect(diffDays("2026-01-02", "2026-01-01")).toBe(1);
  });

  it("returns 30 across US DST spring-forward (March 8 2026)", () => {
    // If diffDays used local-time math, the missing hour at 2am EDT on
    // 2026-03-08 would round one of these intervals to 29.96 days and
    // floor it to 29. Using Date.UTC keeps it at exactly 30 days.
    expect(diffDays("2026-02-22", "2026-03-24")).toBe(30);
    expect(diffDays("2026-03-01", "2026-03-31")).toBe(30);
  });

  it("returns 30 across US DST fall-back (November 1 2026)", () => {
    expect(diffDays("2026-10-18", "2026-11-17")).toBe(30);
  });

  it("counts year boundaries correctly", () => {
    expect(diffDays("2025-12-31", "2026-01-01")).toBe(1);
    expect(diffDays("2024-02-29", "2025-02-28")).toBe(365);
  });

  it("is symmetric", () => {
    expect(diffDays("2026-01-15", "2026-04-20")).toBe(
      diffDays("2026-04-20", "2026-01-15"),
    );
  });
});
