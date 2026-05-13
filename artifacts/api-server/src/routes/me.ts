import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, calendarPreferencesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/me/calendar-preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const rows = await db
    .select()
    .from(calendarPreferencesTable)
    .where(eq(calendarPreferencesTable.userId, userId));
  if (rows.length === 0) {
    res.json({ filters: {}, config: {} });
    return;
  }
  const row = rows[0];
  res.json({
    filters: row.filtersJson ?? {},
    config: row.configJson ?? {},
  });
});

/** Maximum serialized size of a single preference blob (filters or config), in bytes. */
const MAX_PREF_BLOB_BYTES = 16_384; // 16 KB

/** Return true if every value in a plain object is a JSON scalar or flat array of scalars. */
function isShallowPrefsObject(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v !== null && typeof v === "object") return false; // no nested objects
  }
  return true;
}

router.put("/me/calendar-preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const { filters, config } = req.body as { filters?: unknown; config?: unknown };

  // Shape guard: must be shallow plain objects (no nested objects, no arrays-of-objects)
  if (
    (filters !== undefined && !isShallowPrefsObject(filters)) ||
    (config !== undefined && !isShallowPrefsObject(config))
  ) {
    res.status(400).json({ error: "filters and config must be shallow plain objects." });
    return;
  }

  // Size guard: prevent storing large arbitrary blobs
  const filtersJson = (filters as Record<string, unknown>) ?? {};
  const configJson = (config as Record<string, unknown>) ?? {};
  if (
    JSON.stringify(filtersJson).length > MAX_PREF_BLOB_BYTES ||
    JSON.stringify(configJson).length > MAX_PREF_BLOB_BYTES
  ) {
    res.status(413).json({ error: "Preference payload exceeds maximum allowed size." });
    return;
  }

  await db
    .insert(calendarPreferencesTable)
    .values({ userId, filtersJson, configJson })
    .onConflictDoUpdate({
      target: calendarPreferencesTable.userId,
      set: { filtersJson, configJson, updatedAt: new Date() },
    });

  res.json({ filters: filtersJson, config: configJson });
});

export default router;
