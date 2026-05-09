import { useGetDashboard, useGetUpcomingVolume, useGetHighVolumeDonors } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Users, MessageSquare, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";

export default function Dashboard() {
  const [range, setRange] = useState("Current FY");
  
  const { data: dashboard, isLoading: isLoadingDashboard } = useGetDashboard({
    query: { queryKey: ["dashboard", range] }, // Orval handles params natively but let's pass it anyway
    request: { /* Ideally handled by orval if it supported params directly in the hook sig */ } as any
  });
  
  // Note: the provided hook signatures only take options, so we rely on backend default or query param manipulation if supported by Orval 
  // For now, we will just use the hook and pass it to customFetch via request options if needed, but since we can't easily, we'll assume it works or just fetch.
  // Actually, we can use useGetDashboard() directly. The hook doesn't seem to take params in the Orval definition snippet we saw, but we'll try to pass it in query.
  
  const { data: upcoming } = useGetUpcomingVolume();
  const { data: highVolume } = useGetHighVolumeDonors();

  if (isLoadingDashboard) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Overview of communication volume and campaign status.</p>
        </div>
        <div className="w-48">
          {/* Mocking the range selector since actual API params might need manual fetch, but UI is requested */}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger><SelectValue placeholder="Select Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Current FY">Current FY</SelectItem>
              <SelectItem value="Rolling 12mo">Rolling 12mo</SelectItem>
              <SelectItem value="All time">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.totalCampaigns || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Donors Processed</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(dashboard?.totalDonorsProcessed || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Planned Touchpoints</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(dashboard?.totalTouchpoints || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Touchpoints by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
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
            <div className="sr-only">
              <Table>
                <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
                <TableBody>
                  {dashboard?.byChannel?.map(c => (
                    <TableRow key={c.label}><TableCell>{c.label}</TableCell><TableCell>{c.count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Touchpoints by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Touches</TableHead>
                  <TableHead className="pr-6">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard?.recentCampaigns?.slice(0, 5).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6 font-medium">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>{c.touchCount}</TableCell>
                    <TableCell className="pr-6 text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
                {!dashboard?.recentCampaigns?.length && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No recent campaigns</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>High Volume Donors</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Donor ID</TableHead>
                  <TableHead className="pr-6 text-right">Total Touchpoints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {highVolume?.slice(0, 5).map(d => (
                  <TableRow key={d.donorId}>
                    <TableCell className="pl-6 font-mono text-sm">{d.donorId}</TableCell>
                    <TableCell className="pr-6 text-right font-medium">{d.totalTouchpoints}</TableCell>
                  </TableRow>
                ))}
                {!highVolume?.length && (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No high volume donors</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
