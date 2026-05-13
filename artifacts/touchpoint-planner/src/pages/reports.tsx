import {
  useGetDashboard,
  useGetUpcomingVolume,
  useGetHighVolumeDonors,
  useGetCohortAnalysis,
  useGetYoyVolume,
  useGetSaturationReport,
  useListSavedReportViews,
  useCreateSavedReportView,
  useDeleteSavedReportView,
  getListSavedReportViewsQueryKey,
  getGetYoyVolumeQueryKey,
  getGetSaturationReportQueryKey,
  type SaturationReport,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, Loader2, BookmarkPlus, Bookmark, Trash2 } from "lucide-react";
import { downloadCSV } from "@/lib/utils";
import { format } from "date-fns";
import { ReportsFilterBar, type ReportFilters } from "@/components/reports-filter-bar";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const VIEW_TYPES = ["channels", "types", "upcoming", "high-volume", "cohort", "yoy", "saturation"] as const;
type ViewType = (typeof VIEW_TYPES)[number];

// Linkable reports: tab + filters + per-tab config are kept in
// `window.location.search` so a URL is enough to share/bookmark a view.
function readInitialState(): {
  tab: ViewType;
  filters: ReportFilters;
  cohortMonths: number;
  saturationWeeks: number;
} {
  const sp = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const rawTab = sp.get("tab");
  const tab = (VIEW_TYPES as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as ViewType)
    : "channels";
  const filters: ReportFilters = {};
  const start = sp.get("startDate");
  const end = sp.get("endDate");
  const owningUnit = sp.get("owningUnit");
  const channelIdRaw = sp.get("channelId");
  if (start) filters.startDate = start;
  if (end) filters.endDate = end;
  if (owningUnit) filters.owningUnit = owningUnit;
  if (channelIdRaw && /^\d+$/.test(channelIdRaw)) filters.channelId = Number(channelIdRaw);
  const months = Number(sp.get("cohortMonths"));
  const weeks = Number(sp.get("saturationWeeks"));
  return {
    tab,
    filters,
    cohortMonths: [3, 6, 12, 18, 24, 36].includes(months) ? months : 12,
    saturationWeeks: [4, 8, 12, 16, 20, 26].includes(weeks) ? weeks : 12,
  };
}

