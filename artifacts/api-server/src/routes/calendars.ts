import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import {
  calendarEventsTable,
  calendarFeedTokensTable,
  calendarsTable,
  db,
} from "@workspace/db";
import { audit, requireAuth, type SessionUser } from "../lib/auth";
import { buildCalendarIcs } from "../lib/calendarIcs";
import {
  generateCalendarFeedToken,
  hashCalendarFeedToken,
  isCalendarFeedTokenFormat,
} from "../lib/calendarFeedTokens";

const router: IRouter = Router();

type CalendarRow = typeof calendarsTable.$inferSelect;
type CalendarEventRow = typeof calendarEventsTable.$inferSelect;
type CalendarFeedTokenRow = typeof calendarFeedTokensTable.$inferSelect;
type CalendarVisibility = "private" | "public";
type CalendarBody = {
  name: string;
  description?: string | null;
  timezone: string;
  visibility: CalendarVisibility;
  color?: string | null;
  publicSlug?: string | null;
  publicEnabled: boolean;
};
type CalendarUpdateBody = Partial<CalendarBody>;
type CalendarEventBody = {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  locationLabel?: string | null;
  campaignId?: number | null;
  owningUnit?: string | null;
  visibility: "inherit" | "private" | "public";
  status: "draft" | "scheduled" | "canceled" | "completed";
};
type CalendarEventUpdateBody = Partial<CalendarEventBody>;

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function parseCalendarId(value: unknown): ParseResult<number> {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, error: "Invalid calendar id" };
  }
  return { success: true, data: id };
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
  field: string,
): ParseResult<string | null | undefined> {
  if (value === undefined) return { success: true, data: undefined };
  if (value === null) return { success: true, data: null };
  if (typeof value !== "string") {
    return { success: false, error: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { success: false, error: `${field} is too long` };
  }
  return { success: true, data: trimmed === "" ? null : trimmed };
}

function parseCalendarBody(
  input: unknown,
  partial = false,
): ParseResult<CalendarBody | CalendarUpdateBody> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "Request body must be an object" };
  }
  const body = input as Record<string, unknown>;
  const parsed: CalendarUpdateBody = {};

  if (!partial || body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      body.name.trim() === "" ||
      body.name.trim().length > 160
    ) {
      return {
        success: false,
        error: "name is required and must be 1-160 characters",
      };
    }
    parsed.name = body.name.trim();
  }

  const description = normalizeOptionalText(
    body.description,
    2_000,
    "description",
  );
  if (!description.success) return description;
  if (description.data !== undefined) parsed.description = description.data;

  if (!partial || body.timezone !== undefined) {
    const timezone =
      body.timezone === undefined ? "America/New_York" : body.timezone;
    if (
      typeof timezone !== "string" ||
      timezone.trim() === "" ||
      timezone.trim().length > 80
    ) {
      return { success: false, error: "timezone must be 1-80 characters" };
    }
    parsed.timezone = timezone.trim();
  }

  if (!partial || body.visibility !== undefined) {
    const visibility =
      body.visibility === undefined ? "private" : body.visibility;
    if (visibility !== "private" && visibility !== "public") {
      return { success: false, error: "visibility must be private or public" };
    }
    parsed.visibility = visibility;
  }

  const color = normalizeOptionalText(body.color, 40, "color");
  if (!color.success) return color;
  if (color.data !== undefined) parsed.color = color.data;

  const publicSlug = normalizeOptionalText(body.publicSlug, 80, "publicSlug");
  if (!publicSlug.success) return publicSlug;
  if (publicSlug.data !== undefined) {
    if (
      publicSlug.data !== null &&
      !/^[a-z0-9-]{3,80}$/.test(publicSlug.data)
    ) {
      return {
        success: false,
        error: "publicSlug must be 3-80 lowercase letters, numbers, or hyphens",
      };
    }
    parsed.publicSlug = publicSlug.data;
  }

  if (!partial || body.publicEnabled !== undefined) {
    if (
      body.publicEnabled !== undefined &&
      typeof body.publicEnabled !== "boolean"
    ) {
      return { success: false, error: "publicEnabled must be a boolean" };
    }
    parsed.publicEnabled = body.publicEnabled === true;
  }

  if (partial && Object.keys(parsed).length === 0) {
    return { success: false, error: "At least one field is required" };
  }

  return { success: true, data: parsed as CalendarBody | CalendarUpdateBody };
}

