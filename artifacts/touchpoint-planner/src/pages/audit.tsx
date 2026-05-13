import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetAuditLog,
  useListUsers,
  useListCampaigns,
  getExportAuditLogCsvUrl,
  type GetAuditLogParams,
  type ExportAuditLogCsvParams,
  type AuditEntry,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Sparkles, CalendarClock, Download, Loader2, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const AUDIT_ACTIONS = [
  "acknowledge_pii",
  "ai_audience_summary",
  "ai_classify_reason",
  "ai_suggest_cadence",
  "ai_suggest_date_shifts",
  "apply_threshold_templates",
  "archive_campaign",
  "campaign_cloned",
  "change_own_password",
  "clear_touch_audience",
  "create_campaign",
  "create_campaign_type",
  "create_channel",
  "create_owning_unit",
  "create_saved_report_view",
  "create_seed_group",
  "create_suppression",
  "create_suppression_reason",
  "create_threshold",
  "create_threshold_template",
  "create_touch",
  "create_user",
  "delete_campaign",
  "delete_seed_group",
  "delete_suppression",
  "delete_threshold",
  "delete_threshold_template",
  "delete_touch",
  "delete_user",
  "export_campaign",
  "finalize_campaign",
  "recovery_code_used",
  "recovery_codes_regenerated",
  "resend_invite",
  "reset_password",
  "retention_delete",
  "self_service_password_reset_requested",
  "set_overrides",
  "totp_disabled",
  "totp_enrolled",
  "totp_reset",
  "totp_used",
  "touch_date_manual_undone",
  "touch_date_shift_applied",
  "touch_date_shift_undone",
  "update_campaign",
  "update_campaign_type",
  "update_channel",
  "update_owning_unit",
  "update_settings",
  "update_suppression_reason",
  "update_threshold",
  "update_threshold_template",
  "update_touch",
  "update_user",
  "upload_audience",
  "upload_touch_audience",
  "void_campaign",
] as const;

const AI_DATE_SHIFT_ACTION = "touch_date_shift_applied";
const UPDATE_TOUCH_ACTION = "update_touch";

const PAGE_SIZE = 50;
const MAX_EXPORT_ROWS = 50_000;

interface AuditFilters {
  actorId?: number;
  actions?: string[];
  campaignId?: number;
  targetUserId?: number;
  from?: string;
  to?: string;
  q?: string;
}

function readInitialFilters(): AuditFilters {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const f: AuditFilters = {};
  const actor = sp.get("actorId");
  if (actor && /^\d+$/.test(actor)) f.actorId = Number(actor);
  const camp = sp.get("campaignId");
  if (camp && /^\d+$/.test(camp)) f.campaignId = Number(camp);
  const tgt = sp.get("targetUserId");
  if (tgt && /^\d+$/.test(tgt)) f.targetUserId = Number(tgt);
  const from = sp.get("from");
  if (from) f.from = from;
  const to = sp.get("to");
  if (to) f.to = to;
  const q = sp.get("q");
  if (q) f.q = q;
  const actions = sp.getAll("action").filter(Boolean);
  if (actions.length) f.actions = actions;
  return f;
}

function filtersHaveAny(f: AuditFilters): boolean {
  return !!(
    f.actorId !== undefined ||
    f.campaignId !== undefined ||
    f.targetUserId !== undefined ||
    f.from ||
    f.to ||
    f.q ||
    (f.actions && f.actions.length)
  );
}

function toApiParams(f: AuditFilters): GetAuditLogParams {
  const p: GetAuditLogParams = { limit: PAGE_SIZE };
  if (f.actorId !== undefined) p.actorId = f.actorId;
  if (f.actions && f.actions.length) p.action = f.actions;
  if (f.campaignId !== undefined) p.campaignId = f.campaignId;
  if (f.targetUserId !== undefined) p.targetUserId = f.targetUserId;
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.q) p.q = f.q;
  return p;
}

function toExportParams(f: AuditFilters): ExportAuditLogCsvParams {
  const { ...rest } = toApiParams(f);
  delete (rest as { limit?: number; cursor?: string }).limit;
  delete (rest as { limit?: number; cursor?: string }).cursor;
  return rest;
}

type DateShift = { source: string | null; from: string | null; to: string | null };

function parseDateShiftDetails(details: string | null | undefined): DateShift | null {
  if (!details) return null;
  const parts = details.split(/\s+/);
  const out: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq > 0) out[p.slice(0, eq)] = p.slice(eq + 1);
  }
  if (!out.from && !out.to && !out.source) return null;
  return {
    source: out.source ?? null,
    from: out.from ?? null,
    to: out.to ?? null,
  };
}

