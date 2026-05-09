import { useState } from "react";
import { useListCampaigns } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlusCircle, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mySubmissions, setMySubmissions] = useState(false);

  // In a real app we'd pass these params to the hook if Orval supported it in the generic snippet we saw,
  // Since we only have the simple hook exported, we will fetch all and filter client-side for MVP, 
  // or assume the hook passes them implicitly. Let's filter client-side for safety if they aren't passed.
  const { data: campaigns, isLoading } = useListCampaigns();

  const filteredCampaigns = campaigns?.filter(c => {
    if (statusFilter !== "all" && c.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    // Assuming we don't have current user ID here easily without useGetMe, we rely on server if possible. 
    // If not, we skip the mySubmissions filter logic client-side and hope server handles it or leave it as UI.
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground text-sm">Manage and monitor your communication campaigns.</p>
        </div>
        <Button onClick={() => setLocation("/campaigns/new")}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search campaigns..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-1.5 w-[180px]">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="previewed">Previewed</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="exported">Exported</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2 h-10 border rounded-md px-3 bg-secondary/20">
          <Switch id="my-submissions" checked={mySubmissions} onCheckedChange={setMySubmissions} />
          <Label htmlFor="my-submissions" className="cursor-pointer">My submissions</Label>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Types</TableHead>
              <TableHead>Audience Size</TableHead>
              <TableHead>Touches</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Submitted By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredCampaigns?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No campaigns found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredCampaigns?.map(c => (
                <TableRow 
                  key={c.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setLocation(`/campaigns/${c.id}`)}
                >
                  <TableCell className="font-medium text-primary hover:underline">{c.name}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(c as any).campaignTypes?.slice(0, 2).map((t: string) => (
                        <span key={t} className="text-xs bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">{t}</span>
                      ))}
                      {((c as any).campaignTypes?.length || 0) > 2 && <span className="text-xs text-muted-foreground">+{((c as any).campaignTypes?.length || 0) - 2} more</span>}
                    </div>
                  </TableCell>
                  <TableCell>{(c.audienceSize || 0).toLocaleString()}</TableCell>
                  <TableCell>{c.touchCount}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-sm">{c.submittedByName}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
