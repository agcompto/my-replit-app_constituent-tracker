import { useGetCampaign, useListTouches, getGetCampaignQueryKey, getListTouchesQueryKey } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Loader2, ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function CampaignSummary() {
  const [, params] = useRoute("/campaigns/:id/summary");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();

  const { data: campaign, isLoading } = useGetCampaign(id, {
    query: { enabled: !!id, queryKey: getGetCampaignQueryKey(id) },
  });
  const { data: touches, isLoading: touchesLoading } = useListTouches(id, {
    query: { enabled: !!id, queryKey: getListTouchesQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return <div className="p-8 text-center text-muted-foreground">Campaign not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 print:p-0 space-y-6 print:space-y-4 bg-white text-black">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-4 no-print">
        <button
          onClick={() => setLocation(`/campaigns/${id}`)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Campaign
        </button>
        <Button onClick={() => window.print()} size="sm" data-testid="button-print-summary">
          <Printer className="h-4 w-4 mr-2" /> Print
        </Button>
      </div>

      <header className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Campaign Summary · Submitted by {campaign.submittedByName}
          {" · "}Status: {campaign.status}
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Owning Unit</dt>
            <dd className="font-medium">{campaign.owningUnit || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Intended Send Date</dt>
            <dd className="font-medium">
              {campaign.intendedSendStartDate
                ? format(new Date(campaign.intendedSendStartDate), "MMM d, yyyy")
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Salesforce ID</dt>
            <dd className="font-mono text-sm">{campaign.salesforceCampaignId || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Campaign Types</dt>
            <dd className="font-medium">
              {campaign.campaignTypes.length
                ? campaign.campaignTypes.map((t) => t.name).join(", ")
                : "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Audience Summary</h2>
        <dl className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Valid IDs</dt>
            <dd className="font-medium text-xl">{campaign.validIdCount?.toLocaleString() || 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Unique IDs</dt>
            <dd className="font-medium text-xl">{campaign.uniqueIdCount?.toLocaleString() || 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rejected</dt>
            <dd className="font-medium text-xl">{campaign.rejectedIdCount?.toLocaleString() || 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Duplicates</dt>
            <dd className="font-medium text-xl">{campaign.duplicateIdCount?.toLocaleString() || 0}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Planned Touches</h2>
        {touchesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !touches?.length ? (
          <p className="text-sm text-muted-foreground">No touchpoints defined for this campaign.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold">Channel</th>
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 pr-4 font-semibold">Send Date</th>
                <th className="py-2 font-semibold text-right">Audience</th>
              </tr>
            </thead>
            <tbody>
              {touches.map((t) => {
                const custom = t.audienceMode === "custom";
                const audienceCount = custom
                  ? t.customUniqueIdCount ?? 0
                  : campaign.uniqueIdCount ?? 0;
                const audienceLabel = custom ? "Custom" : "Campaign-wide";
                return (
                  <tr key={t.id} className="border-b" data-testid={`row-summary-touch-${t.id}`}>
                    <td className="py-2 pr-4 font-medium">{t.touchName}</td>
                    <td className="py-2 pr-4">{t.channelLabel}</td>
                    <td className="py-2 pr-4">{t.campaignTypeLabel}</td>
                    <td className="py-2 pr-4">{format(new Date(t.sendDate), "MMM d, yyyy")}</td>
                    <td className="py-2 text-right">
                      {audienceLabel} · {audienceCount.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <footer className="pt-4 border-t text-xs text-muted-foreground">
        Generated {format(new Date(), "MMM d, yyyy 'at' h:mm a")}
      </footer>
    </div>
  );
}
