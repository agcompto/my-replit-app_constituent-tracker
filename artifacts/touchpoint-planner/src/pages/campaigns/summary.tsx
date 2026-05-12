import {
  useGetCampaign,
  useListTouches,
  useListThresholds,
  useListSuppressions,
  useListSeeds,
  useListChannels,
  getGetCampaignQueryKey,
  getListTouchesQueryKey,
  getListThresholdsQueryKey,
  getListSuppressionsQueryKey,
  getListSeedsQueryKey,
} from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Loader2, ArrowLeft, Printer, Download } from "lucide-react";
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
  const { data: thresholds, isLoading: thresholdsLoading } = useListThresholds(id, {
    query: { enabled: !!id, queryKey: getListThresholdsQueryKey(id) },
  });
  const { data: suppressions, isLoading: suppressionsLoading } = useListSuppressions(id, {
    query: { enabled: !!id, queryKey: getListSuppressionsQueryKey(id) },
  });
  const { data: seeds, isLoading: seedsLoading } = useListSeeds(id, {
    query: { enabled: !!id, queryKey: getListSeedsQueryKey(id) },
  });
  const { data: channels } = useListChannels();

  const channelName = (channelId: number | null | undefined): string | null => {
    if (channelId == null) return null;
    return channels?.find((c) => c.id === channelId)?.name ?? `Channel #${channelId}`;
  };
  const campaignTypeName = (typeId: number | null | undefined): string | null => {
    if (typeId == null) return null;
    return (
      campaign?.campaignTypes.find((t) => t.id === typeId)?.name ?? `Type #${typeId}`
    );
  };
  const touchName = (touchId: number | null | undefined): string | null => {
    if (touchId == null) return null;
    return touches?.find((t) => t.id === touchId)?.touchName ?? `Touch #${touchId}`;
  };
  const ACTION_MODE_LABELS: Record<string, string> = {
    track: "Track Only",
    flag: "Flag",
    remove: "Remove Flagged",
    manual: "Manual Review",
  };
  const thresholdScopeLabel = (t: {
    scope: string;
    channelId?: number | null;
    campaignTypeId?: number | null;
  }): string => {
    if (t.scope === "all") return "All communications";
    if (t.scope === "channel") return `Channel: ${channelName(t.channelId) ?? "-"}`;
    if (t.scope === "campaign_type")
      return `Type: ${campaignTypeName(t.campaignTypeId) ?? "-"}`;
    if (t.scope === "channel_and_type")
      return `${channelName(t.channelId) ?? "-"} · ${campaignTypeName(t.campaignTypeId) ?? "-"}`;
    return t.scope;
  };
  const suppressionScopeLabel = (s: {
    scope: string;
    channelId?: number | null;
    campaignTypeId?: number | null;
    touchId?: number | null;
  }): string => {
    if (s.scope === "all") return "All touches";
    if (s.scope === "channel") return `Channel: ${channelName(s.channelId) ?? "-"}`;
    if (s.scope === "campaign_type")
      return `Type: ${campaignTypeName(s.campaignTypeId) ?? "-"}`;
    if (s.scope === "touch") return `Touch: ${touchName(s.touchId) ?? "-"}`;
    return s.scope;
  };
  const seedScopeLabel = (s: {
    scope: string;
    channelId?: number | null;
    touchId?: number | null;
  }): string => {
    if (s.scope === "all") return "All touches";
    if (s.scope === "channel") return `Channel: ${channelName(s.channelId) ?? "-"}`;
    if (s.scope === "touch") return `Touch: ${touchName(s.touchId) ?? "-"}`;
    return s.scope;
  };

  const totalSuppressedDonors =
    suppressions?.reduce((sum, s) => sum + (s.donorIdCount ?? 0), 0) ?? 0;
  const suppressionsByReason = new Map<string, number>();
  for (const s of suppressions ?? []) {
    const key = s.reasonCodeName ?? s.reason ?? "Unspecified";
    suppressionsByReason.set(key, (suppressionsByReason.get(key) ?? 0) + (s.donorIdCount ?? 0));
  }

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
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            data-testid="button-download-summary-pdf"
          >
            <a href={`/api/campaigns/${id}/summary.pdf`} download>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </a>
          </Button>
          <Button onClick={() => window.print()} size="sm" data-testid="button-print-summary">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
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

      <section>
        <h2 className="text-lg font-semibold mb-3">Thresholds</h2>
        {thresholdsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !thresholds?.length ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <table className="w-full text-sm border-collapse" data-testid="table-summary-thresholds">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold">Scope</th>
                <th className="py-2 pr-4 font-semibold text-right">Max Touches</th>
                <th className="py-2 pr-4 font-semibold text-right">Window (days)</th>
                <th className="py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((t) => (
                <tr key={t.id} className="border-b" data-testid={`row-summary-threshold-${t.id}`}>
                  <td className="py-2 pr-4 font-medium">{t.name}</td>
                  <td className="py-2 pr-4">{thresholdScopeLabel(t)}</td>
                  <td className="py-2 pr-4 text-right">{t.maxTouchpoints}</td>
                  <td className="py-2 pr-4 text-right">{t.windowDays}</td>
                  <td className="py-2">{ACTION_MODE_LABELS[t.actionMode] ?? t.actionMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Suppressions</h2>
        {suppressionsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !suppressions?.length ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <>
            <p className="text-sm mb-3">
              <span className="font-medium">{suppressions.length}</span> suppression
              {suppressions.length === 1 ? "" : "s"} covering{" "}
              <span className="font-medium">{totalSuppressedDonors.toLocaleString()}</span>{" "}
              constituent ID{totalSuppressedDonors === 1 ? "" : "s"}.
            </p>
            {suppressionsByReason.size > 0 && (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  By reason
                </div>
                <ul className="text-sm list-disc pl-5">
                  {Array.from(suppressionsByReason.entries()).map(([reason, count]) => (
                    <li key={reason}>
                      {reason}: {count.toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <table className="w-full text-sm border-collapse" data-testid="table-summary-suppressions">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-semibold">Scope</th>
                  <th className="py-2 pr-4 font-semibold">Reason</th>
                  <th className="py-2 font-semibold text-right">IDs</th>
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr key={s.id} className="border-b" data-testid={`row-summary-suppression-${s.id}`}>
                    <td className="py-2 pr-4">{suppressionScopeLabel(s)}</td>
                    <td className="py-2 pr-4">
                      {s.reasonCodeName ?? s.reason ?? "Unspecified"}
                    </td>
                    <td className="py-2 text-right">{(s.donorIdCount ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Seeds</h2>
        {seedsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !seeds?.length ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <table className="w-full text-sm border-collapse" data-testid="table-summary-seeds">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-semibold">Scope</th>
                <th className="py-2 font-semibold text-right">Seed IDs</th>
              </tr>
            </thead>
            <tbody>
              {seeds.map((s) => (
                <tr key={s.id} className="border-b" data-testid={`row-summary-seed-${s.id}`}>
                  <td className="py-2 pr-4">{seedScopeLabel(s)}</td>
                  <td className="py-2 text-right">{(s.seedCount ?? 0).toLocaleString()}</td>
                </tr>
              ))}
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
