export interface CalendarIcsSource {
  name: string;
  timezone: string;
}

export interface CalendarIcsEventSource {
  id: number;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  locationLabel?: string | null;
}

export function escapeIcsText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function formatIcsDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildCalendarIcs(
  calendar: CalendarIcsSource,
  events: CalendarIcsEventSource[],
  generatedAt = new Date(),
): string {
  const now = formatIcsDateTime(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lobo Constituent Operations Platform//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendar.name)}`,
    `X-WR-TIMEZONE:${escapeIcsText(calendar.timezone)}`,
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:lobo-calendar-event-${event.id}@constituent-operations`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatIcsDateTime(event.startsAt)}`,
      `DTEND:${formatIcsDateTime(event.endsAt)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.locationLabel) {
      lines.push(`LOCATION:${escapeIcsText(event.locationLabel)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
