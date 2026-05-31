import { useEffect, useMemo, useRef, useState } from "react";
import {
  getExportDonorTouchpointsCsvUrl,
  useGetDonorTouchpoints,
  useGetDonorTouchpointsSummary,
  useListCampaignTypes,
  useListChannels,
} from "@workspace/api-client-react";
import type { GetDonorTouchpointsParams } from "@workspace/api-client-react";
import { AlertCircle, Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/patterns/PageHeader";
import { AiConstituentSummary } from "./donors/components/AiConstituentSummary";
import { ConstituentResults } from "./donors/components/ConstituentResults";
import { ConstituentSummary } from "./donors/components/ConstituentSummary";
import { ConstituentTimeline } from "./donors/components/ConstituentTimeline";
import { DateRangePicker } from "./donors/components/DateRangePicker";
import { MultiSelectPill } from "./donors/components/MultiSelectPill";
import { CONSTITUENT_LOOKUP_PRESETS } from "./donors/date-utils";
import { useConstituentFilters } from "./donors/hooks/useConstituentFilters";
import type { ConstituentSortState, PresetKey, SortCol, TouchpointRow } from "./donors/shared-types";

const PAGE_SIZE = 25;

const CAMPAIGN_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "uploaded", label: "Uploaded" },
  { value: "previewed", label: "Previewed" },
  { value: "finalized", label: "Finalized" },
  { value: "exported", label: "Exported" },
  { value: "sent", label: "Sent" },
  { value: "archived", label: "Archived" },
  { value: "voided", label: "Voided" },
];