function getDateChange(action: string, details: string | null | undefined): DateShift | null {
  if (action === AI_DATE_SHIFT_ACTION) return parseDateShiftDetails(details);
  if (action === UPDATE_TOUCH_ACTION) {
    const shift = parseDateShiftDetails(details);
    if (shift && shift.source === "manual_edit" && (shift.from || shift.to)) return shift;
  }
  return null;
}

function ActionMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const toggle = (a: string) => {
    if (value.includes(a)) onChange(value.filter((x) => x !== a));
    else onChange([...value, a]);
  };
  const label =
    value.length === 0
      ? "Any action"
      : value.length === 1
        ? value[0]
        : `${value.length} actions`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-[220px] justify-between font-normal"
          aria-label="Filter by action"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 ml-1 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{value.length} selected</span>
          {value.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange([])} className="h-6 text-xs">
              Clear
            </Button>
          )}
        </div>
        <ScrollArea className="h-72">
          <div className="p-2 space-y-1">
            {AUDIT_ACTIONS.map((a) => (
              <label
                key={a}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox checked={value.includes(a)} onCheckedChange={() => toggle(a)} />
                <span className="font-mono text-xs">{a}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function Audit() {
  const initial = useRef(readInitialFilters()).current;
  const [filters, setFilters] = useState<AuditFilters>(initial);
  const [dateChangeOnly, setDateChangeOnly] = useState(false);
  const [pages, setPages] = useState<AuditEntry[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  // Sync filters to URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams();
    if (filters.actorId !== undefined) sp.set("actorId", String(filters.actorId));
    if (filters.campaignId !== undefined) sp.set("campaignId", String(filters.campaignId));
    if (filters.targetUserId !== undefined) sp.set("targetUserId", String(filters.targetUserId));
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);
    if (filters.q) sp.set("q", filters.q);
    for (const a of filters.actions ?? []) sp.append("action", a);
    const qs = sp.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [filters]);

  // Reset pagination whenever filters change.
  useEffect(() => {
    setPages([]);
    setCursor(null);
  }, [filters]);

  const apiParams = useMemo(() => toApiParams(filters), [filters]);
  const { data: firstPage, isLoading } = useGetAuditLog(apiParams);

  const allRows = useMemo<AuditEntry[]>(() => {
    const first = firstPage?.items ?? [];
    return [...first, ...pages.flat()];
  }, [firstPage, pages]);

  const visibleRows = useMemo(() => {
    if (!dateChangeOnly) return allRows;
    return allRows.filter((log) => getDateChange(log.action, log.details) !== null);
  }, [allRows, dateChangeOnly]);

  const totalCount = firstPage?.totalCount ?? 0;
  const hasMore = pages.length === 0 ? !!firstPage?.nextCursor : !!cursor;

  const onLoadMore = async () => {
    const next = pages.length === 0 ? firstPage?.nextCursor : cursor;
    if (!next) return;
    setLoadingMore(true);
    try {
      const url = new URL(window.location.origin + "/api/audit-log");
      const sp = new URLSearchParams();
      if (filters.actorId !== undefined) sp.set("actorId", String(filters.actorId));
      if (filters.campaignId !== undefined) sp.set("campaignId", String(filters.campaignId));
      if (filters.targetUserId !== undefined) sp.set("targetUserId", String(filters.targetUserId));
      if (filters.from) sp.set("from", filters.from);
      if (filters.to) sp.set("to", filters.to);
      if (filters.q) sp.set("q", filters.q);
      for (const a of filters.actions ?? []) sp.append("action", a);
      sp.set("limit", String(PAGE_SIZE));
      sp.set("cursor", next);
      url.search = sp.toString();
      const r = await fetch(url.toString(), { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { items: AuditEntry[]; nextCursor: string | null };
      setPages((prev) => [...prev, body.items]);
      setCursor(body.nextCursor);
    } catch (e) {
      toast({
        title: "Failed to load more",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const onDownloadCsv = async () => {
    setExporting(true);
    try {
      const url = getExportAuditLogCsvUrl(toExportParams(filters));
      const r = await fetch(url, { credentials: "include" });
      if (r.status === 413) {
        const body = await r.json().catch(() => null);
        toast({
          title: "Filter too broad to export",
          description:
            body?.error ??
            `The current filter matches more than ${MAX_EXPORT_ROWS.toLocaleString()} rows. Narrow the filter and try again.`,
          variant: "destructive",
        });
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dl;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `audit-log-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dl);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  // Lookup data for filter dropdowns. Both endpoints are admin-accessible.
  const { data: users } = useListUsers();
  const { data: campaigns } = useListCampaigns();

  const aiFilterActive = (filters.actions ?? []).length === 1 && filters.actions?.[0] === AI_DATE_SHIFT_ACTION;
  const exportTooLarge = totalCount > MAX_EXPORT_ROWS;
  const exportDisabled = exporting || allRows.length === 0 || exportTooLarge;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground text-sm">System-wide record of critical actions.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadCsv}
          disabled={exportDisabled}
          title={
            exportTooLarge
              ? `Filter matches ${totalCount.toLocaleString()} rows; cap is ${MAX_EXPORT_ROWS.toLocaleString()}.`
              : "Download the current filter set as CSV"
          }
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Download CSV
        </Button>
      </div>

      <div className="rounded-md border bg-card p-4 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Actor</Label>
          <Select
            value={filters.actorId !== undefined ? String(filters.actorId) : "any"}
            onValueChange={(v) =>
              setFilters((p) => ({ ...p, actorId: v === "any" ? undefined : Number(v) }))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Any actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any actor</SelectItem>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <ActionMultiSelect
            value={filters.actions ?? []}
            onChange={(next) =>
              setFilters((p) => ({ ...p, actions: next.length ? next : undefined }))
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Target campaign</Label>
          <Select
            value={filters.campaignId !== undefined ? String(filters.campaignId) : "any"}
            onValueChange={(v) =>
              setFilters((p) => ({ ...p, campaignId: v === "any" ? undefined : Number(v) }))
            }
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Any campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any campaign</SelectItem>
              {(campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Target user</Label>
          <Select
            value={filters.targetUserId !== undefined ? String(filters.targetUserId) : "any"}
            onValueChange={(v) =>
              setFilters((p) => ({ ...p, targetUserId: v === "any" ? undefined : Number(v) }))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Any user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any user</SelectItem>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            max={filters.to}
            value={filters.from ?? ""}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value || undefined }))}
            className="w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            min={filters.from}
            value={filters.to ?? ""}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value || undefined }))}
            className="w-[160px]"
          />
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-q">Search</Label>
          <Input
            id="audit-q"
            placeholder="Search action or details..."
            value={filters.q ?? ""}
            onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value || undefined }))}
          />
        </div>

        <Button
          variant={aiFilterActive ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setFilters((prev) =>
              aiFilterActive
                ? { ...prev, actions: undefined }
                : { ...prev, actions: [AI_DATE_SHIFT_ACTION] },
            )
          }
          className="self-end"
          aria-pressed={aiFilterActive}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" /> AI actions only
        </Button>
        <Button
          variant={dateChangeOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setDateChangeOnly((v) => !v)}
          className="self-end"
          aria-pressed={dateChangeOnly}
        >
          <CalendarClock className="h-3.5 w-3.5 mr-1" /> Date changes only
        </Button>
        {(filtersHaveAny(filters) || dateChangeOnly) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setDateChangeOnly(false);
            }}
            className="self-end"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <div className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `Showing ${visibleRows.length.toLocaleString()} of ${totalCount.toLocaleString()} matching rows`}
            {exportTooLarge && (
              <span className="ml-2 text-destructive">
                — exceeds {MAX_EXPORT_ROWS.toLocaleString()}-row export cap
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="pr-6">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} aria-hidden>
                    <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="h-4 w-40" /></TableCell>
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No audit records match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((log) => {
                  const shift = getDateChange(log.action, log.details);
                  const isDateChange = shift !== null;
                  const isAi = isDateChange && shift?.source === "ai_suggestion";
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="pl-6 whitespace-nowrap text-muted-foreground text-sm">
                        {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{log.actorName}</TableCell>
                      <TableCell>
                        {log.actorRole && (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {log.actorRole.replace("_", " ")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isDateChange ? (
                            <Badge variant="secondary" className="font-mono text-xs">date change</Badge>
                          ) : (
                            <Badge variant="secondary" className="font-mono text-xs">{log.action}</Badge>
                          )}
                          {isAi && (
                            <Badge
                              variant="default"
                              className="text-[10px] uppercase gap-1"
                              title="Applied from an AI date-shift suggestion"
                            >
                              <Sparkles className="h-3 w-3" /> AI
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.entityType} {log.entityId ? `#${log.entityId}` : ""}
                      </TableCell>
                      <TableCell className="pr-6 text-sm text-muted-foreground max-w-md truncate" title={log.details || ""}>
                        {shift && (shift.from || shift.to) ? (
                          <span className="font-mono text-xs text-foreground">
                            {shift.from ?? "?"} <span className="text-muted-foreground">→</span> {shift.to ?? "?"}
                          </span>
                        ) : (
                          log.details || "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {hasMore && !isLoading && (
            <div className="flex justify-center p-4 border-t">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
