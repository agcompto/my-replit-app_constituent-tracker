import {
  useState, useMemo, useCallback, useRef, useEffect, type RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, isWeekend,
  format, parseISO, parse, isValid, nextMonday, nextSunday,
} from "date-fns";
import {
  useGetCalendarFeed,
  useListChannels,
  useListOwningUnits,
  useListCampaignTypes,
  useGetMe,
  useListSavedReportViews,
  useCreateSavedReportView,
  useDeleteSavedReportView,
  getListSavedReportViewsQueryKey,
  useGetCalendarPreferences,
  usePutCalendarPreferences,
  getGetCalendarFeedQueryKey,
  getGetCalendarFeedQueryOptions,
} from "@workspace/api-client-react";
import type { CalendarFeedCampaigns, GetCalendarFeedParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ChevronLeft, ChevronRight, CalendarDays, Link2, BookmarkPlus,
  X, Trash2, AlignJustify, LayoutGrid, Filter, Info, Bookmark, Settings2,
  AlertTriangle, HelpCircle, CalendarSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarPublishingPanel } from "@/components/calendar-publishing-panel";

// ─── Types ─────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week";
type Density = "comfortable" | "compact";

interface CalendarFilters {
  owningUnit: string;
  channelIds: number[];
  campaignTypeIds: number[];
  statuses: string[];
  mine: boolean;
  nameContains: string;
}

// Touch row from the API (slim — no campaign fields)
interface ApiTouch {
  touchId: number;
  touchName: string;
  sendDate: string;
  campaignId: number;
  channelId: number;
  channelLabel: string;
  campaignTypeLabel: string;
  audienceCount: number;
  conflictDonorCount: number;
  /** Up to 50 donor IDs from this touch's audience that are in conflict. */
  conflictDonorSample: string[];
}

// Rehydrated touch: API touch + campaign metadata merged in
interface RichCalTouch extends ApiTouch {
  campaignName: string;
  campaignStatus: string;
  owningUnit?: string | null;
  submittedByUserId: number;
  campaignTypeLabels: string[];
  /** Campaign-level totals for the sheet conflict header */
  campaignConflictDonorCount: number;
  campaignConflictDonorSample: string[];
}