function sortTouchpoints(rows: TouchpointRow[], col: SortCol, dir: "asc" | "desc"): TouchpointRow[] {
  return [...rows].sort((a, b) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

function normalizeSummaryDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function buildAiSummaryQueryString(params: GetDonorTouchpointsParams): string {
  const search = new URLSearchParams();

  if (params.startDate) search.set("startDate", String(params.startDate));
  if (params.endDate) search.set("endDate", String(params.endDate));

  const channelIds = Array.isArray(params.channelId)
    ? params.channelId
    : params.channelId !== undefined
      ? [params.channelId]
      : [];
  channelIds.forEach((id) => search.append("channelId", String(id)));

  const campaignTypeIds = Array.isArray(params.campaignTypeId)
    ? params.campaignTypeId
    : params.campaignTypeId !== undefined
      ? [params.campaignTypeId]
      : [];
  campaignTypeIds.forEach((id) => search.append("campaignTypeId", String(id)));

  const statuses = Array.isArray(params.status)
    ? params.status
    : params.status !== undefined
      ? [params.status]
      : [];
  statuses.forEach((status) => search.append("status", String(status)));

  if (params.countsTowardThresholdOnly) search.set("countsTowardThresholdOnly", "true");

  return search.toString();
}

export default function Donors() {
  const {
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
  } = useConstituentFilters();

  const {
    constituentId: urlConstituentId,
    preset,
    channelIds,
    campaignTypeIds,
    statuses,
    countsOnly,
  } = parsed;

  const [inputValue, setInputValue] = useState(urlConstituentId);
  const [sort, setSort] = useState<ConstituentSortState>({ col: "sendDate", dir: "asc" });
  const [page, setPage] = useState(1);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(preset === ("custom" as string));
  const tableRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    setInputValue(urlConstituentId);
  }, [urlConstituentId]);

  const { data: channelsData } = useListChannels();
  const { data: campaignTypesData } = useListCampaignTypes();

  const { data, isLoading, error } = useGetDonorTouchpoints(
    activeConstituentId as string,
    filterParams,
    {
      query: {
        enabled: !!activeConstituentId,
        queryKey: ["donor-touchpoints", activeConstituentId, filterParams],
      },
    },
  );

  const { data: summary, isLoading: summaryLoading } = useGetDonorTouchpointsSummary(
    activeConstituentId as string,
    filterParams,
    {
      query: {
        enabled: !!activeConstituentId,
        queryKey: ["donor-summary", activeConstituentId, filterParams],
      },
    },
  );

  const touchpoints: TouchpointRow[] = data?.touchpoints ?? [];
  const sorted = useMemo(() => sortTouchpoints(touchpoints, sort.col, sort.dir), [touchpoints, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const aiSummaryQueryString = useMemo(() => buildAiSummaryQueryString(filterParams), [filterParams]);

  useEffect(() => {
    setPage(1);
    setHighlightedIndex(null);
  }, [activeConstituentId, filterParams, sort]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = setConstituentId(inputValue);
    if (normalized) setInputValue(normalized);
  }

  function handlePreset(nextPreset: PresetKey) {
    setShowCustom(false);
    setPreset(nextPreset);
  }

  function handleSort(col: SortCol) {
    setSort((previous) =>
      previous.col === col ? { col, dir: previous.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" },
    );
  }

  function handleTimelinePointClick(globalIndex: number) {
    const touchpoint = touchpoints[globalIndex];
    if (!touchpoint) return;

    const sortedIndex = sorted.findIndex(
      (item) =>
        item.touchId === touchpoint.touchId &&
        item.sendDate === touchpoint.sendDate &&
        item.campaignId === touchpoint.campaignId,
    );
    if (sortedIndex < 0) return;

    setPage(Math.floor(sortedIndex / PAGE_SIZE) + 1);
    setHighlightedIndex(sortedIndex);
    window.setTimeout(() => {
      tableRowRefs.current.get(sortedIndex)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  const channelOptions = (channelsData ?? []).map((channel) => ({ value: channel.id, label: channel.name }));
  const typeOptions = (campaignTypesData ?? []).map((campaignType) => ({ value: campaignType.id, label: campaignType.name }));
  const csvUrl = activeConstituentId ? getExportDonorTouchpointsCsvUrl(activeConstituentId, filterParams) : null;
  const isEmpty = !isLoading && !error && touchpoints.length === 0 && !!activeConstituentId;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Constituent ID Lookup"
        description="View communication history for a single constituent across a date range."
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Enter 8-digit Constituent ID (e.g. 00258155)"
                  className="pl-9 font-mono"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={!inputValue.trim() || isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Lookup
            </Button>
          </form>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            <span>Use Constituent ID only. Do not enter names, phone numbers, email addresses, or other unnecessary PII.</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {CONSTITUENT_LOOKUP_PRESETS.map((option) => (
          <Button
            key={option.key}
            variant={preset === option.key && !showCustom ? "default" : "outline"}
            size="sm"
            className="h-8 text-sm"
            onClick={() => handlePreset(option.key)}
          >
            {option.label}
          </Button>
        ))}

        <Button
          variant={showCustom || preset === ("custom" as string) ? "default" : "outline"}
          size="sm"
          className="h-8 text-sm"
          onClick={() => {
            setShowCustom(true);
            pushState({ preset: "custom" as PresetKey });
          }}
        >
          Custom range
        </Button>
        {showCustom || preset === ("custom" as string) ? (
          <DateRangePicker range={dateRange} onSelect={setCustomRange} />
        ) : null}

        <div className="h-5 border-l border-border" />

        <MultiSelectPill
          label="Channel"
          options={channelOptions}
          selected={channelIds}
          onChange={(next) => pushState({ channelIds: next as number[] })}
        />
        <MultiSelectPill
          label="Campaign Type"
          options={typeOptions}
          selected={campaignTypeIds}
          onChange={(next) => pushState({ campaignTypeIds: next as number[] })}
        />
        <MultiSelectPill
          label="Status"
          options={CAMPAIGN_STATUSES}
          selected={statuses}
          onChange={(next) => pushState({ statuses: next as string[] })}
        />

        <Button
          variant={countsOnly ? "default" : "outline"}
          size="sm"
          className="h-8 border-dashed text-sm"
          onClick={() => pushState({ countsOnly: !countsOnly })}
        >
          Threshold only
        </Button>

        {hasFilters ? (
          <Button variant="ghost" size="sm" className="h-8 text-sm text-muted-foreground" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Clear filters
          </Button>
        ) : null}

        {activeConstituentId && csvUrl && touchpoints.length > 0 ? (
          <div className="ml-auto">
            <a href={csvUrl} download={`constituent_${activeConstituentId}_touchpoints.csv`}>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export CSV
              </Button>
            </a>
          </div>
        ) : null}
      </div>

      {activeConstituentId ? (
        <>
          <ConstituentSummary
            total={summary?.total ?? 0}
            byChannel={summary?.byChannel ?? []}
            byCampaignType={summary?.byCampaignType ?? []}
            longestGapDays={summary?.longestGapDays ?? null}
            mostRecentDate={normalizeSummaryDate(summary?.mostRecentDate)}
            earliestDate={normalizeSummaryDate(summary?.earliestDate)}
            isLoading={summaryLoading}
          />

          <AiConstituentSummary
            constituentId={activeConstituentId}
            queryString={aiSummaryQueryString}
            disabled={isLoading || touchpoints.length === 0}
          />

          {!isLoading && touchpoints.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline — {touchpoints.length} touchpoint{touchpoints.length !== 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ConstituentTimeline
                  touchpoints={touchpoints}
                  highlightedIndex={highlightedIndex}
                  onPointClick={handleTimelinePointClick}
                />
              </CardContent>
            </Card>
          ) : null}

          <ConstituentResults
            activeConstituentId={activeConstituentId}
            csvUrl={csvUrl}
            isLoading={isLoading}
            error={error}
            isEmpty={isEmpty}
            hasFilters={hasFilters}
            rows={paginated}
            sortedCount={sorted.length}
            page={page}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            highlightedIndex={highlightedIndex}
            sort={sort}
            rowRefs={tableRowRefs}
            onSort={handleSort}
            onClearFilters={clearFilters}
            onWidenToAllTime={widenToAllTime}
            onPreviousPage={() => setPage((current) => current - 1)}
            onNextPage={() => setPage((current) => current + 1)}
          />
        </>
      ) : null}
    </div>
  );
}
