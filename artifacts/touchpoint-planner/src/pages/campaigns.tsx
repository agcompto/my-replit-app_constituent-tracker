import { useEffect, useMemo, useState } from "react";
import {
  useListCampaigns,
  useCloneCampaign,
  useGetMe,
  useBulkArchiveCampaigns,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CampaignBadges } from "@/components/campaign-badges";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusCircle,
  Search,
  Loader2,
  MoreHorizontal,
  Copy,
  AlertTriangle,
  Archive,
  Download,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface CloneTarget {
  id: number;
  name: string;
  intendedSendStartDate: string | null;
}

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mySubmissions, setMySubmissions] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "archive" | "exports" | "manifests">(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const cloneMutation = useCloneCampaign();
  const { data: me } = useGetMe();
  const bulkArchive = useBulkArchiveCampaigns();
  const canBulkArchive = me?.role === "admin" || me?.role === "super_admin";
  const [cloneTarget, setCloneTarget] = useState<CloneTarget | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneIntendedDate, setCloneIntendedDate] = useState("");
  const [cloneShiftDays, setCloneShiftDays] = useState("");

  const openClone = (c: { id: number; name: string; intendedSendStartDate?: string | null }) => {
    setCloneTarget({ id: c.id, name: c.name, intendedSendStartDate: c.intendedSendStartDate ?? null });
    setCloneName(`${c.name} (copy)`);
    setCloneIntendedDate(c.intendedSendStartDate ?? "");
    setCloneShiftDays("");
    cloneMutation.reset();
  };

  const cloneErrorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
      const data = e.data as { error?: string } | null;
      if (data?.error) return data.error;
    }
    return "Failed to clone campaign.";
  };

  // In a real app we'd pass these params to the hook if Orval supported it in the generic snippet we saw,
  // Since we only have the simple hook exported, we will fetch all and filter client-side for MVP, 
  // or assume the hook passes them implicitly. Let's filter client-side for safety if they aren't passed.
  const { data: campaigns, isLoading } = useListCampaigns();

  const filteredCampaigns = useMemo(() => campaigns?.filter(c => {
    if (statusFilter !== "all" && c.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [campaigns, statusFilter, search]);

  // Always clear selection when the list filters change. Per task spec,
  // a status/search/mine-only flip resets the selection rather than
  // silently pruning it down to the still-visible subset, so the user
  // can't accidentally act on a partial selection from the prior view.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, search, mySubmissions]);

  const visibleIds = useMemo(
    () => (filteredCampaigns ?? []).map((c) => c.id),
    [filteredCampaigns],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (visibleIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const downloadZip = async (
    kind: "exports" | "manifests",
    ids: number[],
  ): Promise<void> => {
    const path =
      kind === "exports"
        ? "/api/campaigns/bulk/export.zip"
        : "/api/campaigns/bulk/manifests.zip";
    const filename =
      kind === "exports" ? "campaign_summaries.zip" : "campaign_audience_csvs.zip";
    setBulkBusy(kind);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        let msg = `Download failed (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          /* not JSON */
        }
        toast({ title: "Bulk download failed", description: msg, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Download started",
        description: `${ids.length} campaign${ids.length === 1 ? "" : "s"} packaged into ${filename}.`,
      });
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkArchive = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy("archive");
    bulkArchive.mutate(
      { data: { ids } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: ["listCampaigns"] });
          const skipped = res.results.length - res.archivedCount;
          toast({
            title: "Bulk archive complete",
            description:
              `Archived ${res.archivedCount} of ${res.results.length} campaign${res.results.length === 1 ? "" : "s"}.` +
              (skipped > 0 ? ` ${skipped} skipped (already archived, voided, or not found).` : ""),
          });
          clearSelection();
        },
        onError: (err) => {
          let msg = "Bulk archive failed.";
          if (err instanceof ApiError) {
            const data = err.data as { error?: string } | null;
            if (data?.error) msg = data.error;
          }
          toast({ title: "Bulk archive failed", description: msg, variant: "destructive" });
        },
        onSettled: () => setBulkBusy(null),
      },
    );
  };

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

      {selectedIds.size > 0 ? (
        <Card className="p-3 flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5">
          <div className="text-sm font-medium" data-testid="bulk-selection-count">
            {selectedIds.size} campaign{selectedIds.size === 1 ? "" : "s"} selected
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {canBulkArchive ? (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy !== null}
                onClick={handleBulkArchive}
                data-testid="button-bulk-archive"
              >
                {bulkBusy === "archive" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Archive selected
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy !== null}
              onClick={() => downloadZip("exports", Array.from(selectedIds))}
              data-testid="button-bulk-download-exports"
            >
              {bulkBusy === "exports" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDFs ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy !== null}
              onClick={() => downloadZip("manifests", Array.from(selectedIds))}
              data-testid="button-bulk-download-manifests"
            >
              {bulkBusy === "manifests" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download audience CSVs
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkBusy !== null}
              onClick={clearSelection}
              data-testid="button-bulk-clear"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() => toggleAll()}
                  disabled={visibleIds.length === 0}
                  aria-label="Select all visible campaigns"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status & Badges</TableHead>
              <TableHead>Types</TableHead>
              <TableHead>Audience Size</TableHead>
              <TableHead>Touches</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Submitted By</TableHead>
              <TableHead className="w-12" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredCampaigns?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No campaigns found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredCampaigns?.map(c => (
                <TableRow 
                  key={c.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  data-state={selectedIds.has(c.id) ? "selected" : undefined}
                  onClick={() => setLocation(`/campaigns/${c.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleId(c.id)}
                      aria-label={`Select campaign ${c.name}`}
                      data-testid={`checkbox-campaign-${c.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-primary hover:underline">{c.name}</TableCell>
                  <TableCell><CampaignBadges campaign={c} max={3} /></TableCell>
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
                  <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-row-actions-${c.id}`} aria-label="Row actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          data-testid={`button-row-clone-${c.id}`}
                          onSelect={(e) => {
                            e.preventDefault();
                            openClone(c);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" /> Clone…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!cloneTarget} onOpenChange={(v) => { if (!v) setCloneTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone {cloneTarget ? `"${cloneTarget.name}"` : "campaign"}</DialogTitle>
            <DialogDescription>
              Creates a new draft campaign with the same touches, thresholds,
              scope-only suppressions, and seed groups.{" "}
              <strong>The audience is not copied</strong>. Constituent-ID-specific and
              touch-scoped suppressions are skipped.
            </DialogDescription>
          </DialogHeader>
          {cloneMutation.error ? (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{cloneErrorMessage(cloneMutation.error)}</span>
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="list-clone-name">New campaign name</Label>
              <Input id="list-clone-name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} data-testid="input-list-clone-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-clone-date">New intended send date</Label>
              <Input id="list-clone-date" type="date" value={cloneIntendedDate} onChange={(e) => setCloneIntendedDate(e.target.value)} data-testid="input-list-clone-date" />
              <p className="text-xs text-muted-foreground">
                Touch send dates shift by the difference between this and the original.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-clone-shift">Custom date shift in days (optional)</Label>
              <Input id="list-clone-shift" type="number" placeholder="e.g. 7 or -14" value={cloneShiftDays} onChange={(e) => setCloneShiftDays(e.target.value)} data-testid="input-list-clone-shift" />
              <p className="text-xs text-muted-foreground">Overrides the implicit shift derived from the intended send date.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloneTarget(null)} disabled={cloneMutation.isPending}>Cancel</Button>
            <Button
              disabled={cloneMutation.isPending || !cloneName.trim() || !cloneTarget}
              data-testid="button-list-confirm-clone"
              onClick={() => {
                if (!cloneTarget) return;
                const shiftRaw = cloneShiftDays.trim();
                const dateShiftDays = shiftRaw === "" ? undefined : Number(shiftRaw);
                if (shiftRaw !== "" && !Number.isFinite(dateShiftDays)) return;
                cloneMutation.mutate(
                  {
                    id: cloneTarget.id,
                    data: {
                      name: cloneName.trim(),
                      intendedSendStartDate: cloneIntendedDate || null,
                      ...(dateShiftDays !== undefined ? { dateShiftDays } : {}),
                    },
                  },
                  {
                    onSuccess: (res) => {
                      const newId = res.campaign.id;
                      const skipped = res.skippedSuppressions;
                      queryClient.invalidateQueries({ queryKey: ["listCampaigns"] });
                      toast({
                        title: "Campaign cloned",
                        description:
                          `Created "${res.campaign.name}" with ${res.copiedTouches} touches, ${res.copiedThresholds} thresholds, ${res.copiedSuppressions} suppressions, ${res.copiedSeeds} seed groups.` +
                          (skipped ? ` ${skipped} suppression${skipped === 1 ? "" : "s"} skipped.` : ""),
                      });
                      setCloneTarget(null);
                      setLocation(`/campaigns/${newId}`);
                    },
                  },
                );
              }}
            >
              {cloneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
