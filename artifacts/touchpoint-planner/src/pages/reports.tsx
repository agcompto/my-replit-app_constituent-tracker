import { useGetDashboard, useGetUpcomingVolume, useGetHighVolumeDonors } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download, Loader2 } from "lucide-react";
import { downloadCSV } from "@/lib/utils";
import { format } from "date-fns";
import { ReportsFilterBar, type ReportFilters } from "@/components/reports-filter-bar";

export default function Reports() {
  const [filters, setFilters] = useState<ReportFilters>({});

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard(filters);
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingVolume(filters);
  const { data: highVolume, isLoading: highVolumeLoading } = useGetHighVolumeDonors(filters);

  const handleDownloadUpcoming = () => {
    if (!upcoming) return;
    downloadCSV("upcoming-volume", upcoming);
  };

  const handleDownloadHighVolume = () => {
    if (!highVolume) return;
    const rows = highVolume.map(d => ({
      DonorID: d.donorId,
      TotalTouchpoints: d.totalTouchpoints,
      ...d.byChannel.reduce((acc, c) => ({ ...acc, [c.label]: c.count }), {})
    }));
    downloadCSV("high-volume-donors", rows);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">Detailed analysis of communication volume and trends.</p>
      </div>

      <ReportsFilterBar value={filters} onChange={setFilters} />

      <Tabs defaultValue="channels">
        <TabsList className="mb-4">
          <TabsTrigger value="channels">By Channel</TabsTrigger>
          <TabsTrigger value="types">By Campaign Type</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming Volume</TabsTrigger>
          <TabsTrigger value="high-volume">High-Volume Donors</TabsTrigger>
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
              {dashLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div> : (
                <>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.byChannel || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Touchpoints</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard?.byChannel?.map(c => (
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
              {dashLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div> : (
                <>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard?.byType || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Campaign Type</TableHead><TableHead className="text-right">Touchpoints</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard?.byType?.map(c => (
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
              {upcomingLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div> : (
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
              <CardTitle>High-Volume Donors</CardTitle>
              <Button variant="outline" size="sm" onClick={handleDownloadHighVolume}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {highVolumeLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Donor ID</TableHead>
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
                            {row.byChannel.map(c => (
                              <span key={c.label} className="text-xs bg-muted px-2 py-1 rounded">
                                {c.label}: <strong className="ml-1">{c.count}</strong>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!highVolume?.length && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No high volume donors found.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
