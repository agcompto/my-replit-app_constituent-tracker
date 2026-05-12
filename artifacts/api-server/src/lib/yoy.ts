import { sql, type SQL } from "drizzle-orm";
import {
  db,
  touchpointsTable,
  campaignsTable,
  channelsTable,
} from "@workspace/db";

export interface YoyOptions {
  currentStart: string;
  currentEnd: string;
  priorStart?: string;
  priorEnd?: string;
  owningUnit?: string;
  channelId?: number;
}

export interface YoyResult {
  currentRange: { start: string; end: string };
  priorRange: { start: string; end: string };
  currentTotal: number;
  priorTotal: number;
  percentChange: number;
  byChannel: { label: string; current: number; prior: number }[];
  byMonth: { monthOffset: number; current: number; prior: number }[];
}

/**
 * Shift an ISO date by N years. Used to derive the prior-year window when
 * the caller does not supply explicit priorStart/priorEnd. Note: a Feb-29
 * input shifted back one year becomes Feb-28 of the prior year (JS Date
 * normalization), which matches the existing behavior of the YoY route.
 *
 * Fiscal-year-boundary safety: this is a pure date arithmetic helper and
 * does not depend on the org's fiscal year. The caller selects the window;
 * `shiftYear` only mirrors that window 1Y back. A YoY range that crosses
 * the FY boundary (e.g. FY7/1 with currentStart=2025-06-15 →
 * currentEnd=2025-08-15) gets a prior window of 2024-06-15 → 2024-08-15
 * which also straddles the prior FY boundary — the comparison stays
 * apples-to-apples regardless of where FY starts.
 */
export function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y - years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive month count between two YYYY-MM-DD dates. */
export function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * Project DB-aggregated month buckets onto the byMonth output array, using
 * monthOffset relative to `start`. Pure: the SQL caller passes already-
 * grouped `{ bucket: "YYYY-MM", count }` rows.
 */
export function projectMonthBuckets(
  start: string,
  rows: { bucket: string; count: number }[],
): Map<number, number> {
  const [sy, sm] = start.split("-").map(Number);
  const map = new Map<number, number>();
  for (const r of rows) {
    const [y, m] = r.bucket.split("-").map(Number);
    const offset = (y - sy) * 12 + (m - sm);
    map.set(offset, r.count);
  }
  return map;
}

/**
 * Compute the YoY volume report. Mirrors the SQL the route used to inline.
 * Excludes seeds and voided campaigns, applies optional owningUnit /
 * channelId filters, and bucketizes by month relative to each range start.
 */
export async function computeYoyVolume(opts: YoyOptions): Promise<YoyResult> {
  const { currentStart, currentEnd } = opts;
  const priorStart = opts.priorStart ?? shiftYear(currentStart, 1);
  const priorEnd = opts.priorEnd ?? shiftYear(currentEnd, 1);
  const { owningUnit, channelId } = opts;

  function buildWhere(start: string, end: string): SQL {
    const parts: SQL[] = [
      sql`${touchpointsTable.isSeed} = false`,
      sql`${campaignsTable.status} <> 'voided'`,
      sql`${touchpointsTable.sendDate} >= ${start}::date`,
      sql`${touchpointsTable.sendDate} <= ${end}::date`,
    ];
    if (owningUnit) parts.push(sql`${campaignsTable.owningUnit} = ${owningUnit}`);
    if (channelId !== undefined) parts.push(sql`${touchpointsTable.channelId} = ${channelId}`);
    return sql.join(parts, sql` AND `);
  }

  const [curTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(touchpointsTable)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(buildWhere(currentStart, currentEnd));
  const [priTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(touchpointsTable)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(buildWhere(priorStart, priorEnd));

  const curByChannel = await db
    .select({ label: channelsTable.name, count: sql<number>`count(*)::int` })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(buildWhere(currentStart, currentEnd))
    .groupBy(channelsTable.name);
  const priByChannel = await db
    .select({ label: channelsTable.name, count: sql<number>`count(*)::int` })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(buildWhere(priorStart, priorEnd))
    .groupBy(channelsTable.name);

  const channelMap = new Map<string, { current: number; prior: number }>();
  for (const r of curByChannel) channelMap.set(r.label, { current: r.count, prior: 0 });
  for (const r of priByChannel) {
    const e = channelMap.get(r.label) ?? { current: 0, prior: 0 };
    e.prior = r.count;
    channelMap.set(r.label, e);
  }
  const byChannel = Array.from(channelMap.entries())
    .map(([label, v]) => ({ label, current: v.current, prior: v.prior }))
    .sort((a, b) => b.current + b.prior - (a.current + a.prior));

  async function monthRows(start: string, end: string) {
    return db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${touchpointsTable.sendDate}), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(touchpointsTable)
      .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
      .where(buildWhere(start, end))
      .groupBy(sql`date_trunc('month', ${touchpointsTable.sendDate})`)
      .orderBy(sql`date_trunc('month', ${touchpointsTable.sendDate})`);
  }
  const curBuckets = projectMonthBuckets(currentStart, await monthRows(currentStart, currentEnd));
  const priBuckets = projectMonthBuckets(priorStart, await monthRows(priorStart, priorEnd));
  const monthCount = Math.max(monthsBetween(currentStart, currentEnd), monthsBetween(priorStart, priorEnd));
  const byMonth: { monthOffset: number; current: number; prior: number }[] = [];
  for (let i = 0; i < monthCount; i++) {
    byMonth.push({ monthOffset: i, current: curBuckets.get(i) ?? 0, prior: priBuckets.get(i) ?? 0 });
  }

  const currentTotal = curTotal?.count ?? 0;
  const priorTotal = priTotal?.count ?? 0;
  const percentChange = priorTotal > 0
    ? Number((((currentTotal - priorTotal) / priorTotal) * 100).toFixed(2))
    : currentTotal > 0 ? 100 : 0;

  return {
    currentRange: { start: currentStart, end: currentEnd },
    priorRange: { start: priorStart, end: priorEnd },
    currentTotal,
    priorTotal,
    percentChange,
    byChannel,
    byMonth,
  };
}