export default function Reports() {
  const initial = useRef(readInitialState()).current;
  const [tab, setTab] = useState<ViewType>(initial.tab);
  const [filters, setFilters] = useState<ReportFilters>(initial.filters);
  const [cohortMonths, setCohortMonths] = useState(initial.cohortMonths);
  const [saturationWeeks, setSaturationWeeks] = useState(initial.saturationWeeks);

  // Push state → querystring (replaceState so we don't pollute history).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams();
    sp.set("tab", tab);
    if (filters.startDate) sp.set("startDate", filters.startDate);
    if (filters.endDate) sp.set("endDate", filters.endDate);
    if (filters.owningUnit) sp.set("owningUnit", filters.owningUnit);
    if (filters.channelId !== undefined) sp.set("channelId", String(filters.channelId));
    if (tab === "cohort") sp.set("cohortMonths", String(cohortMonths));
    if (tab === "saturation") sp.set("saturationWeeks", String(saturationWeeks));
    const next = `${window.location.pathname}?${sp.toString()}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [tab, filters, cohortMonths, saturationWeeks]);

  const saturationParams = {
    weeks: saturationWeeks,
    ...(filters.owningUnit ? { owningUnit: filters.owningUnit } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
  };
  const { data: saturation, isLoading: saturationLoading } = useGetSaturationReport(
    saturationParams,
    {
      query: {
        enabled: tab === "saturation",
        queryKey: getGetSaturationReportQueryKey(saturationParams),
      },
    },
  );

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard(filters);
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingVolume(filters);
  const { data: highVolume, isLoading: highVolumeLoading } = useGetHighVolumeDonors(filters);
  const { data: cohort, isLoading: cohortLoading } = useGetCohortAnalysis({
    months: cohortMonths,
    ...(filters.owningUnit ? { owningUnit: filters.owningUnit } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
  });
  const yoyEnabled = !!filters.startDate && !!filters.endDate;
  const yoyParams = {
    currentStart: filters.startDate || "",
    currentEnd: filters.endDate || "",
    ...(filters.owningUnit ? { owningUnit: filters.owningUnit } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
  };
  const { data: yoy, isLoading: yoyLoading } = useGetYoyVolume(yoyParams, {
    query: { enabled: yoyEnabled, queryKey: getGetYoyVolumeQueryKey(yoyParams) },
  });

  const handleDownloadUpcoming = () => upcoming && downloadCSV("upcoming-volume", upcoming);
  const handleDownloadHighVolume = () => {
    if (!highVolume) return;
    const rows = highVolume.map((d) => ({
      ConstituentID: d.donorId,
      TotalTouchpoints: d.totalTouchpoints,
      ...d.byChannel.reduce((acc, c) => ({ ...acc, [c.label]: c.count }), {}),
    }));
    downloadCSV("high-volume-constituents", rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">Detailed analysis of communication volume and trends.</p>
        </div>
        <SavedViews
          viewType={tab}
          filters={filters}
          config={
            tab === "cohort"
              ? { months: cohortMonths }
              : tab === "saturation"
                ? { weeks: saturationWeeks }
                : undefined
          }
          onLoad={(v) => {
            setFilters((v.filters as ReportFilters) || {});
            const cohortMonthsFromConfig = readNumberField(v.config, "months");
            if (v.viewType === "cohort" && cohortMonthsFromConfig !== undefined) {
              setCohortMonths(cohortMonthsFromConfig);
            }
            const saturationWeeksFromConfig = readNumberField(v.config, "weeks");
            if (v.viewType === "saturation" && saturationWeeksFromConfig !== undefined) {
              setSaturationWeeks(saturationWeeksFromConfig);
            }
            if (v.viewType === "saturation" && v.config && typeof (v.config as any).weeks === "number") {
              setSaturationWeeks((v.config as any).weeks);
            }
            if ((VIEW_TYPES as readonly string[]).includes(v.viewType)) setTab(v.viewType as ViewType);
          }}
        />
      </div>

      <ReportsFilterBar value={filters} onChange={setFilters} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ViewType)}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="channels">By Channel</TabsTrigger>
          <TabsTrigger value="types">By Campaign Type</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming Volume</TabsTrigger>
          <TabsTrigger value="high-volume">High-Volume Constituents</TabsTrigger>
          <TabsTrigger value="cohort">Cohort Analysis</TabsTrigger>
          <TabsTrigger value="yoy">Year-over-Year</TabsTrigger>
          <TabsTrigger value="saturation">Channel Saturation</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>Touchpoints by Channel</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV("touchpoints-by-channel", dashboard?.byChannel || [])}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {dashLoading ? <LoaderBlock /> : (
                <>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.byChannel || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Touchpoints</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard?.byChannel?.map((c) => (
                        <TableRow key={c.label}><TableCell className="font-medium">{c.label}</TableCell><TableCell className="text-right">{c.count.toLocaleString()}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>Touchpoints by Campaign Type</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV("touchpoints-by-type", dashboard?.byType || [])}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {dashLoading ? <LoaderBlock /> : (
                <>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.byType || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Campaign Type</TableHead><TableHead className="text-right">Touchpoints</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard?.byType?.map((c) => (
                        <TableRow key={c.label}><TableCell className="font-medium">{c.label}</TableCell><TableCell className="text-right">{c.count.toLocaleString()}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>{filters.startDate || filters.endDate ? "Volume in Date Range" : "Upcoming Volume"}</CardTitle>
              <Button variant="outline" size="sm" onClick={handleDownloadUpcoming}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingLoading ? <LoaderBlock /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Send Date</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Campaigns</TableHead>
                      <TableHead className="text-right">Projected Touchpoints</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming?.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{format(new Date(row.sendDate), "MMM d, yyyy")}</TableCell>
                        <TableCell>{row.channelLabel}</TableCell>
                        <TableCell className="text-right">{row.campaignCount}</TableCell>
                        <TableCell className="text-right">{row.touchpointCount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {!upcoming?.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No touches match the current filters.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="high-volume" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>High-Volume Constituents</CardTitle>
              <Button variant="outline" size="sm" onClick={handleDownloadHighVolume}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {highVolumeLoading ? <LoaderBlock /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Constituent ID</TableHead>
                      <TableHead className="text-right">Total Touchpoints</TableHead>
                      <TableHead>Breakdown</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {highVolume?.map((row) => (
                      <TableRow key={row.donorId}>
                        <TableCell className="font-mono">{row.donorId}</TableCell>
                        <TableCell className="text-right font-medium">{row.totalTouchpoints}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {row.byChannel.map((c) => (
                              <span key={c.label} className="text-xs bg-muted px-2 py-1 rounded">
                                {c.label}: <strong className="ml-1">{c.count}</strong>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!highVolume?.length && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No high volume constituents found.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cohort" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center gap-3 flex-wrap">
              <div>
                <CardTitle>Cohort Analysis</CardTitle>
                <CardDescription>Donors grouped by their first-touch month, with average touchpoints per donor.</CardDescription>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5 w-32">
                  <Label className="text-xs text-muted-foreground">Lookback (months)</Label>
                  <Select value={String(cohortMonths)} onValueChange={(v) => setCohortMonths(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 6, 12, 18, 24, 36].map((m) => <SelectItem key={m} value={String(m)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => cohort && downloadCSV("cohort-analysis", cohort.cohorts)}>
                  <Download className="h-4 w-4 mr-2" /> Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cohortLoading ? <LoaderBlock /> : (
                <>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cohort?.cohorts || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="cohortMonth" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                        <Bar dataKey="cohortSize" name="Cohort size" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cohort Month</TableHead>
                        <TableHead className="text-right">Donors</TableHead>
                        <TableHead className="text-right">Total Touchpoints</TableHead>
                        <TableHead className="text-right">Avg / Donor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cohort?.cohorts?.map((c) => (
                        <TableRow key={c.cohortMonth}>
                          <TableCell className="font-medium">{c.cohortMonth}</TableCell>
                          <TableCell className="text-right">{c.cohortSize.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{c.totalTouchpoints.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{c.avgTouchpointsPerDonor.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {!cohort?.cohorts?.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No cohort data for the selected range.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yoy" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle>Year-over-Year Volume</CardTitle>
                <CardDescription>
                  {yoy
                    ? `Comparing ${yoy.currentRange.start} → ${yoy.currentRange.end} against ${yoy.priorRange.start} → ${yoy.priorRange.end}.`
                    : "Set a date range above; the prior period defaults to the same window one year earlier."}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => yoy && downloadCSV("yoy-by-channel", yoy.byChannel)}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {!yoyEnabled ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Set both a start and end date in the filter bar above to compare against the prior year.
                </div>
              ) : yoyLoading ? <LoaderBlock /> : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <Stat label="Current total" value={yoy?.currentTotal} />
                    <Stat label="Prior total" value={yoy?.priorTotal} />
                    <Stat label="% change" value={yoy ? `${yoy.percentChange >= 0 ? "+" : ""}${yoy.percentChange.toFixed(1)}%` : "—"} highlight={yoy?.percentChange} />
                  </div>
                  {yoy && yoy.byMonth.length > 0 ? (
                    <div className="mb-6">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Monthly comparison (current vs prior year)
                      </div>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={buildYoyMonthlySeries(yoy.currentRange.start, yoy.byMonth)}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="monthLabel" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                            <Legend />
                            <Bar dataKey="prior" name="Prior year" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="current" name="Current year" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : null}
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">By channel</div>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yoy?.byChannel || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                        <Legend />
                        <Bar dataKey="prior" name="Prior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="current" name="Current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead className="text-right">Prior</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yoy?.byChannel?.map((r) => (
                        <TableRow key={r.label}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="text-right">{r.prior.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{r.current.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{(r.current - r.prior).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {!yoy?.byChannel?.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No data for the selected ranges.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saturation" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center gap-3 flex-wrap">
              <div>
                <CardTitle>Channel Saturation Heatmap</CardTitle>
                <CardDescription>
                  Planned touchpoints per channel × week (Monday-anchored). Cell intensity is volume ÷ the per-channel weekly capacity configured in Settings → Reports. Hover a cell for contributing campaigns.
                </CardDescription>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5 w-32">
                  <Label className="text-xs text-muted-foreground">Horizon (weeks)</Label>
                  <Select value={String(saturationWeeks)} onValueChange={(v) => setSaturationWeeks(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[4, 8, 12, 16, 20, 26].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!saturation) return;
                    const rows: Record<string, string | number>[] = [];
                    for (const c of saturation.channels) {
                      const row: Record<string, string | number> = {
                        Channel: c.channelLabel,
                        Capacity: c.capacity ?? "",
                      };
                      for (const cell of c.cells) row[cell.weekStart] = cell.touchpointCount;
                      rows.push(row);
                    }
                    downloadCSV("channel-saturation", rows);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" /> Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {saturationLoading ? <LoaderBlock /> : !saturation ? null : (
                <SaturationHeatmap data={saturation} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Typed narrowing for saved-view `config` blobs. Saved views store an opaque
// JSON object per view type; we read only the numeric fields we recognize and
// ignore everything else, so a malformed/legacy config can never crash the
// load handler.
function readNumberField(config: unknown, key: string): number | undefined {
  if (!config || typeof config !== "object") return undefined;
  const v = (config as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Convert the YoY backend's monthOffset-keyed buckets into a chart-ready
// series with a human "Mon YYYY" label anchored on the current range start.
function buildYoyMonthlySeries(
  currentRangeStart: string,
  byMonth: { monthOffset: number; current: number; prior: number }[],
): { monthLabel: string; current: number; prior: number }[] {
  const [y, m] = currentRangeStart.split("-").map(Number);
  return byMonth.map((b) => {
    const dt = new Date(Date.UTC(y, (m - 1) + b.monthOffset, 1));
    return {
      monthLabel: format(dt, "MMM yyyy"),
      current: b.current,
      prior: b.prior,
    };
  });
}

function SaturationHeatmap({ data }: { data: SaturationReport }) {
  if (data.channels.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No active channels to display.</div>;
  }
  // Compute a single intensity for each cell. With capacity, intensity =
  // count / capacity, clamped at [0, 1.5] so over-capacity weeks still pop.
  // Without capacity, fall back to a per-row max so the row reads relatively.
  const cellStyle = (count: number, capacity: number | null, rowMax: number): CSSProperties => {
    if (count === 0) return { backgroundColor: "hsl(var(--muted) / 0.4)" };
    let pct: number;
    if (capacity && capacity > 0) {
      pct = Math.min(count / capacity, 1.5);
    } else {
      pct = rowMax > 0 ? count / rowMax : 0;
    }
    // Hue 12 (warm orange/red) for over-capacity; primary blue otherwise.
    if (capacity && count > capacity) {
      const a = 0.4 + Math.min(0.5, (pct - 1) * 0.8);
      return { backgroundColor: `hsl(12 80% 55% / ${a.toFixed(2)})` };
    }
    const a = 0.15 + Math.min(0.7, pct * 0.7);
    return { backgroundColor: `hsl(var(--primary) / ${a.toFixed(2)})` };
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto" data-testid="saturation-heatmap">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-background text-left p-2 font-medium border-b">Channel</th>
              <th className="text-right p-2 font-medium border-b">Cap / wk</th>
              {data.weeks.map((w) => (
                <th key={w.weekStart} className="p-2 font-normal text-muted-foreground border-b text-center min-w-[60px]">
                  {format(new Date(w.weekStart + "T00:00:00"), "MMM d")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.channels.map((row) => {
              const rowMax = Math.max(0, ...row.cells.map((c) => c.touchpointCount));
              return (
                <tr key={row.channelId}>
                  <td className="sticky left-0 bg-background font-medium p-2 border-b whitespace-nowrap">{row.channelLabel}</td>
                  <td className="text-right p-2 border-b text-muted-foreground">{row.capacity ?? "—"}</td>
                  {row.cells.map((cell) => {
                    const over = row.capacity && cell.touchpointCount > row.capacity;
                    const pctText = row.capacity && row.capacity > 0
                      ? ` (${Math.round((cell.touchpointCount / row.capacity) * 100)}% of cap)`
                      : "";
                    return (
                      <UITooltip key={cell.weekStart}>
                        <TooltipTrigger asChild>
                          <td
                            className="p-0 border-b text-center"
                            style={cellStyle(cell.touchpointCount, row.capacity, rowMax)}
                            data-testid={`sat-cell-${row.channelId}-${cell.weekStart}`}
                          >
                            <div className={`px-2 py-2 ${over ? "font-semibold" : ""}`}>
                              {cell.touchpointCount > 0 ? cell.touchpointCount.toLocaleString() : ""}
                            </div>
                          </td>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="text-xs">
                            <div className="font-medium">{row.channelLabel} · week of {cell.weekStart}</div>
                            <div className="text-muted-foreground mb-1">
                              {cell.touchpointCount.toLocaleString()} touchpoints{pctText}
                            </div>
                            {cell.campaigns.length === 0 ? (
                              <div className="text-muted-foreground">No campaigns scheduled.</div>
                            ) : (
                              <ul className="space-y-0.5">
                                {cell.campaigns.slice(0, 8).map((c) => (
                                  <li key={c.id}>
                                    <Link href={`/campaigns/${c.id}`} className="underline hover:text-primary">{c.name}</Link>
                                  </li>
                                ))}
                                {cell.campaigns.length > 8 ? (
                                  <li className="text-muted-foreground">…and {cell.campaigns.length - 8} more</li>
                                ) : null}
                              </ul>
                            )}
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

function LoaderBlock() {
  return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;
}

function Stat({ label, value, highlight }: { label: string; value: number | string | undefined; highlight?: number }) {
  const color = highlight === undefined ? "" : highlight > 0 ? "text-emerald-600" : highlight < 0 ? "text-destructive" : "";
  const display = typeof value === "number" ? value.toLocaleString() : value ?? "—";
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-medium text-2xl ${color}`}>{display}</p>
    </div>
  );
}

