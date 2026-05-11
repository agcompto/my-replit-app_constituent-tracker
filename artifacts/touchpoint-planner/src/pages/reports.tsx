import {
  useGetDashboard,
  useGetUpcomingVolume,
  useGetHighVolumeDonors,
  useGetCohortAnalysis,
  useGetYoyVolume,
  useListSavedReportViews,
  useCreateSavedReportView,
  useDeleteSavedReportView,
  getListSavedReportViewsQueryKey,
  getGetYoyVolumeQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
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

const VIEW_TYPES = ["channels", "types", "upcoming", "high-volume", "cohort", "yoy"] as const;
type ViewType = (typeof VIEW_TYPES)[number];

export default function Reports() {
  const [tab, setTab] = useState<ViewType>("channels");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [cohortMonths, setCohortMonths] = useState(12);

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
          config={tab === "cohort" ? { months: cohortMonths } : undefined}
          onLoad={(v) => {
            setFilters((v.filters as ReportFilters) || {});
            if (v.viewType === "cohort" && v.config && typeof (v.config as any).months === "number") {
              setCohortMonths((v.config as any).months);
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
      </Tabs>
    </div>
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