function parseDateTime(value: unknown, field: string): ParseResult<Date> {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      success: false,
      error: `${field} must be an ISO date/time string`,
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      success: false,
      error: `${field} must be a valid ISO date/time string`,
    };
  }
  return { success: true, data: date };
}

function parseOptionalPositiveInt(
  value: unknown,
  field: string,
): ParseResult<number | null | undefined> {
  if (value === undefined) return { success: true, data: undefined };
  if (value === null || value === "") return { success: true, data: null };
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, error: `${field} must be a positive integer` };
  }
  return { success: true, data: id };
}

function parseCalendarEventBody(
  input: unknown,
  partial = false,
): ParseResult<CalendarEventBody | CalendarEventUpdateBody> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "Request body must be an object" };
  }
  const body = input as Record<string, unknown>;
  const parsed: CalendarEventUpdateBody = {};

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      body.title.trim() === "" ||
      body.title.trim().length > 200
    ) {
      return {
        success: false,
        error: "title is required and must be 1-200 characters",
      };
    }
    parsed.title = body.title.trim();
  }

  const description = normalizeOptionalText(
    body.description,
    2_000,
    "description",
  );
  if (!description.success) return description;
  if (description.data !== undefined) parsed.description = description.data;

  if (!partial || body.startsAt !== undefined) {
    const startsAt = parseDateTime(body.startsAt, "startsAt");
    if (!startsAt.success) return startsAt;
    parsed.startsAt = startsAt.data;
  }

  if (!partial || body.endsAt !== undefined) {
    const endsAt = parseDateTime(body.endsAt, "endsAt");
    if (!endsAt.success) return endsAt;
    parsed.endsAt = endsAt.data;
  }

  if (!partial || body.allDay !== undefined) {
    if (body.allDay !== undefined && typeof body.allDay !== "boolean") {
      return { success: false, error: "allDay must be a boolean" };
    }
    parsed.allDay = body.allDay === true;
  }

  if (!partial || body.timezone !== undefined) {
    const timezone =
      body.timezone === undefined ? "America/New_York" : body.timezone;
    if (
      typeof timezone !== "string" ||
      timezone.trim() === "" ||
      timezone.trim().length > 80
    ) {
      return { success: false, error: "timezone must be 1-80 characters" };
    }
    parsed.timezone = timezone.trim();
  }

  const locationLabel = normalizeOptionalText(
    body.locationLabel,
    500,
    "locationLabel",
  );
  if (!locationLabel.success) return locationLabel;
  if (locationLabel.data !== undefined)
    parsed.locationLabel = locationLabel.data;

  const campaignId = parseOptionalPositiveInt(body.campaignId, "campaignId");
  if (!campaignId.success) return campaignId;
  if (campaignId.data !== undefined) parsed.campaignId = campaignId.data;

  const owningUnit = normalizeOptionalText(body.owningUnit, 160, "owningUnit");
  if (!owningUnit.success) return owningUnit;
  if (owningUnit.data !== undefined) parsed.owningUnit = owningUnit.data;

  if (!partial || body.visibility !== undefined) {
    const visibility =
      body.visibility === undefined ? "inherit" : body.visibility;
    if (
      visibility !== "inherit" &&
      visibility !== "private" &&
      visibility !== "public"
    ) {
      return {
        success: false,
        error: "visibility must be inherit, private, or public",
      };
    }
    parsed.visibility = visibility;
  }

  if (!partial || body.status !== undefined) {
    const status = body.status === undefined ? "scheduled" : body.status;
    if (
      status !== "draft" &&
      status !== "scheduled" &&
      status !== "canceled" &&
      status !== "completed"
    ) {
      return {
        success: false,
        error: "status must be draft, scheduled, canceled, or completed",
      };
    }
    parsed.status = status;
  }

  const startsAt = parsed.startsAt;
  const endsAt = parsed.endsAt;
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return { success: false, error: "endsAt must be on or after startsAt" };
  }
  if (!partial && (!startsAt || !endsAt)) {
    return { success: false, error: "startsAt and endsAt are required" };
  }
  if (partial && Object.keys(parsed).length === 0) {
    return { success: false, error: "At least one field is required" };
  }

  return {
    success: true,
    data: parsed as CalendarEventBody | CalendarEventUpdateBody,
  };
}

function canManageCalendar(row: CalendarRow, user: SessionUser): boolean {
  return (
    user.role === "admin" ||
    user.role === "super_admin" ||
    row.ownerUserId === user.id
  );
}