interface TouchGroup {
  campaignId: number;
  campaignName: string;
  campaignStatus: string;
  channelId: number;
  channelLabel: string;
  sendDate: string;
  touches: RichCalTouch[];
  campaignConflictDonorCount: number;
  campaignConflictDonorSample: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ALL_STATUSES = ["draft", "uploaded", "previewed", "finalized", "exported", "archived"];
const DEFAULT_STATUSES = ["uploaded", "previewed", "finalized", "exported", "archived"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEW_TYPE = "calendar";
const PREFS_DEBOUNCE_MS = 1200;

const CHANNEL_PALETTE = [
  { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-400", dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-400", dot: "bg-emerald-500" },
  { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-400", dot: "bg-purple-500" },
  { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-400", dot: "bg-orange-500" },
  { bg: "bg-pink-100", text: "text-pink-900", border: "border-pink-400", dot: "bg-pink-500" },
  { bg: "bg-cyan-100", text: "text-cyan-900", border: "border-cyan-400", dot: "bg-cyan-500" },
  { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-400", dot: "bg-amber-500" },
  { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-400", dot: "bg-rose-500" },
  { bg: "bg-indigo-100", text: "text-indigo-900", border: "border-indigo-400", dot: "bg-indigo-500" },
  { bg: "bg-teal-100", text: "text-teal-900", border: "border-teal-400", dot: "bg-teal-500" },
] as const;

const LEGEND_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F97316", "#EC4899",
  "#06B6D4", "#F59E0B", "#F43F5E", "#6366F1", "#14B8A6",
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function paletteFor(channelId: number) {
  return CHANNEL_PALETTE[channelId % CHANNEL_PALETTE.length];
}

function legendColorFor(channelId: number) {
  return LEGEND_COLORS[channelId % LEGEND_COLORS.length];
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function buildUrl(
  viewMode: ViewMode,
  anchor: Date,
  filters: CalendarFilters,
  density: Density,
): string {
  const p = new URLSearchParams();
  p.set("view", viewMode);
  p.set("date", viewMode === "month" ? format(anchor, "yyyy-MM") : format(anchor, "yyyy-MM-dd"));
  if (filters.owningUnit) p.set("unit", filters.owningUnit);
  if (filters.channelIds.length) p.set("ch", filters.channelIds.join(","));
  if (filters.campaignTypeIds.length) p.set("ct", filters.campaignTypeIds.join(","));
  const defaultSorted = [...DEFAULT_STATUSES].sort().join(",");
  const curSorted = [...filters.statuses].sort().join(",");
  if (curSorted !== defaultSorted) p.set("st", filters.statuses.join(","));
  if (filters.mine) p.set("mine", "1");
  if (filters.nameContains) p.set("q", filters.nameContains);
  if (density === "compact") p.set("density", "compact");
  return "/calendar?" + p.toString();
}

function parseUrlState(search: string): {
  viewMode: ViewMode;
  anchor: Date;
  filters: CalendarFilters;
  density: Density;
} {
  const p = new URLSearchParams(search);
  const viewMode: ViewMode = p.get("view") === "week" ? "week" : "month";
  let anchor = new Date();
  const dateStr = p.get("date");
  if (dateStr) {
    const parsed = parseISO(dateStr.length === 7 ? dateStr + "-01" : dateStr);
    if (!isNaN(parsed.getTime())) anchor = parsed;
  }
  const ch = p.get("ch");
  const ct = p.get("ct");
  const st = p.get("st");
  return {
    viewMode,
    anchor,
    filters: {
      owningUnit: p.get("unit") ?? "",
      channelIds: ch ? ch.split(",").map(Number).filter(isFinite) : [],
      campaignTypeIds: ct ? ct.split(",").map(Number).filter(isFinite) : [],
      statuses: st ? st.split(",").filter(Boolean) : [...DEFAULT_STATUSES],
      mine: p.get("mine") === "1",
      nameContains: p.get("q") ?? "",
    },
    density: p.get("density") === "compact" ? "compact" : "comfortable",
  };
}

function gridRange(viewMode: ViewMode, anchor: Date): { gridStart: Date; gridEnd: Date } {
  if (viewMode === "week") {
    const gridStart = startOfWeek(anchor, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(anchor, { weekStartsOn: 0 });
    return { gridStart, gridEnd };
  }
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
  return { gridStart, gridEnd };
}

function rehydrateTouches(
  apiTouches: ApiTouch[],
  campaigns: CalendarFeedCampaigns,
): RichCalTouch[] {
  return apiTouches.map((t) => {
    const c = campaigns[String(t.campaignId)];
    return {
      ...t,
      campaignName: c?.name ?? "",
      campaignStatus: c?.status ?? "",
      owningUnit: c?.owningUnit ?? null,
      submittedByUserId: c?.submittedByUserId ?? 0,
      campaignTypeLabels: c?.campaignTypeLabels ?? [t.campaignTypeLabel],
      campaignConflictDonorCount: c?.conflictDonorCount ?? 0,
      campaignConflictDonorSample: c?.conflictDonorSample ?? [],
    };
  });
}

function groupTouches(touches: RichCalTouch[]): Map<string, TouchGroup[]> {
  const dayMap = new Map<string, Map<string, TouchGroup>>();
  for (const t of touches) {
    if (!dayMap.has(t.sendDate)) dayMap.set(t.sendDate, new Map());
    const groupKey = `${t.campaignId}`;
    const g = dayMap.get(t.sendDate)!;
    if (!g.has(groupKey)) {
      g.set(groupKey, {
        campaignId: t.campaignId,
        campaignName: t.campaignName,
        campaignStatus: t.campaignStatus,
        channelId: t.channelId,
        channelLabel: t.channelLabel,
        sendDate: t.sendDate,
        touches: [],
        campaignConflictDonorCount: t.campaignConflictDonorCount,
        campaignConflictDonorSample: t.campaignConflictDonorSample,
      });
    }
    g.get(groupKey)!.touches.push(t);
  }
  const result = new Map<string, TouchGroup[]>();
  for (const [date, gMap] of dayMap) {
    result.set(date, Array.from(gMap.values()));
  }
  return result;
}

// Parse natural date formats for jump-to-date
function parseNaturalDate(str: string): Date | null {
  const s = str.trim();
  if (!s) return null;

  // ISO format YYYY-MM-DD
  const iso = parse(s, "yyyy-MM-dd", new Date());
  if (isValid(iso)) return iso;

  // "Jul 15" or "July 15"
  const monthDay = parse(s, "MMM d", new Date());
  if (isValid(monthDay)) return monthDay;
  const monthDayFull = parse(s, "MMMM d", new Date());
  if (isValid(monthDayFull)) return monthDayFull;

  // "Jul 15, 2026" or "July 15, 2026"
  const monthDayYear = parse(s, "MMM d, yyyy", new Date());
  if (isValid(monthDayYear)) return monthDayYear;
  const monthDayYearFull = parse(s, "MMMM d, yyyy", new Date());
  if (isValid(monthDayYearFull)) return monthDayYearFull;

  // Natural keywords
  const lower = s.toLowerCase();
  if (lower === "today") return new Date();
  if (lower === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); return d; }
  if (lower === "next monday") return nextMonday(new Date());
  if (lower === "next sunday") return nextSunday(new Date());

  return null;
}

function buildCalendarFeedParams(
  gridStart: Date,
  gridEnd: Date,
  filters: CalendarFilters,
): GetCalendarFeedParams {
  return {
    startDate: format(gridStart, "yyyy-MM-dd"),
    endDate: format(gridEnd, "yyyy-MM-dd"),
    owningUnit: filters.owningUnit || undefined,
    channelId: filters.channelIds.length ? filters.channelIds : undefined,
    campaignTypeId: filters.campaignTypeIds.length ? filters.campaignTypeIds : undefined,
    status: filters.statuses.length && filters.statuses.length < ALL_STATUSES.length ? filters.statuses : undefined,
    mine: filters.mine || undefined,
    nameContains: filters.nameContains || undefined,
  };
}

// ─── MultiSelectFilter ──────────────────────────────────────────────────────

interface MultiSelectFilterProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === 0 || selected.length === options.length;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1 text-xs",
            selected.length > 0 && selected.length < options.length && "border-primary text-primary",
          )}
        >
          <Filter className="h-3 w-3" />
          {label}
          {selected.length > 0 && selected.length < options.length && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {!allSelected && (
            <button
              className="text-[10px] text-primary underline"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-1">
          {options.map((opt) => (
            <div
              key={opt.value}
              className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted"
              onClick={() => toggle(opt.value)}
            >
              <Checkbox
                checked={selected.length === 0 || selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5"
              />
              <Label className="cursor-pointer text-xs truncate">{opt.label}</Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── SparklineStrip ────────────────────────────────────────────────────────

interface SparklineStripProps {
  gridDays: Date[];
  dayVolumes: Record<string, number>;
  onDayClick: (day: Date) => void;
  /** Day currently selected/focused in the grid — highlighted with primary color */
  focusedDay: Date | null;
  /** Callback when a bar is hovered — used to highlight the matching day cell */
  onHoverDay: (day: Date | null) => void;
}

function SparklineStrip({ gridDays, dayVolumes, onDayClick, focusedDay, onHoverDay }: SparklineStripProps) {
  const maxVol = useMemo(() => Math.max(1, ...gridDays.map((d) => dayVolumes[format(d, "yyyy-MM-dd")] ?? 0)), [gridDays, dayVolumes]);

  if (gridDays.length === 0) return null;

  const STRIP_H = 24;

  return (
    <div
      className="grid border-b bg-muted/20"
      style={{ gridTemplateColumns: `repeat(7, 1fr)` }}
      aria-hidden
    >
      {gridDays.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const vol = dayVolumes[dateStr] ?? 0;
        const ratio = vol > 0 ? vol / maxVol : 0;
        const barH = Math.max(2, Math.round(ratio * (STRIP_H - 4)));
        const isFocused = focusedDay ? isSameDay(day, focusedDay) : false;

        return (
          <Tooltip key={dateStr}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "relative flex items-end justify-center border-r last:border-r-0 hover:bg-muted/60 transition-colors",
                  isFocused && "bg-muted/50",
                )}
                style={{ height: STRIP_H }}
                onClick={() => vol > 0 && onDayClick(day)}
                onMouseEnter={() => onHoverDay(day)}
                onMouseLeave={() => onHoverDay(null)}
                tabIndex={-1}
              >
                {vol > 0 && (
                  <span
                    className={cn(
                      "w-[70%] rounded-t-sm transition-all",
                      isFocused ? "bg-primary/70" : "bg-primary/30",
                    )}
                    style={{ height: barH }}
                  />
                )}
              </button>
            </TooltipTrigger>
            {vol > 0 && (
              <TooltipContent side="bottom" className="text-xs">
                {format(day, "MMM d")}: {fmtCount(vol)} recipients
              </TooltipContent>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}

// ─── ShortcutHelpPopover ───────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: ["M"], desc: "Switch to Month view" },
  { keys: ["W"], desc: "Switch to Week view" },
  { keys: ["T"], desc: "Go to today" },
  { keys: ["/"], desc: "Focus the name search filter" },
  { keys: ["J"], desc: "Focus the jump-to-date input" },
  { keys: ["?"], desc: "Open this shortcut help" },
  { keys: ["←", "→", "↑", "↓"], desc: "Navigate day cells" },
  { keys: ["Enter"], desc: "Open day detail" },
  { keys: ["Esc"], desc: "Close day detail / popover" },
];

function ShortcutHelpPopover({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground"
          aria-label="Keyboard shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="text-xs font-semibold mb-2">Keyboard shortcuts</div>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <div className="flex gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── JumpToDateInput ───────────────────────────────────────────────────────

interface JumpToDateInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  onJump: (date: Date) => void;
}

function JumpToDateInput({ inputRef, onJump }: JumpToDateInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit() {
    const parsed = parseNaturalDate(value);
    if (parsed) {
      setError(false);
      setValue("");
      onJump(parsed);
      inputRef.current?.blur();
    } else {
      setError(true);
    }
  }

  return (
    <div className="relative flex items-center">
      <CalendarSearch className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setValue(""); setError(false); inputRef.current?.blur(); }
        }}
        placeholder="Jump to date…"
        className={cn(
          "h-8 text-xs w-[160px] pl-6",
          error && "border-destructive focus-visible:ring-destructive",
        )}
        aria-label="Jump to date"
      />
    </div>
  );
}

// ─── TouchPopoverContent ───────────────────────────────────────────────────

function TouchPopoverContent({ group }: { group: TouchGroup }) {
  const palette = paletteFor(group.channelId);
  return (
    <div className="w-72 p-1 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full flex-shrink-0", palette.dot)} />
        <span className="font-semibold truncate">{group.channelLabel}</span>
        <span className="ml-auto">
          <StatusPill status={group.campaignStatus} />
        </span>
      </div>
      <div className="font-medium text-xs text-muted-foreground mb-1">{group.campaignName}</div>
      <Separator className="my-2" />
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {group.touches.map((t) => (
          <div key={t.touchId} className="border rounded p-1.5 text-xs">
            <div className="font-medium truncate">{t.touchName}</div>
            <div className="flex items-center justify-between mt-0.5 text-muted-foreground">
              <span>{format(parseISO(t.sendDate), "MMM d, yyyy")}</span>
              <span>{fmtCount(t.audienceCount)} recipients</span>
            </div>
            {t.campaignTypeLabel && (
              <div className="text-muted-foreground truncate">{t.campaignTypeLabels.join(", ")}</div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t">
        <Link
          to={`/campaigns/${group.campaignId}`}
          className="text-xs text-primary hover:underline"
        >
          Open campaign →
        </Link>
      </div>
    </div>
  );
}

// ─── StatusPill ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    uploaded: "bg-blue-100 text-blue-700",
    previewed: "bg-yellow-100 text-yellow-700",
    finalized: "bg-green-100 text-green-700",
    exported: "bg-purple-100 text-purple-700",
    archived: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", map[status] ?? "bg-gray-100 text-gray-700")}>
      {status}
    </span>
  );
}

// ─── TouchChip ─────────────────────────────────────────────────────────────

interface TouchChipProps {
  group: TouchGroup;
  density: Density;
  showConflicts: boolean;
  onPopoverChange?: (open: boolean) => void;
}

function TouchChip({ group, density, showConflicts, onPopoverChange }: TouchChipProps) {
  const [open, setOpen] = useState(false);
  const palette = paletteFor(group.channelId);
  const isDraft = group.campaignStatus === "draft";
  const hasConflict = showConflicts && group.touches.some((t) => t.conflictDonorCount > 0);

  function handleChange(v: boolean) {
    setOpen(v);
    onPopoverChange?.(v);
  }

  const chipClass = cn(
    "cursor-pointer border select-none truncate",
    palette.bg, palette.text, palette.border,
    isDraft && "border-dashed",
    hasConflict && "border-l-2 border-l-red-500",
  );

  if (density === "compact") {
    return (
      <Popover open={open} onOpenChange={handleChange}>
        <PopoverTrigger asChild>
          <div
            className={cn("flex items-center gap-1 px-1 py-0.5 rounded text-[10px]", chipClass)}
            role="button"
            aria-haspopup="true"
            aria-expanded={open}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", palette.dot)} />
            <span className="truncate flex-1">{group.touches[0].touchName}</span>
            {group.touches.length > 1 && (
              <span className="flex-shrink-0 font-semibold">×{group.touches.length}</span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="p-2" align="start" side="top">
          <TouchPopoverContent group={group} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleChange}>
      <PopoverTrigger asChild>
        <div
          className={cn("px-1.5 py-1 rounded text-[11px] leading-tight", chipClass)}
          role="button"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <div className="flex items-center gap-1">
            <span className="font-medium truncate flex-1">{group.touches[0].touchName}</span>
            {group.touches.length > 1 && (
              <span className="flex-shrink-0 text-[10px] font-semibold">×{group.touches.length}</span>
            )}
          </div>
          <div className="truncate text-[10px] opacity-75">{group.campaignName}</div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-2" align="start" side="top">
        <TouchPopoverContent group={group} />
      </PopoverContent>
    </Popover>
  );
}

// ─── LegendPopover ─────────────────────────────────────────────────────────

function LegendPopover({ channels }: { channels: { id: number; name: string }[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Legend
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="text-xs font-semibold mb-2">Channel colors</div>
        <div className="space-y-1.5 mb-3">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ background: legendColorFor(ch.id) }}
              />
              <span className="text-xs truncate">{ch.name}</span>
            </div>
          ))}
          {channels.length === 0 && <div className="text-xs text-muted-foreground">No channels configured.</div>}
        </div>
        <Separator className="my-2" />
        <div className="text-xs font-semibold mb-2">Status border</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-3 w-8 border-2 border-dashed border-gray-400 rounded" />
            <span className="text-muted-foreground">Draft</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="h-3 w-8 border-2 border-solid border-gray-600 rounded" />
            <span className="text-muted-foreground">Other (finalized, exported, …)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="h-3 w-8 border-2 border-l-4 border-red-500 border-gray-300 rounded" />
            <span className="text-muted-foreground">Has threshold conflicts</span>
          </div>
        </div>
        <Separator className="my-2" />
        <div className="text-xs font-semibold mb-1">Heat tint</div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 rounded" style={{ background: "linear-gradient(to right, rgba(249,115,22,0.05), rgba(249,115,22,0.3))" }} />
          <span className="text-xs text-muted-foreground">Audience volume</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── SavedViewsPanel ───────────────────────────────────────────────────────

interface SavedViewsPanelProps {
  filters: CalendarFilters;
  density: Density;
  onLoad: (filters: CalendarFilters, density: Density) => void;
}

function SavedViewsPanel({ filters, density, onLoad }: SavedViewsPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: views } = useListSavedReportViews({ viewType: VIEW_TYPE });
  const createView = useCreateSavedReportView();
  const deleteView = useDeleteSavedReportView();

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "org">("private");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListSavedReportViewsQueryKey({ viewType: VIEW_TYPE }) });
  }

  function handleSave() {
    if (!name.trim()) return;
    createView.mutate(
      {
        data: {
          name: name.trim(),
          viewType: VIEW_TYPE,
          visibility,
          filters: filters as unknown as Record<string, unknown>,
          config: { density } as Record<string, unknown>,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "View saved" });
          setSaveOpen(false);
          setName("");
          invalidate();
        },
        onError: (e: unknown) => {
          const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
            ?? (e as { message?: string })?.message;
          toast({ title: "Could not save view", description: msg, variant: "destructive" });
        },
      },
    );
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this saved view?")) return;
    deleteView.mutate({ id }, { onSuccess: invalidate });
  }

  function handleLoad(v: { filters: Record<string, unknown>; config: Record<string, unknown> }) {
    const f = v.filters as Partial<CalendarFilters>;
    const loaded: CalendarFilters = {
      owningUnit: (f.owningUnit as string) ?? "",
      channelIds: (f.channelIds as number[]) ?? [],
      campaignTypeIds: (f.campaignTypeIds as number[]) ?? [],
      statuses: (f.statuses as string[]) ?? [...DEFAULT_STATUSES],
      mine: !!(f.mine),
      nameContains: (f.nameContains as string) ?? "",
    };
    const d: Density = v.config?.density === "compact" ? "compact" : "comfortable";
    onLoad(loaded, d);
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Bookmark className="h-3.5 w-3.5" />
            Views
            {(views?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {views!.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Saved views</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="h-3 w-3" />
              Save current
            </Button>
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {(views?.length ?? 0) === 0 ? (
              <div className="px-2 py-3 text-xs text-center text-muted-foreground">
                No saved views yet.
              </div>
            ) : (
              views!.map((v) => (
                <div key={v.id} className="flex items-center gap-1 rounded hover:bg-muted px-1">
                  <button
                    className="flex-1 text-left py-1.5 text-xs truncate"
                    onClick={() => handleLoad(v as { filters: Record<string, unknown>; config: Record<string, unknown> })}
                  >
                    {v.name}
                    {v.visibility === "org" ? (
                      <span className="ml-1 text-muted-foreground">· shared</span>
                    ) : (
                      <span className="ml-1 text-muted-foreground">· private</span>
                    )}
                  </button>
                  {v.isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground flex-shrink-0"
                      onClick={() => handleDelete(v.id)}
                      aria-label={`Delete saved view ${v.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save calendar view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My spring campaign view"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as "private" | "org")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (only me)</SelectItem>
                  <SelectItem value="org">Shared with org</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!name.trim() || createView.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── DayCell ───────────────────────────────────────────────────────────────

interface DayCellProps {
  day: Date;
  groups: TouchGroup[];
  currentMonth: Date;
  density: Density;
  viewMode: ViewMode;
  heatAlpha: number;
  showConflicts: boolean;
  onMoreClick: (day: Date) => void;
  isFocused: boolean;
  isSparklineHovered: boolean;
  onFocus: (day: Date) => void;
  /** Server-computed exact conflict summary for this day; undefined when there are no conflicts. */
  serverDayConflict?: { donorCount: number; campaignCount: number };
}

function DayCell({
  day,
  groups,
  currentMonth,
  density,
  viewMode,
  heatAlpha,
  showConflicts,
  onMoreClick,
  isFocused,
  isSparklineHovered,
  onFocus,
  serverDayConflict,
}: DayCellProps) {
  const today = isToday(day);
  const weekend = isWeekend(day);
  const inMonth = viewMode === "week" ? true : isSameMonth(day, currentMonth);
  const chipLimit = viewMode === "week" ? 999 : density === "compact" ? 5 : 3;
  const visibleGroups = groups.slice(0, chipLimit);
  const extraCount = Math.max(0, groups.length - chipLimit);

  // Day conflict badge data comes directly from the server-computed exact aggregation.
  // The server unions the full donor sets across all in-window touches for this day,
  // so the count is authoritative — no client-side approximation or sample-based heuristic.
  const dayConflictCount = showConflicts ? (serverDayConflict?.donorCount ?? 0) : 0;
  const dayConflictCampaignCount = showConflicts ? (serverDayConflict?.campaignCount ?? 0) : 0;

  return (
    <div
      className={cn(
        "relative flex flex-col border-r border-b border-border select-none outline-none",
        !inMonth && "bg-muted/30",
        weekend && inMonth && "bg-muted/10",
        isFocused && "ring-2 ring-inset ring-primary",
        isSparklineHovered && !isFocused && "ring-1 ring-inset ring-primary/40 bg-primary/5",
        viewMode === "month" ? (density === "compact" ? "min-h-[80px]" : "min-h-[120px]") : "min-h-[200px]",
      )}
      style={heatAlpha > 0 ? { background: `rgba(249,115,22,${heatAlpha})` } : undefined}
      tabIndex={0}
      role="gridcell"
      aria-label={format(day, "EEEE MMMM d yyyy")}
      aria-selected={isFocused}
      onClick={() => onFocus(day)}
      onFocus={() => onFocus(day)}
      onDoubleClick={() => onMoreClick(day)}
    >
      {/* Date number + conflict badge */}
      <div className={cn("flex items-center justify-between px-1.5 pt-1 pb-0.5")}>
        <span
          className={cn(
            "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
            today ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/50" : "text-foreground",
          )}
        >
          {format(day, "d")}
        </span>
        <div className="flex items-center gap-1">
          {dayConflictCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white leading-4 cursor-default">
                  <AlertTriangle className="h-2 w-2" />
                  {fmtCount(dayConflictCount)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                {dayConflictCount} constituent{dayConflictCount !== 1 ? "s" : ""} over threshold
                ({dayConflictCampaignCount} campaign{dayConflictCampaignCount !== 1 ? "s" : ""} involved)
              </TooltipContent>
            </Tooltip>
          )}
          {groups.length > 0 && (
            <span className="text-[9px] text-muted-foreground">{groups.length} touch{groups.length !== 1 ? "es" : ""}</span>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className={cn("flex flex-col gap-0.5 px-1 pb-1 flex-1 overflow-hidden", density === "compact" ? "gap-px" : "gap-0.5")}>
        {visibleGroups.map((g) => (
          <TouchChip
            key={`${g.campaignId}-${g.sendDate}`}
            group={g}
            density={density}
            showConflicts={showConflicts}
          />
        ))}
        {extraCount > 0 && (
          <button
            className="mt-0.5 text-left text-[10px] text-primary hover:underline px-0.5"
            onClick={(e) => { e.stopPropagation(); onMoreClick(day); }}
            aria-label={`Show ${extraCount} more touches on ${format(day, "MMM d")}`}
          >
            +{extraCount} more
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DayDetailSheet ────────────────────────────────────────────────────────

interface DayDetailSheetProps {
  day: Date | null;
  groups: TouchGroup[];
  showConflicts: boolean;
  onClose: () => void;
  /**
   * Server-authoritative conflict data for this day. When present, the detail
   * sheet reads per-campaign donor counts and breakdowns from here instead of
   * reconstructing them client-side from capped samples.
   */
  dayConflict?: {
    donorCount: number;
    campaignCount: number;
    byCampaign: Record<string, {
      donorCount: number;
      donorSample: string[];
      overflow: number;
      touchBreakdown: Array<{ touchId: number; touchName: string; donorCount: number }>;
      donorTouchIds?: Record<string, number[]>;
    }>;
  };
}

function DayDetailSheet({ day, groups, showConflicts, onClose, dayConflict }: DayDetailSheetProps) {
  const totalAudience = useMemo(() =>
    groups.flatMap((g) => g.touches).reduce((s, t) => s + t.audienceCount, 0),
    [groups],
  );

  // Build the conflicts section from the server-authoritative byCampaign data.
  // This replaces the previous client-side reconstruction from per-touch samples,
  // which produced inaccurate totals when donors appeared in multiple touches.
  const conflictSections = useMemo(() => {
    if (!showConflicts || !dayConflict) return [];
    // Only include campaigns that have touches rendered in the sheet today
    const campaignIdsInGroups = new Set(groups.map((g) => g.campaignId));
    return Object.entries(dayConflict.byCampaign)
      .filter(([campaignIdStr]) => campaignIdsInGroups.has(Number(campaignIdStr)))
      .map(([campaignIdStr, campData]) => {
        const campaignId = Number(campaignIdStr);
        const group = groups.find((g) => g.campaignId === campaignId);
        // Build donor→touchName mapping from server-supplied donorTouchIds
        const touchIdToName = Object.fromEntries(
          campData.touchBreakdown.map((tb) => [tb.touchId, tb.touchName])
        );
        const donorEntries = campData.donorSample.map((donorId) => ({
          donorId,
          touchNames: (campData.donorTouchIds?.[donorId] ?? []).map(
            (tid) => touchIdToName[tid] ?? String(tid)
          ),
        }));
        return {
          campaignId,
          campaignName: group?.campaignName ?? String(campaignId),
          totalCount: campData.donorCount,
          donorEntries,
          overflow: campData.overflow,
          touchBreakdown: campData.touchBreakdown,
        };
      })
      .filter((cs) => cs.totalCount > 0);
  }, [dayConflict, groups, showConflicts]);

  return (
    <Sheet open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {day ? format(day, "EEEE, MMMM d, yyyy") : ""}
          </SheetTitle>
          {groups.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {groups.length} campaign touch{groups.length !== 1 ? "es" : ""} ·{" "}
              {fmtCount(totalAudience)} total recipients
            </p>
          )}
        </SheetHeader>

        {/* Conflicts section — data sourced from server-authoritative byCampaign breakdown */}
        {conflictSections.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Threshold conflicts on this day
            </div>
            {conflictSections.map((cs) => (
              <div key={cs.campaignId} className="text-xs">
                <div className="font-medium text-red-800 truncate">{cs.campaignName}</div>
                <div className="text-red-600 mb-1.5">
                  {cs.totalCount} constituent{cs.totalCount !== 1 ? "s" : ""} over threshold on this day
                </div>
                {/* Per-touch counts (server-authoritative, exact per-touch donor sets) */}
                {cs.touchBreakdown.length > 0 && (
                  <div className="space-y-0.5 mb-1.5">
                    {cs.touchBreakdown.map((tb) => (
                      <div key={tb.touchId} className="flex items-center justify-between gap-1.5">
                        <span className="text-red-700 truncate">{tb.touchName}</span>
                        <span className="text-red-500 flex-shrink-0">{tb.donorCount} conflict{tb.donorCount !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Per-donor attribution: donor ID + which touches caused their breach */}
                <div className="space-y-0.5 max-h-28 overflow-y-auto">
                  {cs.donorEntries.map(({ donorId, touchNames }) => (
                    <div key={donorId} className="flex items-start gap-1.5">
                      <span className="rounded bg-red-100 px-1 py-0.5 font-mono text-[10px] text-red-800 flex-shrink-0">
                        {donorId}
                      </span>
                      {touchNames.length > 0 && (
                        <span className="text-red-600 text-[10px] leading-tight">{touchNames.join(", ")}</span>
                      )}
                    </div>
                  ))}
                  {cs.overflow > 0 && (
                    <div className="text-[10px] text-red-500 italic">+{cs.overflow} more</div>
                  )}
                </div>
                <Link to={`/campaigns/${cs.campaignId}`} className="text-[10px] text-red-600 hover:underline mt-1.5 block">
                  Resolve in campaign →
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 mb-2 opacity-30" />
              No touches on this day
            </div>
          ) : (
            groups.map((g) => {
              const palette = paletteFor(g.channelId);
              const hasConflict = showConflicts && g.campaignConflictDonorCount > 0;
              return (
                <div key={`${g.campaignId}`} className={cn("border rounded-lg p-3", hasConflict && "border-red-200")}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className={cn("mt-0.5 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0", palette.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{g.campaignName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{g.channelLabel}</span>
                        <StatusPill status={g.campaignStatus} />
                        {hasConflict && (
                          <span className="text-[10px] text-red-600 font-medium">
                            {g.campaignConflictDonorCount} conflict{g.campaignConflictDonorCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link to={`/campaigns/${g.campaignId}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0">
                        Open
                      </Button>
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {g.touches.map((t) => (
                      <div key={t.touchId} className={cn(
                        "rounded px-2 py-1.5 text-xs border",
                        palette.bg, palette.border,
                        g.campaignStatus === "draft" && "border-dashed",
                        showConflicts && t.conflictDonorCount > 0 && "border-l-2 border-l-red-500",
                      )}>
                        <div className="font-medium">{t.touchName}</div>
                        <div className="flex items-center justify-between mt-0.5 text-muted-foreground">
                          <span>{t.campaignTypeLabel}</span>
                          <span>{fmtCount(t.audienceCount)} recipients</span>
                        </div>
                        {showConflicts && t.conflictDonorCount > 0 && (
                          <div className="text-[10px] text-red-600 mt-0.5">
                            {t.conflictDonorCount} over threshold
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── ActiveFilterChips ─────────────────────────────────────────────────────

interface ActiveFilterChipsProps {
  filters: CalendarFilters;
  channels: { id: number; name: string }[];
  owningUnits: { name: string }[];
  campaignTypes: { id: number; name: string }[];
  onChange: (filters: CalendarFilters) => void;
}

function ActiveFilterChips({ filters, channels, campaignTypes, onChange }: ActiveFilterChipsProps) {
  const chips: { label: string; remove: () => void }[] = [];

  if (filters.owningUnit) {
    chips.push({
      label: `Unit: ${filters.owningUnit}`,
      remove: () => onChange({ ...filters, owningUnit: "" }),
    });
  }
  for (const id of filters.channelIds) {
    const ch = channels.find((c) => c.id === id);
    chips.push({
      label: `Channel: ${ch?.name ?? id}`,
      remove: () => onChange({ ...filters, channelIds: filters.channelIds.filter((x) => x !== id) }),
    });
  }
  for (const id of filters.campaignTypeIds) {
    const ct = campaignTypes.find((c) => c.id === id);
    chips.push({
      label: `Type: ${ct?.name ?? id}`,
      remove: () => onChange({ ...filters, campaignTypeIds: filters.campaignTypeIds.filter((x) => x !== id) }),
    });
  }
  const hiddenStatuses = ALL_STATUSES.filter((s) => !filters.statuses.includes(s));
  for (const st of hiddenStatuses) {
    chips.push({
      label: `Hiding: ${st}`,
      remove: () => onChange({ ...filters, statuses: [...filters.statuses, st] }),
    });
  }
  if (filters.mine) {
    chips.push({ label: "Mine only", remove: () => onChange({ ...filters, mine: false }) });
  }
  if (filters.nameContains) {
    chips.push({
      label: `"${filters.nameContains}"`,
      remove: () => onChange({ ...filters, nameContains: "" }),
    });
  }

  if (chips.length === 0) return null;

  function clearAll() {
    onChange({
      owningUnit: "",
      channelIds: [],
      campaignTypeIds: [],
      statuses: [...DEFAULT_STATUSES],
      mine: false,
      nameContains: "",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 border-b bg-background print:hidden">
      {chips.map((chip) => (
        <Badge
          key={chip.label}
          variant="secondary"
          className="flex items-center gap-1 cursor-pointer h-6 text-xs pr-1"
        >
          {chip.label}
          <button
            onClick={chip.remove}
            className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
            aria-label={`Remove filter ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground"
        onClick={clearAll}
      >
        Clear all
      </Button>
    </div>
  );
}

// ─── CalendarPage ──────────────────────────────────────────────────────────

const DEFAULT_FILTERS: CalendarFilters = {
  owningUnit: "",
  channelIds: [],
  campaignTypeIds: [],
  statuses: [...DEFAULT_STATUSES],
  mine: false,
  nameContains: "",
};

export default function CalendarPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();
  const { data: channels = [] } = useListChannels();
  const { data: owningUnits = [] } = useListOwningUnits();
  const { data: campaignTypes = [] } = useListCampaignTypes();

  // ── Preferences hydration ─────────────────────────────────────────────────
  const { data: savedPrefs } = useGetCalendarPreferences();
  const putPrefs = usePutCalendarPreferences();
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Parse initial state from URL — URL takes priority over saved prefs
  const initial = useMemo(() => parseUrlState(window.location.search), []);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.viewMode);
  const [anchor, setAnchor] = useState<Date>(initial.anchor);
  const [filters, setFilters] = useState<CalendarFilters>(initial.filters);
  const [density, setDensity] = useState<Density>(initial.density);
  const [showConflicts, setShowConflicts] = useState(true);
  const [detailDay, setDetailDay] = useState<Date | null>(null);
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);
  /** Day hovered in the sparkline strip — used to highlight the matching grid cell */
  const [sparklineHoverDay, setSparklineHoverDay] = useState<Date | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const nameSearchRef = useRef<HTMLInputElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  // Apply saved preferences once loaded (only if URL had no explicit state)
  useEffect(() => {
    if (prefsLoaded || !savedPrefs) return;
    setPrefsLoaded(true);
    const hasUrlState = window.location.search.length > 1;
    if (hasUrlState) return; // URL beats prefs
    const f = savedPrefs.filters as Partial<CalendarFilters>;
    if (Object.keys(f).length > 0) {
      setFilters({
        owningUnit: (f.owningUnit as string) ?? "",
        channelIds: (f.channelIds as number[]) ?? [],
        campaignTypeIds: (f.campaignTypeIds as number[]) ?? [],
        statuses: (f.statuses as string[]) ?? [...DEFAULT_STATUSES],
        mine: !!(f.mine),
        nameContains: (f.nameContains as string) ?? "",
      });
    }
    const c = savedPrefs.config as { view?: string; density?: string };
    if (c.view === "week") setViewMode("week");
    if (c.density === "compact") setDensity("compact");
  }, [savedPrefs, prefsLoaded]);

  // Debounced save of preferences on change
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!prefsLoaded) return;
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
    prefsSaveTimer.current = setTimeout(() => {
      putPrefs.mutate({
        data: {
          filters: filters as unknown as Record<string, unknown>,
          config: { view: viewMode, density } as Record<string, unknown>,
        },
      });
    }, PREFS_DEBOUNCE_MS);
    return () => { if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current); };
  }, [filters, viewMode, density, prefsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL on state changes
  useEffect(() => {
    const newUrl = buildUrl(viewMode, anchor, filters, density);
    if (window.location.pathname + window.location.search !== newUrl) {
      navigate(newUrl, { replace: true });
    }
  }, [viewMode, anchor, filters, density, navigate]);

  // Grid date range
  const { gridStart, gridEnd } = useMemo(() => gridRange(viewMode, anchor), [viewMode, anchor]);
  const gridDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  // API query — staleTime=5min so paging back to a cached range is instant
  const feedParams = useMemo(
    () => buildCalendarFeedParams(gridStart, gridEnd, filters),
    [gridStart, gridEnd, filters],
  );

  const { data: feed, isLoading, isError, error } = useGetCalendarFeed(feedParams, {
    query: {
      queryKey: getGetCalendarFeedQueryKey(feedParams),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  });

  // ── Adjacent range prefetch ───────────────────────────────────────────────
  useEffect(() => {
    const prevRange = gridRange(viewMode, viewMode === "month" ? subMonths(anchor, 1) : subWeeks(anchor, 1));
    const nextRange = gridRange(viewMode, viewMode === "month" ? addMonths(anchor, 1) : addWeeks(anchor, 1));
    const toFetch = [prevRange, nextRange];
    for (const r of toFetch) {
      const params = buildCalendarFeedParams(r.gridStart, r.gridEnd, filters);
      const opts = getGetCalendarFeedQueryOptions(params, {
        query: {
          queryKey: getGetCalendarFeedQueryKey(params),
          staleTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
      });
      queryClient.prefetchQuery(opts);
    }
  }, [anchor, viewMode, filters, queryClient]);

  // Rehydrate touches with campaign metadata
  const richTouches = useMemo(
    () => rehydrateTouches((feed?.touches ?? []) as ApiTouch[], feed?.campaigns ?? {}),
    [feed],
  );
  const groupedByDay = useMemo(() => groupTouches(richTouches), [richTouches]);
  const dayVolumes = useMemo(() => feed?.dayVolumes ?? {}, [feed]);

  // Heat tint: max total audience across all days in the grid
  const heatMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of gridDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const groups = groupedByDay.get(dateStr) ?? [];
      const total = groups.flatMap((g) => g.touches).reduce((s, t) => s + t.audienceCount, 0);
      map.set(dateStr, total);
    }
    return map;
  }, [gridDays, groupedByDay]);

  const maxHeat = useMemo(() => Math.max(0, ...heatMap.values()), [heatMap]);

  // Navigation
  function goToday() { setAnchor(new Date()); }
  function goPrev() {
    setAnchor((a) => viewMode === "month" ? subMonths(a, 1) : subWeeks(a, 1));
  }
  function goNext() {
    setAnchor((a) => viewMode === "month" ? addMonths(a, 1) : addWeeks(a, 1));
  }

  function jumpToDate(date: Date) {
    setAnchor(date);
    setFocusedDay(date);
  }

  const title = viewMode === "month"
    ? format(anchor, "MMMM yyyy")
    : `${format(gridStart, "MMM d")} – ${format(gridEnd, "MMM d, yyyy")}`;

  // Channel options for multi-select
  const channelOptions = useMemo(
    () => (channels as { id: number; name: string }[]).map((c) => ({ value: String(c.id), label: c.name })),
    [channels],
  );
  const campaignTypeOptions = useMemo(
    () => (campaignTypes as { id: number; name: string }[]).map((c) => ({ value: String(c.id), label: c.name })),
    [campaignTypes],
  );
  const statusOptions = useMemo(
    () => ALL_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
    [],
  );
  const owningUnitOptions = useMemo(
    () => (owningUnits as { name: string }[]).map((u) => u.name),
    [owningUnits],
  );

  // Quick filters
  const hideDraftsActive = !filters.statuses.includes("draft");
  function toggleHideDrafts() {
    if (hideDraftsActive) {
      setFilters((f) => ({ ...f, statuses: [...f.statuses, "draft"] }));
    } else {
      setFilters((f) => ({ ...f, statuses: f.statuses.filter((s) => s !== "draft") }));
    }
  }

  const emailChannelIds = useMemo(
    () => (channels as { id: number; name: string }[]).filter((c) => c.name.toLowerCase().includes("email")).map((c) => c.id),
    [channels],
  );
  const emailOnlyActive = emailChannelIds.length > 0 &&
    filters.channelIds.length === emailChannelIds.length &&
    emailChannelIds.every((id) => filters.channelIds.includes(id));

  function toggleEmailOnly() {
    if (emailOnlyActive) {
      setFilters((f) => ({ ...f, channelIds: [] }));
    } else if (emailChannelIds.length === 0) {
      toast({ title: "No email channels found", description: "No channels contain 'email' in their name.", variant: "destructive" });
    } else {
      setFilters((f) => ({ ...f, channelIds: emailChannelIds }));
    }
  }

  // Copy link
  function copyLink() {
    const url = window.location.origin + buildUrl(viewMode, anchor, filters, density);
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied to clipboard" });
    }).catch(() => {
      toast({ title: "Could not copy", variant: "destructive" });
    });
  }

  // Reset prefs to defaults
  function resetToDefaults() {
    setFilters({ ...DEFAULT_FILTERS });
    setDensity("comfortable");
    setViewMode("month");
    setAnchor(new Date());
    putPrefs.mutate({ data: { filters: {}, config: {} } });
  }

  // Keyboard navigation
  useEffect(() => {
    function isTyping(e: KeyboardEvent) {
      const t = e.target;
      return (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.contentEditable === "true")
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && !e.shiftKey && !isTyping(e)) {
        setFocusedDay((d) => d ? new Date(d.getTime() - 86400000) : new Date());
        e.preventDefault();
      } else if (e.key === "ArrowRight" && !e.shiftKey && !isTyping(e)) {
        setFocusedDay((d) => d ? new Date(d.getTime() + 86400000) : new Date());
        e.preventDefault();
      } else if (e.key === "ArrowUp" && !e.shiftKey && !isTyping(e)) {
        setFocusedDay((d) => d ? new Date(d.getTime() - 7 * 86400000) : new Date());
        e.preventDefault();
      } else if (e.key === "ArrowDown" && !e.shiftKey && !isTyping(e)) {
        setFocusedDay((d) => d ? new Date(d.getTime() + 7 * 86400000) : new Date());
        e.preventDefault();
      } else if (e.key === "Enter" && focusedDay && !isTyping(e)) {
        setDetailDay(focusedDay);
        e.preventDefault();
      } else if (e.key === "Escape") {
        setDetailDay(null);
        setShortcutHelpOpen(false);
        e.preventDefault();
      } else if (!isTyping(e)) {
        switch (e.key.toLowerCase()) {
          case "t": goToday(); break;
          case "m": setViewMode("month"); break;
          case "w": setViewMode("week"); break;
          case "/":
            e.preventDefault();
            nameSearchRef.current?.focus();
            break;
          case "j":
            e.preventDefault();
            jumpInputRef.current?.focus();
            break;
          case "?":
            setShortcutHelpOpen((v) => !v);
            break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-navigate anchor when focused day moves out of visible range
  useEffect(() => {
    if (!focusedDay) return;
    const focusStr = format(focusedDay, "yyyy-MM-dd");
    const gridStrs = gridDays.map((d) => format(d, "yyyy-MM-dd"));
    if (!gridStrs.includes(focusStr)) {
      setAnchor(focusedDay);
    }
  }, [focusedDay, gridDays]);

  const handleMoreClick = useCallback((day: Date) => setDetailDay(day), []);

  const detailGroups = useMemo(() => {
    if (!detailDay) return [];
    return groupedByDay.get(format(detailDay, "yyyy-MM-dd")) ?? [];
  }, [detailDay, groupedByDay]);

  const handleSavedViewLoad = useCallback((f: CalendarFilters, d: Density) => {
    setFilters(f);
    setDensity(d);
  }, []);

  const isDraftHidden = !filters.statuses.includes("draft");
  const hasActiveFilters =
    !!filters.owningUnit ||
    filters.channelIds.length > 0 ||
    filters.campaignTypeIds.length > 0 ||
    filters.statuses.length !== ALL_STATUSES.length ||
    filters.mine ||
    !!filters.nameContains;

  const touchCount = richTouches.length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full overflow-hidden print:h-auto">
        {/* ── Print stylesheet ────────────────────────────────────────── */}
        <style>{`
          @media print {
            nav, aside, header, .print\\:hidden { display: none !important; }
            .print\\:block { display: block !important; }
            body { background: white; }
            [data-calendar-grid] { page-break-inside: avoid; }
            [role="gridcell"] { min-height: 80px !important; break-inside: avoid; }
          }
        `}</style>

        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b bg-background print:hidden">
          {/* Row 1: View toggle, navigation, title, actions */}
          <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button
                variant={viewMode === "month" ? "default" : "ghost"}
                size="sm"
                className="h-8 rounded-none px-3 text-xs"
                onClick={() => setViewMode("month")}
                aria-pressed={viewMode === "month"}
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                Month
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                className="h-8 rounded-none px-3 text-xs"
                onClick={() => setViewMode("week")}
                aria-pressed={viewMode === "week"}
              >
                <AlignJustify className="h-3.5 w-3.5 mr-1" />
                Week
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={goToday}>
                Today
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Title */}
            <span className="font-semibold text-sm min-w-[160px]">{title}</span>

            {/* Touch count */}
            {!isLoading && !isError && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {touchCount} touch{touchCount !== 1 ? "es" : ""}
              </span>
            )}

            <div className="flex-1" />

            {/* Conflicts toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showConflicts ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 text-xs",
                    showConflicts ? "text-red-700 bg-red-50 hover:bg-red-100 border border-red-200" : "text-muted-foreground",
                  )}
                  onClick={() => setShowConflicts((v) => !v)}
                  aria-pressed={showConflicts}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Conflicts
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showConflicts ? "Hide" : "Show"} threshold conflict indicators
              </TooltipContent>
            </Tooltip>

            {/* Jump to date */}
            <JumpToDateInput inputRef={jumpInputRef} onJump={jumpToDate} />

            {/* Density toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                  onClick={() => setDensity((d) => d === "comfortable" ? "compact" : "comfortable")}
                  aria-label={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {density === "comfortable" ? "Comfortable" : "Compact"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Toggle density (comfortable / compact)</TooltipContent>
            </Tooltip>

            {/* Copy link */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                  onClick={copyLink}
                  aria-label="Copy link to this view"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Copy link</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy link to this view</TooltipContent>
            </Tooltip>

            {/* Saved views */}
            <SavedViewsPanel filters={filters} density={density} onLoad={handleSavedViewLoad} />

            {/* Legend */}
            <LegendPopover channels={channels as { id: number; name: string }[]} />

            {/* Shortcut help */}
            <ShortcutHelpPopover open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
          </div>

          {/* Row 2: Quick-filter chips + multi-select filters + name search */}
          <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
            {/* Quick filter chips */}
            {me && (
              <button
                onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border cursor-pointer select-none transition-colors",
                  filters.mine
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary",
                )}
                aria-pressed={filters.mine}
              >
                Mine
              </button>
            )}

            <button
              onClick={toggleHideDrafts}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border cursor-pointer select-none transition-colors",
                isDraftHidden
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary",
              )}
              aria-pressed={isDraftHidden}
            >
              Hide drafts
            </button>

            {emailChannelIds.length > 0 && (
              <button
                onClick={toggleEmailOnly}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border cursor-pointer select-none transition-colors",
                  emailOnlyActive
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary",
                )}
                aria-pressed={emailOnlyActive}
              >
                Email only
              </button>
            )}

            <Separator orientation="vertical" className="h-5 hidden sm:inline-block" />

            {/* Owning Unit */}
            {owningUnitOptions.length > 0 && (
              <Select
                value={filters.owningUnit || "__all__"}
                onValueChange={(v) => setFilters((f) => ({ ...f, owningUnit: v === "__all__" ? "" : v }))}
              >
                <SelectTrigger className={cn(
                  "h-8 text-xs w-[160px]",
                  filters.owningUnit && "border-primary text-primary",
                )}>
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Owning Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All units</SelectItem>
                  {owningUnitOptions.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Channel multi-select */}
            <MultiSelectFilter
              label="Channel"
              options={channelOptions}
              selected={filters.channelIds.map(String)}
              onChange={(vals) => setFilters((f) => ({ ...f, channelIds: vals.map(Number) }))}
            />

            {/* Campaign type multi-select */}
            <MultiSelectFilter
              label="Type"
              options={campaignTypeOptions}
              selected={filters.campaignTypeIds.map(String)}
              onChange={(vals) => setFilters((f) => ({ ...f, campaignTypeIds: vals.map(Number) }))}
            />

            {/* Status multi-select */}
            <MultiSelectFilter
              label="Status"
              options={statusOptions}
              selected={filters.statuses}
              onChange={(vals) => setFilters((f) => ({ ...f, statuses: vals.length ? vals : [...ALL_STATUSES] }))}
            />

            {/* Name search */}
            <div className="relative">
              <Input
                ref={nameSearchRef}
                value={filters.nameContains}
                onChange={(e) => setFilters((f) => ({ ...f, nameContains: e.target.value }))}
                placeholder="Search by name…"
                className="h-8 text-xs w-[180px] pl-2"
                aria-label="Filter by campaign name"
              />
              {filters.nameContains && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setFilters((f) => ({ ...f, nameContains: "" }))}
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Reset to defaults */}
            {hasActiveFilters && (
              <button
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
                onClick={resetToDefaults}
              >
                Reset to defaults
              </button>
            )}
          </div>
        </div>

        <CalendarPublishingPanel />

        {/* ── Active filter chips ────────────────────────────────────── */}
        {hasActiveFilters && (
          <ActiveFilterChips
            filters={filters}
            channels={channels as { id: number; name: string }[]}
            owningUnits={owningUnits as { name: string }[]}
            campaignTypes={campaignTypes as { id: number; name: string }[]}
            onChange={setFilters}
          />
        )}

        {/* ── Error state ───────────────────────────────────────────── */}
        {isError && (
          <div className="mx-4 mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive print:hidden">
            Could not load calendar data. {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ""}
          </div>
        )}

        {/* ── Grid area ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto" ref={gridRef}>
          {/* Weekday header (sticky) + sparkline strip */}
          <div className="sticky top-0 z-10 bg-background">
            <div
              className="grid grid-cols-7 border-b"
              role="row"
              aria-label="Week days"
            >
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="px-2 py-1 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0"
                  role="columnheader"
                >
                  {wd}
                </div>
              ))}
            </div>
            {/* Sparkline strip — aligned to 7-column grid */}
            <SparklineStrip
              gridDays={gridDays}
              dayVolumes={dayVolumes as Record<string, number>}
              onDayClick={(day) => { setFocusedDay(day); setDetailDay(day); }}
              focusedDay={focusedDay}
              onHoverDay={setSparklineHoverDay}
            />
          </div>

          {/* Calendar grid */}
          {isLoading && richTouches.length === 0 ? (
            <div className="grid grid-cols-7 flex-1">
              {gridDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-r border-b",
                    viewMode === "month" ? "min-h-[120px]" : "min-h-[200px]",
                  )}
                >
                  <div className="px-1.5 pt-1 text-xs font-medium w-5 h-5 m-1 rounded-full bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-7"
              role="grid"
              aria-label={title}
              data-calendar-grid
            >
              {gridDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const groups = groupedByDay.get(dateStr) ?? [];
                const rawHeat = maxHeat > 0 ? (heatMap.get(dateStr) ?? 0) / maxHeat : 0;
                const heatAlpha = rawHeat * 0.25;
                return (
                  <DayCell
                    key={dateStr}
                    day={day}
                    groups={groups}
                    currentMonth={anchor}
                    density={density}
                    viewMode={viewMode}
                    heatAlpha={heatAlpha}
                    showConflicts={showConflicts}
                    onMoreClick={handleMoreClick}
                    isFocused={focusedDay !== null && isSameDay(day, focusedDay)}
                    isSparklineHovered={sparklineHoverDay !== null && isSameDay(day, sparklineHoverDay)}
                    onFocus={setFocusedDay}
                    serverDayConflict={feed?.dayConflicts?.[dateStr]}
                  />
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && richTouches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground print:hidden">
              <CalendarDays className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No touches in this period</p>
              <p className="text-xs mt-1">
                {hasActiveFilters ? "Try adjusting your filters." : "No planned touches found for this date range."}
              </p>
            </div>
          )}
        </div>

        {/* ── Keyboard shortcuts hint (bottom bar) ─────────────────── */}
        <div className="flex-shrink-0 border-t bg-muted/30 px-4 py-1 text-[10px] text-muted-foreground flex gap-3 print:hidden">
          <span><kbd className="rounded bg-muted px-1 font-mono">←↑↓→</kbd> Navigate</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">Enter</kbd> Day detail</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">Esc</kbd> Close</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">T</kbd> Today</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">M</kbd> Month</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">W</kbd> Week</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">/</kbd> Search</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">J</kbd> Jump</span>
          <span><kbd className="rounded bg-muted px-1 font-mono">?</kbd> Shortcuts</span>
        </div>

        {/* ── Day detail sheet ──────────────────────────────────────── */}
        <DayDetailSheet
          day={detailDay}
          groups={detailGroups}
          showConflicts={showConflicts}
          onClose={() => setDetailDay(null)}
          dayConflict={detailDay ? feed?.dayConflicts?.[format(detailDay, "yyyy-MM-dd")] : undefined}
        />
      </div>
    </TooltipProvider>
  );
}
