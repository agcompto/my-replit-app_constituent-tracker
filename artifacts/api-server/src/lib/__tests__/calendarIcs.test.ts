import { describe, expect, it } from "vitest";
import {
  buildCalendarIcs,
  escapeIcsText,
  formatIcsDateTime,
} from "../calendarIcs";

describe("calendar ICS helpers", () => {
  it("escapes text according to ICS text value rules", () => {
    expect(escapeIcsText("Room 1, Building A; North\\South\nLine 2")).toBe(
      "Room 1\\, Building A\\; North\\\\South\\nLine 2",
    );
  });

  it("formats UTC date-times without separators or milliseconds", () => {
    expect(formatIcsDateTime(new Date("2026-06-02T14:05:06.789Z"))).toBe(
      "20260602T140506Z",
    );
  });

  it("builds a public calendar feed without internal metadata", () => {
    const ics = buildCalendarIcs(
      { name: "Lobo Calendar, Public", timezone: "America/New_York" },
      [
        {
          id: 42,
          title: "Operations Review; Week 1",
          description: "Review readiness\nand risks",
          startsAt: new Date("2026-06-02T13:00:00.000Z"),
          endsAt: new Date("2026-06-02T14:00:00.000Z"),
          locationLabel: "Conference Room, A",
        },
      ],
      new Date("2026-06-01T12:00:00.000Z"),
    );

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain(
      "PRODID:-//Lobo Constituent Operations Platform//Calendar//EN",
    );
    expect(ics).toContain("X-WR-CALNAME:Lobo Calendar\\, Public");
    expect(ics).toContain("UID:lobo-calendar-event-42@constituent-operations");
    expect(ics).toContain("DTSTAMP:20260601T120000Z");
    expect(ics).toContain("DTSTART:20260602T130000Z");
    expect(ics).toContain("SUMMARY:Operations Review\\; Week 1");
    expect(ics).toContain("DESCRIPTION:Review readiness\\nand risks");
    expect(ics).toContain("LOCATION:Conference Room\\, A");
    expect(ics).not.toContain("campaignId");
    expect(ics).not.toContain("createdByUserId");
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
  });
});