function serializeCalendar(row: CalendarRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerUserId: row.ownerUserId,
    timezone: row.timezone,
    visibility: row.visibility,
    color: row.color,
    publicSlug: row.publicSlug,
    publicEnabled: row.publicEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function serializeCalendarEvent(row: CalendarEventRow) {
  return {
    id: row.id,
    calendarId: row.calendarId,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    timezone: row.timezone,
    locationLabel: row.locationLabel,
    campaignId: row.campaignId,
    owningUnit: row.owningUnit,
    visibility: row.visibility,
    status: row.status,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function serializePublicCalendar(row: CalendarRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    timezone: row.timezone,
    color: row.color,
    publicSlug: row.publicSlug,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePublicCalendarEvent(row: CalendarEventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    timezone: row.timezone,
    locationLabel: row.locationLabel,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findActiveCalendar(
  id: number,
): Promise<CalendarRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarsTable)
    .where(and(eq(calendarsTable.id, id), isNull(calendarsTable.archivedAt)));
  return row;
}

async function findActiveCalendarEvent(
  id: number,
): Promise<CalendarEventRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.id, id),
        isNull(calendarEventsTable.deletedAt),
      ),
    );
  return row;
}

async function findPublicCalendarBySlug(
  slug: string,
): Promise<CalendarRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarsTable)
    .where(
      and(
        eq(calendarsTable.publicSlug, slug),
        eq(calendarsTable.publicEnabled, true),
        eq(calendarsTable.visibility, "public"),
        isNull(calendarsTable.archivedAt),
      ),
    );
  return row;
}

async function listPublicCalendarEvents(
  calendarId: number,
): Promise<CalendarEventRow[]> {
  return db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.calendarId, calendarId),
        isNull(calendarEventsTable.deletedAt),
        ne(calendarEventsTable.status, "canceled"),
        or(
          eq(calendarEventsTable.visibility, "inherit"),
          eq(calendarEventsTable.visibility, "public"),
        ),
      ),
    )
    .orderBy(calendarEventsTable.startsAt);
}

async function listFeedCalendarEvents(
  calendarId: number,
): Promise<CalendarEventRow[]> {
  return db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.calendarId, calendarId),
        isNull(calendarEventsTable.deletedAt),
        ne(calendarEventsTable.status, "canceled"),
      ),
    )
    .orderBy(calendarEventsTable.startsAt);
}

async function findActiveFeedToken(
  token: string,
): Promise<CalendarFeedTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarFeedTokensTable)
    .where(
      and(
        eq(calendarFeedTokensTable.tokenHash, hashCalendarFeedToken(token)),
        eq(calendarFeedTokensTable.active, true),
        isNull(calendarFeedTokensTable.revokedAt),
      ),
    );
  if (!row) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;
  return row;
}

router.get("/calendar-feeds/:token.ics", async (req, res): Promise<void> => {
  const token =
    typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!isCalendarFeedTokenFormat(token)) {
    res.status(400).type("text/plain").send("Invalid calendar feed token");
    return;
  }

  const feedToken = await findActiveFeedToken(token);
  if (!feedToken) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  const calendar = await findActiveCalendar(feedToken.calendarId);
  if (!calendar) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  const events = await listFeedCalendarEvents(calendar.id);
  await db
    .update(calendarFeedTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(calendarFeedTokensTable.id, feedToken.id));

  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="calendar-${calendar.id}.ics"`,
  );
  res.send(buildCalendarIcs(calendar, events));
});

router.get("/public/calendars/:slug.ics", async (req, res): Promise<void> => {
  const slug =
    typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
    res.status(400).type("text/plain").send("Invalid calendar slug");
    return;
  }

  const calendar = await findPublicCalendarBySlug(slug);
  if (!calendar) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  const events = await listPublicCalendarEvents(calendar.id);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}.ics"`);
  res.send(buildCalendarIcs(calendar, events));
});

router.get("/public/calendars/:slug", async (req, res): Promise<void> => {
  const slug =
    typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) {
    res.status(400).json({ error: "Invalid calendar slug" });
    return;
  }

  const calendar = await findPublicCalendarBySlug(slug);
  if (!calendar) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const events = await listPublicCalendarEvents(calendar.id);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.json({
    calendar: serializePublicCalendar(calendar),
    events: events.map(serializePublicCalendarEvent),
  });
});

