import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import type { GetDonorTouchpointsParams } from "@workspace/api-client-react";
import { normalizeDonorId } from "@/lib/utils";
import { presetToRange, toIsoDate } from "../date-utils";
import type { DateRange, LookupSearchState, PresetKey } from "../shared-types";
import { buildConstituentLookupSearch, parseConstituentLookupSearch } from "../url-state";

interface UseConstituentFiltersResult {
  parsed: LookupSearchState;
  activeConstituentId: string | null;
  dateRange: DateRange;
  filterParams: GetDonorTouchpointsParams;
  hasFilters: boolean;
  pushState: (patch: Partial<LookupSearchState>) => void;
  setConstituentId: (value: string) => string | null;
  setPreset: (preset: PresetKey) => void;
  setCustomRange: (range: DateRange) => void;
  clearFilters: () => void;
  widenToAllTime: () => void;
}

/**
 * Owns Constituent Lookup URL state and API filter params.
 *
 * Backend generated API types still use donor terminology; frontend naming should
 * use constituent terminology wherever possible.
 */
export function useConstituentFilters(): UseConstituentFiltersResult {
  const rawSearch = useSearch();
  const [, setLocation] = useLocation();
  const parsed = parseConstituentLookupSearch(rawSearch);

  const {
    constituentId,
    preset,
    customFrom,
    customTo,
    channelIds,
    campaignTypeIds,
    statuses,
    countsOnly,
  } = parsed;

  const activeConstituentId = constituentId || null;

  const dateRange = useMemo<DateRange>(() => {
    if (preset === ("custom" as string)) {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`) : undefined,
        to: customTo ? new Date(`${customTo}T00:00:00`) : undefined,
      };
    }

    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  const filterParams = useMemo<GetDonorTouchpointsParams>(() => {
    const params: GetDonorTouchpointsParams = {};

    if (dateRange.from) params.startDate = toIsoDate(dateRange.from);
    if (dateRange.to) params.endDate = toIsoDate(dateRange.to);
    if (channelIds.length) params.channelId = channelIds;
    if (campaignTypeIds.length) params.campaignTypeId = campaignTypeIds;
    if (statuses.length) params.status = statuses;
    if (countsOnly) params.countsTowardThresholdOnly = true;

    return params;
  }, [dateRange, channelIds, campaignTypeIds, statuses, countsOnly]);

  const hasFilters =
    channelIds.length > 0 ||
    campaignTypeIds.length > 0 ||
    statuses.length > 0 ||
    countsOnly ||
    preset !== "all";

  function pushState(patch: Partial<LookupSearchState>) {
    const next = { ...parsed, ...patch };
    setLocation(`/donors${buildConstituentLookupSearch(next)}`, { replace: true });
  }

  function setConstituentId(value: string): string | null {
    const normalized = normalizeDonorId(value);
    if (!normalized) return null;

    pushState({ constituentId: normalized });
    return normalized;
  }

  function setPreset(nextPreset: PresetKey) {
    pushState({ preset: nextPreset, customFrom: "", customTo: "" });
  }

  function setCustomRange(range: DateRange) {
    pushState({
      preset: "custom" as PresetKey,
      customFrom: toIsoDate(range.from) ?? "",
      customTo: toIsoDate(range.to) ?? "",
    });
  }

  function clearFilters() {
    pushState({ channelIds: [], campaignTypeIds: [], statuses: [], countsOnly: false });
  }

  function widenToAllTime() {
    pushState({
      preset: "all",
      customFrom: "",
      customTo: "",
      channelIds: [],
      campaignTypeIds: [],
      statuses: [],
      countsOnly: false,
    });
  }

  return {
    parsed,
    activeConstituentId,
    dateRange,
    filterParams,
    hasFilters,
    pushState,
    setConstituentId,
    setPreset,
    setCustomRange,
    clearFilters,
    widenToAllTime,
  };
}
