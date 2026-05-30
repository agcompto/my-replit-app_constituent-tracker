import { format, subMonths } from "date-fns";
import type { DateRange, PresetKey, PresetOption } from "./shared-types";

export const CONSTITUENT_LOOKUP_PRESETS: PresetOption[] = [
  { key: "last12", label: "Last 12 months" },
  { key: "last90", label: "Last 90 days" },
  { key: "thisFY", label: "This FY" },
  { key: "lastFY", label: "Last FY" },
  { key: "all", label: "All time" },
];

export function fiscalYearBounds(offset: 0 | -1): { from: Date; to: Date } {
  const today = new Date();
  const fiscalYearStartMonth = 7;
  let start = new Date(today.getFullYear(), fiscalYearStartMonth - 1, 1);

  if (today < start) {
    start = new Date(today.getFullYear() - 1, fiscalYearStartMonth - 1, 1);
  }

  if (offset === -1) {
    start = new Date(start.getFullYear() - 1, start.getMonth(), 1);
  }

  return { from: start, to: new Date(start.getFullYear() + 1, start.getMonth(), 0) };
}

export function presetToRange(preset: PresetKey): DateRange {
  const today = new Date();

  if (preset === "last90") return { from: subMonths(today, 3), to: today };
  if (preset === "thisFY") return fiscalYearBounds(0);
  if (preset === "lastFY") return fiscalYearBounds(-1);
  if (preset === "last12") return { from: subMonths(today, 12), to: today };

  return {};
}

export function toIsoDate(date?: Date): string | undefined {
  return date ? format(date, "yyyy-MM-dd") : undefined;
}
