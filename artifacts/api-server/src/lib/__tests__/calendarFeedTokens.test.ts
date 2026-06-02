import { describe, expect, it } from "vitest";
import {
  generateCalendarFeedToken,
  hashCalendarFeedToken,
  isCalendarFeedTokenFormat,
} from "../calendarFeedTokens";

describe("calendar feed token helpers", () => {
  it("generates URL-safe tokens without storing raw token assumptions", () => {
    const token = generateCalendarFeedToken();

    expect(isCalendarFeedTokenFormat(token)).toBe(true);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });

  it("hashes tokens deterministically as SHA-256 hex", () => {
    const token = "calendar_feed_token_test_value_123456";

    expect(hashCalendarFeedToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCalendarFeedToken(token)).toBe(hashCalendarFeedToken(token));
    expect(hashCalendarFeedToken(`${token}_other`)).not.toBe(
      hashCalendarFeedToken(token),
    );
  });

  it("rejects malformed feed token strings", () => {
    expect(isCalendarFeedTokenFormat("short")).toBe(false);
    expect(
      isCalendarFeedTokenFormat("has/slash/value/that/is/long/enough"),
    ).toBe(false);
    expect(
      isCalendarFeedTokenFormat("has+plus+value+that+is+long+enough"),
    ).toBe(false);
  });
});
