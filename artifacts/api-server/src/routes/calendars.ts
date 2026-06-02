import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { calendarsTable, db } from "@workspace/db";
import { audit, requireAuth, type SessionUser } from "../lib/auth";

const router: IRouter = Router();

type CalendarRow = typeof calendarsTable.$inferSelect;
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

async function findActiveCalendar(
  id: number,
): Promise<CalendarRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarsTable)
    .where(and(eq(calendarsTable.id, id), isNull(calendarsTable.archivedAt)));
  return row;
}

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

export default router;