function SavedViews({
  viewType,
  filters,
  config,
  onLoad,
}: {
  viewType: ViewType;
  filters: ReportFilters;
  config?: Record<string, unknown>;
  onLoad: (v: { viewType: string; filters: Record<string, unknown>; config: Record<string, unknown> }) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: views } = useListSavedReportViews({ viewType });
  const createView = useCreateSavedReportView();
  const deleteView = useDeleteSavedReportView();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "org">("private");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSavedReportViewsQueryKey({ viewType }) });

  const handleSave = () => {
    if (!name.trim()) return;
    createView.mutate(
      { data: { name: name.trim(), viewType, visibility, filters: filters as any, config: (config ?? {}) as any } },
      {
        onSuccess: () => {
          toast({ title: "View saved" });
          setOpen(false);
          setName("");
          invalidate();
        },
        onError: (e: any) => toast({ title: "Could not save view", description: e?.response?.data?.error || e?.message, variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this saved view?")) return;
    deleteView.mutate({ id }, { onSuccess: invalidate });
  };

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={(v) => {
        const found = views?.find((x) => String(x.id) === v);
        if (found) onLoad(found as any);
      }}>
        <SelectTrigger className="w-[220px]">
          <Bookmark className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Saved views" />
        </SelectTrigger>
        <SelectContent>
          {(views?.length ?? 0) === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet.</div>
          ) : (
            views!.map((v) => (
              <div key={v.id} className="flex items-center pr-1">
                <SelectItem value={String(v.id)} className="flex-1">
                  <span>{v.name}</span>
                  {v.visibility === "org" ? (
                    <span className="ml-2 text-xs text-muted-foreground">· shared{!v.isOwner && v.ownerName ? ` by ${v.ownerName}` : ""}</span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">· private</span>
                  )}
                </SelectItem>
                {v.isOwner ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(v.id); }}
                    aria-label={`Delete saved view ${v.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <BookmarkPlus className="h-4 w-4 mr-2" /> Save view
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>Stores the current filters for the <strong>{viewType}</strong> tab so you can recall them later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="saved-view-name">Name</Label>
              <Input id="saved-view-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 fundraising overview" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-view-visibility">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v === "org" ? "org" : "private")}>
                <SelectTrigger id="saved-view-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — only you</SelectItem>
                  <SelectItem value="org">Shared — visible to everyone in your organization</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Shared views appear in everyone's saved views list. Only the owner can edit or delete them.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || createView.isPending}>
              {createView.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
