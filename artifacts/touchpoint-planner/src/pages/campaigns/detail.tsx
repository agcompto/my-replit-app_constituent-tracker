import { useGetCampaign, useArchiveCampaign, useVoidCampaign, useDeleteCampaign, useAiAudienceSummary, useGetSettings, getGetCampaignQueryKey, useListTouches, getListTouchesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TouchDateHistoryPopover } from "@/components/touch-date-history-popover";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Edit, Archive, Ban, Sparkles, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { ReauthDialog, isReauthRequired } from "@/components/ReauthDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const { data: campaign, isLoading } = useGetCampaign(id, {
    query: { enabled: !!id, queryKey: getGetCampaignQueryKey(id) }
  });
  const { data: touches, isLoading: touchesLoading } = useListTouches(id, {
    query: { enabled: !!id, queryKey: getListTouchesQueryKey(id) }
  });

  const archiveMutation = useArchiveCampaign();
  const voidMutation = useVoidCampaign();
  const deleteMutation = useDeleteCampaign();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  // Server gates DELETE /campaigns/:id on requireRecentAuth — if it
  // responds with code "reauth_required", pop the password prompt and
  // retry the delete on success.
  useEffect(() => {
    if (isReauthRequired(deleteMutation.error)) setReauthOpen(true);
  }, [deleteMutation.error]);
  const runDelete = () =>
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Campaign deleted", description: `"${campaign?.name ?? ""}" has been permanently removed.` });
        setDeleteOpen(false);
        setDeleteConfirm("");
        setLocation("/campaigns");
      },
    });
  const { data: settings } = useGetSettings();
  const aiSummaryMutation = useAiAudienceSummary();
  const { toast } = useToast();
  const [aiSummary, setAiSummary] = useState<{ summary: string; generatedAt: string } | null>(null);

  const handleGenerateSummary = () => {
    aiSummaryMutation.mutate({ id }, {
      onSuccess: (res) => setAiSummary(res),
      onError: (err: any) => toast({
        title: "AI summary failed",
        description: err?.response?.data?.error || err?.message || "Unknown error",
        variant: "destructive",
      }),
    });
  };

  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const isSuperAdmin = me?.role === "super_admin";
  const isVoided = campaign?.status === "voided";
  const canEdit = campaign && !isVoided && (campaign.status !== "exported" || isAdmin);

  const handleArchive = () => {
    if (confirm("Are you sure you want to archive this campaign?")) {
      archiveMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) })
      });
    }
  };

  const handleVoid = () => {
    if (confirm("Are you sure you want to void this campaign?")) {
      voidMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(id) })
      });
    }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  if (!campaign) {
    return <div className="p-8 text-center text-muted-foreground">Campaign not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <button onClick={() => setLocation("/campaigns")} className="hover:text-foreground flex items-center"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Campaigns</button>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-muted-foreground">Submitted by {campaign.submittedByName}</p>
        </div>
        
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button onClick={() => setLocation(`/campaigns/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Campaign
            </Button>
          )}
          {isAdmin && !isVoided && (
            <>
              {campaign.status !== "archived" && <Button variant="secondary" onClick={handleArchive}><Archive className="h-4 w-4 mr-2" /> Archive</Button>}
              <Button variant="destructive" onClick={handleVoid}><Ban className="h-4 w-4 mr-2" /> Void</Button>
            </>
          )}
          {isSuperAdmin && (
            <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setDeleteOpen(true)} data-testid="button-delete-campaign">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(v) => { if (!v) { setDeleteOpen(false); setDeleteConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign permanently?</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{campaign.name}</strong> and all
              of its audience uploads, touches, thresholds, suppressions,
              seeds, and export history. The audit log entries are preserved.
              This cannot be undone — most cases should use <em>Void</em>{" "}
              instead.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error && !isReauthRequired(deleteMutation.error) ? (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{(deleteMutation.error as any)?.data?.error || (deleteMutation.error as any)?.response?.data?.error || "Failed to delete campaign."}</span>
            </div>
          ) : null}
          <ReauthDialog
            open={reauthOpen}
            onClose={() => setReauthOpen(false)}
            onSuccess={() => {
              setReauthOpen(false);
              deleteMutation.reset();
              runDelete();
            }}
            description="Deleting a campaign is permanent. Re-enter your password to confirm."
          />
          <div className="space-y-2">
            <Label>Type the campaign name to confirm</Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={campaign.name}
              data-testid="input-delete-campaign-confirm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || deleteConfirm !== campaign.name}
              onClick={runDelete}
              data-testid="button-confirm-delete-campaign"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {settings?.aiAssistEnabled && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Audience Summary</CardTitle>
              <CardDescription>A short, plain-English brief based on this campaign's audience and planned touches. No constituent IDs are sent.</CardDescription>
            </div>
            <Button onClick={handleGenerateSummary} disabled={aiSummaryMutation.isPending} variant="secondary" size="sm">
              {aiSummaryMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {aiSummary ? "Regenerate" : "Generate"}
            </Button>
          </CardHeader>
          {aiSummary && (
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiSummary.summary}</p>
              <p className="text-xs text-muted-foreground mt-3">Generated {format(new Date(aiSummary.generatedAt), "MMM d, yyyy 'at' h:mm a")}</p>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Owning Unit</p>
                <p className="font-medium">{campaign.owningUnit || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Intended Send Date</p>
                <p className="font-medium">{campaign.intendedSendStartDate ? format(new Date(campaign.intendedSendStartDate), "MMM d, yyyy") : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Salesforce ID</p>
                <p className="font-medium font-mono text-sm">{campaign.salesforceCampaignId || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Campaign Types</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {campaign.campaignTypes.map(t => <Badge key={t.id} variant="secondary">{t.name}</Badge>)}
                </div>
              </div>
            </div>
            {campaign.internalNotes && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{campaign.internalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Valid IDs</p>
                <p className="font-medium text-2xl">{campaign.validIdCount?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Unique IDs</p>
                <p className="font-medium text-2xl text-primary">{campaign.uniqueIdCount?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Rejected</p>
                <p className="font-medium text-destructive">{campaign.rejectedIdCount?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Duplicates</p>
                <p className="font-medium text-amber-600">{campaign.duplicateIdCount?.toLocaleString() || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned Touches</CardTitle>
          <CardDescription>
            Each planned communication for this campaign and its scheduled send date.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Send Date</TableHead>
                <TableHead className="pr-6">Audience</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {touchesLoading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : !touches?.length ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No touchpoints defined for this campaign.</TableCell></TableRow>
              ) : (
                touches.map((t) => {
                  const custom = t.audienceMode === "custom";
                  return (
                    <TableRow key={t.id} data-testid={`row-touch-${t.id}`}>
                      <TableCell className="pl-6 font-medium">{t.touchName}</TableCell>
                      <TableCell>{t.channelLabel}</TableCell>
                      <TableCell>{t.campaignTypeLabel}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span>{format(new Date(t.sendDate), "MMM d, yyyy")}</span>
                          <TouchDateHistoryPopover
                            campaignId={campaign.id}
                            touchId={t.id}
                            touchName={t.touchName}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="pr-6">
                        {custom ? (
                          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                            Custom · {t.customUniqueIdCount?.toLocaleString() ?? 0}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Campaign-wide · {campaign.uniqueIdCount?.toLocaleString() ?? 0}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