router.get("/calendars", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const base = isNull(calendarsTable.archivedAt);
  const where =
    user.role === "admin" || user.role === "super_admin"
      ? base
      : and(base, eq(calendarsTable.ownerUserId, user.id));

  const rows = await db
    .select()
    .from(calendarsTable)
    .where(where)
    .orderBy(desc(calendarsTable.createdAt));

  res.json(rows.map(serializeCalendar));
});

router.post("/calendars", requireAuth, async (req, res): Promise<void> => {
  const body = parseCalendarBody(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error });
    return;
  }

  const data = body.data as CalendarBody;
  const [row] = await db
    .insert(calendarsTable)
    .values({
      ownerUserId: req.currentUser!.id,
      name: data.name,
      description: data.description ?? null,
      timezone: data.timezone,
      visibility: data.visibility,
      color: data.color ?? null,
      publicSlug: data.publicSlug ?? null,
      publicEnabled: data.publicEnabled,
    })
    .returning();

  await audit({
    actor: req.currentUser!,
    action: "create_calendar",
    entityType: "calendar",
    entityId: row.id,
    details: `${row.visibility}: ${row.name}`,
  });

  res.status(201).json(serializeCalendar(row));
});

router.get("/calendars/:id", requireAuth, async (req, res): Promise<void> => {
  const params = parseCalendarId(req.params.id);
  if (!params.success) {
    res.status(400).json({ error: params.error });
    return;
  }

  const row = await findActiveCalendar(params.data);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canManageCalendar(row, req.currentUser!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(serializeCalendar(row));
});

router.patch("/calendars/:id", requireAuth, async (req, res): Promise<void> => {
  const params = parseCalendarId(req.params.id);
  if (!params.success) {
    res.status(400).json({ error: params.error });
    return;
  }
  const body = parseCalendarBody(req.body, true);
  if (!body.success) {
    res.status(400).json({ error: body.error });
    return;
  }

  const existing = await findActiveCalendar(params.data);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!canManageCalendar(existing, req.currentUser!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = body.data as CalendarUpdateBody;
  const update: Partial<typeof calendarsTable.$inferInsert> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined)
    update.description = data.description ?? null;
  if (data.timezone !== undefined) update.timezone = data.timezone;
  if (data.visibility !== undefined) update.visibility = data.visibility;
  if (data.color !== undefined) update.color = data.color ?? null;
  if (data.publicSlug !== undefined)
    update.publicSlug = data.publicSlug ?? null;
  if (data.publicEnabled !== undefined)
    update.publicEnabled = data.publicEnabled;

  const [row] = await db
    .update(calendarsTable)
    .set(update)
    .where(
      and(
        eq(calendarsTable.id, params.data),
        isNull(calendarsTable.archivedAt),
      ),
    )
    .returning();

  await audit({
    actor: req.currentUser!,
    action: "update_calendar",
    entityType: "calendar",
    entityId: row.id,
    details: `${row.visibility}: ${row.name}`,
  });

  res.json(serializeCalendar(row));
});

router.delete(
  "/calendars/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }

    const existing = await findActiveCalendar(params.data);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canManageCalendar(existing, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [row] = await db
      .update(calendarsTable)
      .set({ archivedAt: new Date(), publicEnabled: false })
      .where(
        and(
          eq(calendarsTable.id, params.data),
          isNull(calendarsTable.archivedAt),
        ),
      )
      .returning();

    await audit({
      actor: req.currentUser!,
      action: "archive_calendar",
      entityType: "calendar",
      entityId: row.id,
      details: row.name,
    });

    res.status(204).end();
  },
);

router.post(
  "/calendars/:id/feed-token",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }

    const calendar = await findActiveCalendar(params.data);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const now = new Date();
    const feedToken = generateCalendarFeedToken();
    await db
      .update(calendarFeedTokensTable)
      .set({
        active: false,
        revokedAt: now,
        revokedByUserId: req.currentUser!.id,
      })
      .where(
        and(
          eq(calendarFeedTokensTable.calendarId, calendar.id),
          eq(calendarFeedTokensTable.active, true),
          isNull(calendarFeedTokensTable.revokedAt),
        ),
      );

    const [row] = await db
      .insert(calendarFeedTokensTable)
      .values({
        calendarId: calendar.id,
        tokenHash: hashCalendarFeedToken(feedToken),
        label: "Primary ICS feed",
        active: true,
        createdByUserId: req.currentUser!.id,
      })
      .returning();

    await audit({
      actor: req.currentUser!,
      action: "regenerate_calendar_feed_token",
      entityType: "calendar",
      entityId: calendar.id,
      details: calendar.name,
    });

    res.status(201).json({
      calendarId: calendar.id,
      feedToken,
      feedUrl: `/api/calendar-feeds/${feedToken}.ics`,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.get(
  "/calendars/:id/events",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }

    const calendar = await findActiveCalendar(params.data);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.calendarId, params.data),
          isNull(calendarEventsTable.deletedAt),
        ),
      )
      .orderBy(calendarEventsTable.startsAt);

    res.json(rows.map(serializeCalendarEvent));
  },
);

