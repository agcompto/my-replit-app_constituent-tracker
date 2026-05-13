import { useState, useRef, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useGetDonorTouchpoints,
  useGetDonorTouchpointsSummary,
  useListChannels,
  useListCampaignTypes,
  getExportDonorTouchpointsCsvUrl,
} from "@workspace/api-client-react";
import type { GetDonorTouchpointsParams } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { TouchDateHistoryPopover } from "@/components/touch-date-history-popover";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { normalizeDonorId } from "@/lib/utils";
import {
  Search,
  Loader2,
  AlertCircle,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  CalendarIcon,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Date range presets ────────────────────────────────────────────────────────

type PresetKey = "last90" | "thisFY" | "lastFY" | "last12" | "all";

interface DateRange {
  from?: Date;
  to?: Date;
}

function fiscalYearBounds(offset: 0 | -1): { from: Date; to: Date } {
  const today = new Date();
  const fyMonth = 7; // July — NC State typical FY; could read from settings in future
  let fyStart = new Date(today.getFullYear(), fyMonth - 1, 1);
  if (today < fyStart) fyStart = new Date(today.getFullYear() - 1, fyMonth - 1, 1);
  if (offset === -1) {
    fyStart = new Date(fyStart.getFullYear() - 1, fyStart.getMonth(), 1);
  }
  const fyEnd = new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 0);
  return { from: fyStart, to: fyEnd };
}

function presetToRange(preset: PresetKey): DateRange {
  const today = new Date();
  if (preset === "last90") return { from: subMonths(today, 3), to: today };
  if (preset === "thisFY") return fiscalYearBounds(0);
  if (preset === "lastFY") return fiscalYearBounds(-1);
  if (preset === "last12") return { from: subMonths(today, 12), to: today };
  return {}; // all time
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "last12", label: "Last 12 months" },
  { key: "last90", label: "Last 90 days" },
  { key: "thisFY", label: "This FY" },
  { key: "lastFY", label: "Last FY" },
  { key: "all", label: "All time" },
];

function toIso(d?: Date): string | undefined {
  if (!d) return undefined;
  return format(d, "yyyy-MM-dd");
}

// ─── URL sync helpers ──────────────────────────────────────────────────────────

function parseSearch(search: string) {
  const p = new URLSearchParams(search);
  return {
    donorId: p.get("id") ?? "",
    preset: (p.get("preset") ?? "last12") as PresetKey,
    customFrom: p.get("from") ?? "",
    customTo: p.get("to") ?? "",
    channelIds: p.getAll("ch").map(Number).filter(Boolean),
    campaignTypeIds: p.getAll("ct").map(Number).filter(Boolean),
    statuses: p.getAll("st").filter(Boolean),
    countsOnly: p.get("threshold") === "1",
  };
}

function buildSearch(state: {
  donorId: string;
  preset: PresetKey;
  customFrom: string;
  customTo: string;
  channelIds: number[];
  campaignTypeIds: number[];
  statuses: string[];
  countsOnly: boolean;
}): string {
  const p = new URLSearchParams();
  if (state.donorId) p.set("id", state.donorId);
  if (state.preset !== "last12") p.set("preset", state.preset);
  if (state.preset === "custom" as string) {
    if (state.customFrom) p.set("from", state.customFrom);
    if (state.customTo) p.set("to", state.customTo);
  }
  state.channelIds.forEach((id) => p.append("ch", String(id)));
  state.campaignTypeIds.forEach((id) => p.append("ct", String(id)));
  state.statuses.forEach((s) => p.append("st", s));
  if (state.countsOnly) p.set("threshold", "1");
  return p.toString() ? `?${p}` : "";
}

// ─── Multi-select pill dropdown ────────────────────────────────────────────────

