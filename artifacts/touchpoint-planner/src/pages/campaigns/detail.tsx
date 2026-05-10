import { useGetCampaign, useArchiveCampaign, useVoidCampaign, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, ArrowLeft, Edit, Archive, Ban } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const { data: campaign, isLoading } = useGetCampaign(id, {
    query: { enabled: !!id, queryKey: getGetCampaignQueryKey(id) }
  });

  const archiveMutation = useArchiveCampaign();
  const voidMutation = useVoidCampaign();

  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
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
        </div>
      </div>

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

    </div>
  );
}
