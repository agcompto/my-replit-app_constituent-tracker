import { sql, inArray, eq } from "drizzle-orm";
import {
  db,
  touchpointsTable,
  campaignsTable,
  channelsTable,
  appSettingsTable,
} from "@workspace/db";

export interface SaturationOptions {
  /** Anchor date (YYYY-MM-DD). The report begins at the Monday of this date's ISO week. Defaults to today (UTC). */
  start?: string;
  /** Number of weeks to project forward, 1..26. Defaults to 12. */
  weeks?: number;
  owningUnit?: string;
  channelId?: number;
}

export interface SaturationCell {
  weekStart: string;
  touchpointCount: number;
  campaigns: { id: number; name: string }[];
}

export interface SaturationChannelRow {
  channelId: number;
  channelLabel: string;
  capacity: number | null;
  cells: SaturationCell[];
}

export interface SaturationReport {
  generatedAt: string;
  startDate: string;
  weeks: { weekStart: string; weekEnd: string }[];
  channels: SaturationChannelRow[];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/** Returns the ISO week Monday for the given UTC date string (YYYY-MM-DD). */
export function isoWeekMonday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  // Days to subtract to land on Monday (treat Sunday as end-of-week=6, Mon=0).
  const offset = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function buildWeekIndex(start: string, weeks: number): { weekStart: string; weekEnd: string }[] {
  const out: { weekStart: string; weekEnd: string }[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(start, i * 7);
    out.push({ weekStart: ws, weekEnd: addDays(ws, 6) });
  }
  return out;
}

export async function computeSaturation(
  opts: SaturationOptions,
): Promise<SaturationReport> {
  const weekCount = Math.max(1, Math.min(26, Math.floor(opts.weeks ?? 12)));
  const anchor = opts.start && isValidIsoDate(opts.start)
    ? opts.start
    : new Date().toISOString().slice(0, 10);
  const startDate = isoWeekMonday(anchor);
  const endDateExclusive = addDays(startDate, weekCount * 7);
  const weeks = buildWeekIndex(startDate, weekCount);

  // Load capacities + channel list. We render every active channel as a row,
  // even when it has zero touchpoints in the window, so the heatmap shape is
  // stable across runs and the operator sees that an unused channel is "cold".
  const [settingsRow] = await db.select().from(appSettingsTable).limit(1);
  const capacityMap: Record<string, number> = settingsRow?.channelCapacity ?? {};

  let channelRows = await db
    .select({ id: channelsTable.id, name: channelsTable.name, active: channelsTable.active })
    .from(channelsTable)
    .orderBy(channelsTable.name);
  if (opts.channelId !== undefined) {
    channelRows = channelRows.filter((c) => c.id === opts.channelId);
  } else {
    channelRows = channelRows.filter((c) => c.active);
  }

  // Aggregate touchpoints by (week, channel). Drop the seed/voided rows the
  // rest of the report family also drops, plus the ownership filter when set.
  const rawRows = await db.execute<{
    week_start: string;
    channel_id: number;
    touchpoint_count: number;
    campaign_ids: number[];
  }>(sql`
    SELECT
      to_char(date_trunc('week', ${touchpointsTable.sendDate}), 'YYYY-MM-DD') AS week_start,
      ${touchpointsTable.channelId} AS channel_id,
      COUNT(*)::int AS touchpoint_count,
      array_agg(DISTINCT ${touchpointsTable.campaignId}) AS campaign_ids
    FROM ${touchpointsTable}
    INNER JOIN ${campaignsTable}
      ON ${touchpointsTable.campaignId} = ${campaignsTable.id}
    WHERE ${touchpointsTable.isSeed} = false
      AND ${campaignsTable.status} <> 'voided'
      AND ${touchpointsTable.sendDate} >= ${startDate}::date
      AND ${touchpointsTable.sendDate} <  ${endDateExclusive}::date
      ${opts.owningUnit ? sql`AND ${campaignsTable.owningUnit} = ${opts.owningUnit}` : sql``}
      ${opts.channelId !== undefined ? sql`AND ${touchpointsTable.channelId} = ${opts.channelId}` : sql``}
    GROUP BY 1, 2
  `);

  // Resolve campaign names for the union of all cell campaign IDs in one query.
  const allCampaignIds = new Set<number>();
  for (const r of rawRows.rows ?? []) {
    for (const cid of r.campaign_ids ?? []) allCampaignIds.add(Number(cid));
  }
  const idList = Array.from(allCampaignIds);
  const nameById = new Map<number, string>();
  if (idList.length > 0) {
    const namedRows = await db
      .select({ id: campaignsTable.id, name: campaignsTable.name })
      .from(campaignsTable)
      .where(inArray(campaignsTable.id, idList));
    for (const n of namedRows) nameById.set(n.id, n.name);
  }

  // Index aggregated rows by (channelId, weekStart) for O(1) lookup while
  // building the dense heatmap matrix.
  const cellMap = new Map<string, { count: number; ids: number[] }>();
  for (const r of rawRows.rows ?? []) {
    const key = `${r.channel_id}|${r.week_start}`;
    cellMap.set(key, {
      count: Number(r.touchpoint_count) || 0,
      ids: (r.campaign_ids ?? []).map((x) => Number(x)),
    });
  }

  const channels: SaturationChannelRow[] = channelRows.map((c) => {
    const rawCap = capacityMap[String(c.id)];
    const capacity =
      typeof rawCap === "number" && Number.isFinite(rawCap) && rawCap > 0
        ? Math.floor(rawCap)
        : null;
    return {
      channelId: c.id,
      channelLabel: c.name,
      capacity,
      cells: weeks.map((w) => {
        const m = cellMap.get(`${c.id}|${w.weekStart}`);
        const ids = m?.ids ?? [];
        return {
          weekStart: w.weekStart,
          touchpointCount: m?.count ?? 0,
          campaigns: ids
            .map((id) => ({ id, name: nameById.get(id) ?? `Campaign #${id}` }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    startDate,
    weeks,
    channels,
  };
}

/** Persist a per-channel weekly capacity map. Throws on invalid input shape. */
export function validateChannelCapacity(input: unknown): Record<string, number> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("channelCapacity must be an object");
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const idNum = Number(k);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      throw new Error(`channelCapacity key '${k}' must be a positive integer channel ID`);
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10_000_000 || !Number.isInteger(v)) {
      throw new Error(`channelCapacity value for channel ${k} must be a non-negative integer ≤ 10,000,000`);
    }
    if (v > 0) out[String(idNum)] = v;
  }
  return out;
}

// Suppress unused-import lint for `eq` (kept available for future filters).
void eq;