function MultiSelectPill({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (next: (string | number)[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(val: string | number) {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 border-dashed text-sm",
            selected.length > 0 && "border-primary/50 bg-primary/5 text-primary",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                active && "font-medium",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {active && (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          );
        })}
        {selected.length > 0 && (
          <>
            <div className="my-1 border-t" />
            <button
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Date range picker ─────────────────────────────────────────────────────────

function DateRangePicker({
  range,
  onSelect,
}: {
  range: DateRange;
  onSelect: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    range.from && range.to
      ? `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
      : range.from
        ? `From ${format(range.from, "MMM d, yyyy")}`
        : "Pick custom range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={{ from: range.from, to: range.to }}
          onSelect={(r) => {
            if (r) onSelect({ from: r.from, to: r.to });
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Timeline strip ────────────────────────────────────────────────────────────

const CHANNEL_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function getChannelColor(channelId: number, allChannelIds: number[]): string {
  const idx = allChannelIds.indexOf(channelId);
  return CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}

interface TouchpointRow {
  campaignId: number;
  campaignName: string;
  campaignStatus: string;
  touchId: number;
  channelId: number;
  channelLabel: string;
  campaignTypeId: number;
  campaignTypeLabel: string;
  sendDate: string;
  countsTowardThreshold: boolean;
}

function TimelineStrip({
  touchpoints,
  onDotClick,
  highlightedIdx,
}: {
  touchpoints: TouchpointRow[];
  onDotClick: (idx: number) => void;
  highlightedIdx: number | null;
}) {
  const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allChannelIds = useMemo(
    () => Array.from(new Set(touchpoints.map((t) => t.channelId))),
    [touchpoints],
  );

  if (touchpoints.length === 0) return null;

  const dates = touchpoints.map((t) => new Date(t.sendDate + "T00:00:00").getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const span = maxDate - minDate || 1;

  const WIDTH = 800;
  const HEIGHT = 36;
  const DOT_R = 5;
  const PAD = 12;
  const usableW = WIDTH - PAD * 2;

  function dateToX(ts: number): number {
    return PAD + ((ts - minDate) / span) * usableW;
  }

  return (
    <div className="relative" ref={containerRef}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full rounded border bg-muted/20"
        style={{ height: 44 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Axis line */}
        <line x1={PAD} y1={HEIGHT / 2} x2={WIDTH - PAD} y2={HEIGHT / 2} stroke="#e5e7eb" strokeWidth={1} />
        {touchpoints.map((t, i) => {
          const ts = new Date(t.sendDate + "T00:00:00").getTime();
          const x = dateToX(ts);
          const color = getChannelColor(t.channelId, allChannelIds);
          const isHighlighted = highlightedIdx === i;
          return (
            <circle
              key={i}
              cx={x}
              cy={HEIGHT / 2}
              r={isHighlighted ? DOT_R + 2 : DOT_R}
              fill={color}
              stroke={isHighlighted ? "#111" : "white"}
              strokeWidth={isHighlighted ? 2 : 1}
              className="cursor-pointer transition-all"
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltip({ idx: i, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => onDotClick(i)}
            />
          );
        })}
      </svg>

      {/* Axis labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 px-3">
        <span>{format(new Date(minDate), "MMM d, yyyy")}</span>
        <span>{format(new Date(maxDate), "MMM d, yyyy")}</span>
      </div>

      {/* Tooltip */}
      {tooltip !== null && touchpoints[tooltip.idx] && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(tooltip.x + 8, (containerRef.current?.clientWidth ?? 300) - 200),
            top: tooltip.y - 56,
          }}
        >
          <div className="font-medium">{touchpoints[tooltip.idx].campaignName}</div>
          <div className="text-muted-foreground">{touchpoints[tooltip.idx].channelLabel}</div>
          <div className="text-muted-foreground">
            {format(new Date(touchpoints[tooltip.idx].sendDate + "T00:00:00"), "MMM d, yyyy")}
          </div>
        </div>
      )}

      {/* Channel legend */}
      {allChannelIds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-3">
          {allChannelIds.map((chId) => {
            const tp = touchpoints.find((t) => t.channelId === chId);
            return (
              <div key={chId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getChannelColor(chId, allChannelIds) }}
                />
                {tp?.channelLabel}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Summary header card ───────────────────────────────────────────────────────

function SummaryCard({
  total,
  byChannel,
  byCampaignType,
  longestGapDays,
  mostRecentDate,
  earliestDate,
  isLoading,
}: {
  total: number;
  byChannel: { channelId: number; label: string; count: number; percent: number }[];
  byCampaignType: { campaignTypeId: number; label: string; count: number }[];
  longestGapDays: number | null;
  mostRecentDate: string | null;
  earliestDate: string | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const allChannelIds = byChannel.map((c) => c.channelId);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold">{total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total touchpoints in range</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1">
            {byChannel.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              byChannel.map((ch) => (
                <div key={ch.channelId} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getChannelColor(ch.channelId, allChannelIds) }}
                  />
                  <span className="truncate flex-1">{ch.label}</span>
                  <span className="font-medium tabular-nums">{ch.count}</span>
                  <span className="text-muted-foreground">({ch.percent}%)</span>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">By channel</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1">
            {byCampaignType.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              byCampaignType.map((ct) => (
                <div key={ct.campaignTypeId} className="flex items-center gap-1 text-xs">
                  <span className="truncate flex-1">{ct.label}</span>
                  <span className="font-medium tabular-nums">{ct.count}</span>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">By campaign type</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1.5 text-xs">
            {mostRecentDate ? (
              <div>
                <span className="text-muted-foreground">Most recent: </span>
                <span className="font-medium">
                  {format(new Date(mostRecentDate + "T00:00:00"), "MMM d, yyyy")}
                </span>
              </div>
            ) : null}
            {earliestDate && earliestDate !== mostRecentDate ? (
              <div>
                <span className="text-muted-foreground">Earliest: </span>
                <span className="font-medium">
                  {format(new Date(earliestDate + "T00:00:00"), "MMM d, yyyy")}
                </span>
              </div>
            ) : null}
            {longestGapDays !== null && (
              <div>
                <span className="text-muted-foreground">Longest gap: </span>
                <span className="font-medium">{longestGapDays} days</span>
              </div>
            )}
            {!mostRecentDate && longestGapDays === null && (
              <div className="text-muted-foreground">—</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Dates</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sort helpers ──────────────────────────────────────────────────────────────

type SortCol = "sendDate" | "channelLabel" | "campaignTypeLabel";
type SortDir = "asc" | "desc";

function sortTouchpoints(rows: TouchpointRow[], col: SortCol, dir: SortDir): TouchpointRow[] {
  return [...rows].sort((a, b) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: SortDir } }) {
  if (sort.col !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
  return sort.dir === "asc" ? (
    <ChevronUp className="ml-1 h-3 w-3" />
  ) : (
    <ChevronDown className="ml-1 h-3 w-3" />
  );
}

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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Donors() {
  const rawSearch = useSearch();
  const [, setLocation] = useLocation();
  const parsed = parseSearch(rawSearch);

  // Stable state derived from URL
  const {
    donorId: urlDonorId,
    preset,
    customFrom,
    customTo,
    channelIds,
    campaignTypeIds,
    statuses,
    countsOnly,
  } = parsed;

  const [inputVal, setInputVal] = useState(urlDonorId);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "sendDate", dir: "asc" });
  const [page, setPage] = useState(1);
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(preset === ("custom" as string));
  const tableRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Reference to track active donor
  const activeDonorId = urlDonorId || null;

  // Compute date range from preset or custom
  const dateRange: DateRange = useMemo(() => {
    if (preset === ("custom" as string)) {
      return {
        from: customFrom ? new Date(customFrom + "T00:00:00") : undefined,
        to: customTo ? new Date(customTo + "T00:00:00") : undefined,
      };
    }
    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  // Build filter params
  const filterParams: GetDonorTouchpointsParams = useMemo(() => {
    const p: GetDonorTouchpointsParams = {};
    if (dateRange.from) p.startDate = toIso(dateRange.from);
    if (dateRange.to) p.endDate = toIso(dateRange.to);
    if (channelIds.length) p.channelId = channelIds;
    if (campaignTypeIds.length) p.campaignTypeId = campaignTypeIds;
    if (statuses.length) p.status = statuses;
    if (countsOnly) p.countsTowardThresholdOnly = true;
    return p;
  }, [dateRange, channelIds, campaignTypeIds, statuses, countsOnly]);

  const { data: channelsData } = useListChannels();
  const { data: campaignTypesData } = useListCampaignTypes();

  const { data, isLoading, error } = useGetDonorTouchpoints(
    activeDonorId as string,
    filterParams,
    { query: { enabled: !!activeDonorId, queryKey: ["donor-touchpoints", activeDonorId, filterParams] } },
  );

  const { data: summary, isLoading: summaryLoading } = useGetDonorTouchpointsSummary(
    activeDonorId as string,
    filterParams,
    { query: { enabled: !!activeDonorId, queryKey: ["donor-summary", activeDonorId, filterParams] } },
  );

  const touchpoints: TouchpointRow[] = data?.touchpoints ?? [];

  // Sort + paginate
  const sorted = useMemo(() => sortTouchpoints(touchpoints, sort.col, sort.dir), [touchpoints, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setHighlightedIdx(null);
  }, [activeDonorId, filterParams, sort]);

  function pushState(patch: Partial<typeof parsed>) {
    const next = { ...parsed, ...patch };
    setLocation(`/donors${buildSearch(next)}`, { replace: true });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const norm = normalizeDonorId(inputVal);
    if (norm) {
      setInputVal(norm);
      pushState({ donorId: norm });
    }
  }

  function handlePreset(key: PresetKey) {
    setShowCustom(false);
    pushState({ preset: key, customFrom: "", customTo: "" });
  }

  function handleCustomRange(r: DateRange) {
    pushState({
      preset: "custom" as PresetKey,
      customFrom: toIso(r.from) ?? "",
      customTo: toIso(r.to) ?? "",
    });
  }

  function handleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" },
    );
  }

  function handleDotClick(globalIdx: number) {
    // globalIdx is in original order (pre-sort), map to sorted index
    const tp = touchpoints[globalIdx];
    const sortedIdx = sorted.findIndex(
      (t) => t.touchId === tp.touchId && t.sendDate === tp.sendDate && t.campaignId === tp.campaignId,
    );
    if (sortedIdx < 0) return;
    const targetPage = Math.floor(sortedIdx / PAGE_SIZE) + 1;
    setPage(targetPage);
    setHighlightedIdx(sortedIdx);
    // Scroll after render
    setTimeout(() => {
      const row = tableRowRefs.current.get(sortedIdx);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
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

  const hasFilters =
    channelIds.length > 0 ||
    campaignTypeIds.length > 0 ||
    statuses.length > 0 ||
    countsOnly ||
    preset !== "all";

  const channelOptions = (channelsData ?? []).map((c) => ({ value: c.id, label: c.name }));
  const typeOptions = (campaignTypesData ?? []).map((t) => ({ value: t.id, label: t.name }));

  // Build CSV export URL
  const csvUrl = activeDonorId
    ? getExportDonorTouchpointsCsvUrl(activeDonorId, filterParams)
    : null;

  const isEmpty = !isLoading && !error && touchpoints.length === 0 && !!activeDonorId;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Constituent ID Lookup</h1>
        <p className="text-muted-foreground text-sm">
          View communication history for a single constituent across a date range.
        </p>
      </div>

      {/* Lookup input */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter 8-digit Constituent ID (e.g. 00258155)"
                  className="pl-9 font-mono"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={!inputVal.trim() || isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Lookup
            </Button>
          </form>
          <div className="mt-2 text-xs flex items-center gap-1.5 text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>
              Use Constituent ID only. Do not enter names, phone numbers, email addresses, or other
              unnecessary PII.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Date range + filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Preset buttons */}
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={preset === p.key && !showCustom ? "default" : "outline"}
            size="sm"
            className="h-8 text-sm"
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}

        {/* Custom range */}
        <div>
          <Button
            variant={showCustom || (preset === ("custom" as string)) ? "default" : "outline"}
            size="sm"
            className="h-8 text-sm"
            onClick={() => {
              setShowCustom(true);
              pushState({ preset: "custom" as PresetKey });
            }}
          >
            Custom range
          </Button>
        </div>
        {(showCustom || preset === ("custom" as string)) && (
          <DateRangePicker range={dateRange} onSelect={handleCustomRange} />
        )}

        <div className="h-5 border-l border-border" />

        {/* Filters */}
        <MultiSelectPill
          label="Channel"
          options={channelOptions}
          selected={channelIds}
          onChange={(v) => pushState({ channelIds: v as number[] })}
        />
        <MultiSelectPill
          label="Campaign Type"
          options={typeOptions}
          selected={campaignTypeIds}
          onChange={(v) => pushState({ campaignTypeIds: v as number[] })}
        />
        <MultiSelectPill
          label="Status"
          options={CAMPAIGN_STATUSES}
          selected={statuses}
          onChange={(v) => pushState({ statuses: v as string[] })}
        />

        {/* Counts toward threshold toggle */}
        <Button
          variant={countsOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-sm border-dashed"
          onClick={() => pushState({ countsOnly: !countsOnly })}
        >
          Threshold only
        </Button>

        {/* Clear all */}
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-sm text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear filters
          </Button>
        )}

        {/* CSV download */}
        {activeDonorId && csvUrl && touchpoints.length > 0 && (
          <div className="ml-auto">
            <a href={csvUrl} download={`donor_${activeDonorId}_touchpoints.csv`}>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* Results area */}
      {activeDonorId && (
        <>
          {/* Summary cards */}
          <SummaryCard
            total={summary?.total ?? 0}
            byChannel={summary?.byChannel ?? []}
            byCampaignType={summary?.byCampaignType ?? []}
            longestGapDays={summary?.longestGapDays ?? null}
            mostRecentDate={
              summary?.mostRecentDate
                ? (typeof summary.mostRecentDate === "string"
                    ? summary.mostRecentDate
                    : (summary.mostRecentDate as Date).toISOString().slice(0, 10))
                : null
            }
            earliestDate={
              summary?.earliestDate
                ? (typeof summary.earliestDate === "string"
                    ? summary.earliestDate
                    : (summary.earliestDate as Date).toISOString().slice(0, 10))
                : null
            }
            isLoading={summaryLoading}
          />

          {/* Timeline strip */}
          {!isLoading && touchpoints.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline — {touchpoints.length} touchpoint{touchpoints.length !== 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TimelineStrip
                  touchpoints={touchpoints}
                  onDotClick={handleDotClick}
                  highlightedIdx={highlightedIdx}
                />
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>
                  Touchpoints for{" "}
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary">
                    {activeDonorId}
                  </span>
                </CardTitle>
                {activeDonorId && csvUrl && touchpoints.length > 0 && (
                  <a href={csvUrl} download={`donor_${activeDonorId}_touchpoints.csv`}>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </a>
                )}
              </div>
            </CardHeader>

            <div className="overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("channelLabel")}
                    >
                      <span className="flex items-center">
                        Channel <SortIcon col="channelLabel" sort={sort} />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("campaignTypeLabel")}
                    >
                      <span className="flex items-center">
                        Campaign Type <SortIcon col="campaignTypeLabel" sort={sort} />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort("sendDate")}
                    >
                      <span className="flex items-center">
                        Send Date <SortIcon col="sendDate" sort={sort} />
                      </span>
                    </TableHead>
                    <TableHead>Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`sk-${i}`} aria-hidden>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      </TableRow>
                    ))}

                  {error && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-destructive">
                        Failed to load constituent data.
                      </TableCell>
                    </TableRow>
                  )}

                  {isEmpty && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <AlertCircle className="h-8 w-8 opacity-30" />
                          <div className="text-sm font-medium">No touchpoints in this range</div>
                          <p className="text-xs max-w-xs">
                            No communications match the active filters. Try clearing filters or widening
                            the date range.
                          </p>
                          <div className="flex gap-2 mt-1">
                            {hasFilters && (
                              <Button variant="outline" size="sm" onClick={clearFilters}>
                                Clear filters
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={widenToAllTime}>
                              Widen to all time
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {paginated.map((t, pageIdx) => {
                    const globalSortedIdx = (page - 1) * PAGE_SIZE + pageIdx;
                    const isHighlighted = highlightedIdx === globalSortedIdx;
                    return (
                      <TableRow
                        key={`${t.campaignId}-${t.touchId}-${t.sendDate}`}
                        ref={(el) => {
                          if (el) tableRowRefs.current.set(globalSortedIdx, el);
                          else tableRowRefs.current.delete(globalSortedIdx);
                        }}
                        className={cn(
                          isHighlighted && "bg-primary/5 outline outline-1 outline-primary/30",
                        )}
                      >
                        <TableCell className="font-medium">{t.campaignName}</TableCell>
                        <TableCell><StatusBadge status={t.campaignStatus} /></TableCell>
                        <TableCell>{t.channelLabel}</TableCell>
                        <TableCell>{t.campaignTypeLabel}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <span>{format(new Date(t.sendDate + "T00:00:00"), "MMM d, yyyy")}</span>
                            <TouchDateHistoryPopover
                              campaignId={t.campaignId}
                              touchId={t.touchId}
                              touchName={t.campaignName}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.countsTowardThreshold ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                              No
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of{" "}
                  {sorted.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