router.post(
  "/calendars/:id/events",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }
    const body = parseCalendarEventBody(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    const calendar = await findActiveCalendar(params.data);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const data = body.data as CalendarEventBody;
    const [row] = await db
      .insert(calendarEventsTable)
      .values({
        calendarId: calendar.id,
        title: data.title,
        description: data.description ?? null,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        allDay: data.allDay,
        timezone: data.timezone,
        locationLabel: data.locationLabel ?? null,
        campaignId: data.campaignId ?? null,
        owningUnit: data.owningUnit ?? null,
        visibility: data.visibility,
        status: data.status,
        createdByUserId: req.currentUser!.id,
      })
      .returning();

    await audit({
      actor: req.currentUser!,
      action: "create_calendar_event",
      entityType: "calendar_event",
      entityId: row.id,
      details: `${calendar.name}: ${row.title}`,
    });

    res.status(201).json(serializeCalendarEvent(row));
  },
);

router.get(
  "/calendar-events/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }

    const event = await findActiveCalendarEvent(params.data);
    if (!event) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const calendar = await findActiveCalendar(event.calendarId);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(serializeCalendarEvent(event));
  },
);

router.patch(
  "/calendar-events/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }
    const body = parseCalendarEventBody(req.body, true);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    const existing = await findActiveCalendarEvent(params.data);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const calendar = await findActiveCalendar(existing.calendarId);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const data = body.data as CalendarEventUpdateBody;
    const effectiveStartsAt = data.startsAt ?? existing.startsAt;
    const effectiveEndsAt = data.endsAt ?? existing.endsAt;
    if (effectiveEndsAt.getTime() < effectiveStartsAt.getTime()) {
      res.status(400).json({ error: "endsAt must be on or after startsAt" });
      return;
    }

    const update: Partial<typeof calendarEventsTable.$inferInsert> = {
      updatedByUserId: req.currentUser!.id,
    };
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined)
      update.description = data.description ?? null;
    if (data.startsAt !== undefined) update.startsAt = data.startsAt;
    if (data.endsAt !== undefined) update.endsAt = data.endsAt;
    if (data.allDay !== undefined) update.allDay = data.allDay;
    if (data.timezone !== undefined) update.timezone = data.timezone;
    if (data.locationLabel !== undefined)
      update.locationLabel = data.locationLabel ?? null;
    if (data.campaignId !== undefined)
      update.campaignId = data.campaignId ?? null;
    if (data.owningUnit !== undefined)
      update.owningUnit = data.owningUnit ?? null;
    if (data.visibility !== undefined) update.visibility = data.visibility;
    if (data.status !== undefined) update.status = data.status;

    const [row] = await db
      .update(calendarEventsTable)
      .set(update)
      .where(
        and(
          eq(calendarEventsTable.id, existing.id),
          isNull(calendarEventsTable.deletedAt),
        ),
      )
      .returning();

    await audit({
      actor: req.currentUser!,
      action: "update_calendar_event",
      entityType: "calendar_event",
      entityId: row.id,
      details: `${calendar.name}: ${row.title}`,
    });

    res.json(serializeCalendarEvent(row));
  },
);

router.delete(
  "/calendar-events/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseCalendarId(req.params.id);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }

    const existing = await findActiveCalendarEvent(params.data);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const calendar = await findActiveCalendar(existing.calendarId);
    if (!calendar) {
      res.status(404).json({ error: "Calendar not found" });
      return;
    }
    if (!canManageCalendar(calendar, req.currentUser!)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [row] = await db
      .update(calendarEventsTable)
      .set({ deletedAt: new Date(), updatedByUserId: req.currentUser!.id })
      .where(
        and(
          eq(calendarEventsTable.id, existing.id),
          isNull(calendarEventsTable.deletedAt),
        ),
      )
      .returning();

    await audit({
      actor: req.currentUser!,
      action: "delete_calendar_event",
      entityType: "calendar_event",
      entityId: row.id,
      details: `${calendar.name}: ${row.title}`,
    });

    res.status(204).end();
  },
);

export default router;
