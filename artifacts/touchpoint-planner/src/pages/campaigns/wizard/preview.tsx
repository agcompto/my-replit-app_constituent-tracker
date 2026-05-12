import {
  useGetCampaignPreview,
  useFinalizeCampaign,
  useExportCampaign,
  useGetCampaignHealthCheck,
  useAiSuggestDateShifts,
  useApplyAiDateShift,
  useGetLastAiDateShift,
  useUndoAiDateShift,
  useGetSettings,
  getGetCampaignQueryKey,
  getGetCampaignPreviewQueryKey,
  getGetCampaignHealthCheckQueryKey,
  getGetLastAiDateShiftQueryKey,
  getListTouchesQueryKey,
  getListThresholdsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertTriangle, AlertOctagon, Send, FileText, Sparkles, ArrowRight, Undo2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";
import { HealthCheckPanel } from "@/components/health-check-panel";

function UndoableShiftRow({
  campaignId,
  touchId,
  touchName,
  disabled,
  onUndone,
}: {
  campaignId: number;
  touchId: number;
  touchName: string;
  disabled: boolean;
  onUndone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useGetLastAiDateShift(campaignId, touchId, {
    query: {
      queryKey: getGetLastAiDateShiftQueryKey(campaignId, touchId),
      enabled: !!campaignId && !!touchId,
    },
  });
  const undo = useUndoAiDateShift();
  if (!data?.available) return null;

  const handleClick = () => {
    undo.mutate(
      { id: campaignId, touchId },
      {
        onSuccess: () => {
          toast({
            title: "Date shift undone",
            description: `${touchName}: ${data.to} → ${data.from}`,
          });
          queryClient.invalidateQueries({ queryKey: getGetLastAiDateShiftQueryKey(campaignId, touchId) });
          queryClient.invalidateQueries({ queryKey: getGetCampaignPreviewQueryKey(campaignId) });
          queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaignId) });
          queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaignId) });
          queryClient.invalidateQueries({ queryKey: getGetCampaignHealthCheckQueryKey(campaignId) });
          onUndone();
        },
        onError: (err: any) => toast({
          title: "Could not undo shift",
          description: err?.response?.data?.error || err?.message || "Unknown error",
          variant: "destructive",
        }),
      },
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border rounded-md p-3 bg-amber-50 border-amber-200">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
          <Sparkles className="h-3 w-3 mr-1" /> Recently applied
        </Badge>
        <span className="font-semibold">{touchName}</span>
        <span className="font-mono">{data.from}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono font-semibold">{data.to}</span>
      </div>
      <Button size="sm" variant="outline" onClick={handleClick} disabled={disabled || undo.isPending}>
        {undo.isPending
          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          : <Undo2 className="h-4 w-4 mr-2" />}
        Undo
      </Button>
    </div>
  );
}

interface DateShiftSuggestion {
  touchId: number;
  touchName: string;
  currentSendDate: string;
  proposedSendDate: string;
  projectedExcludedDelta: number;
  projectedExcludedAfter: number;
  rationale: string;
}

export default function PreviewStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: preview, isLoading } = useGetCampaignPreview(campaign.id, {
    query: { queryKey: getGetCampaignPreviewQueryKey(campaign.id), enabled: !!campaign.id }
  });

  const { data: health } = useGetCampaignHealthCheck(campaign.id, {
    query: { queryKey: getGetCampaignHealthCheckQueryKey(campaign.id), enabled: !!campaign.id },
  });

  const finalizeMutation = useFinalizeCampaign();
  const exportMutation = useExportCampaign();
  const { data: settings } = useGetSettings();
  const suggestDateShifts = useAiSuggestDateShifts();
  const applyDateShift = useApplyAiDateShift();

  const [exportResult, setExportResult] = useState<any>(null);
  const [warningAck, setWarningAck] = useState(false);
  const [exportError, setExportError] = useState<{ message: string; findings?: any[] } | null>(null);
  const [shiftPanelOpen, setShiftPanelOpen] = useState(false);
  const [dateShifts, setDateShifts] = useState<{
    suggestions: DateShiftSuggestion[];
    currentExcludedCount: number;
    generatedAt: string;
  } | null>(null);
  const [applyingTouchId, setApplyingTouchId] = useState<number | null>(null);

  const wizardLocked = campaign.status === "finalized" || campaign.status === "exported" || campaign.status === "voided" || campaign.status === "archived";
  // `thresholdFlaggedDonors` is a superset of "excluded under remove rules"
  // (it includes flag-mode conflicts too), so this is a conservative gate:
  // when there are zero flagged donors there can't be anyone to optimize.
  const flaggedCount = preview?.thresholdFlaggedDonors ?? 0;
  const aiPanelEnabled = !!settings?.aiAssistEnabled && !wizardLocked && flaggedCount > 0;
  const undoAffordancesEnabled = !!settings?.aiAssistEnabled && !wizardLocked;

  const fetchDateShifts = () => {
    setShiftPanelOpen(true);
    suggestDateShifts.mutate({ id: campaign.id }, {
      onSuccess: (res) => setDateShifts({
        suggestions: (res.suggestions ?? []) as DateShiftSuggestion[],
        currentExcludedCount: res.currentExcludedCount ?? 0,
        generatedAt: typeof res.generatedAt === "string" ? res.generatedAt : new Date(res.generatedAt as unknown as Date).toISOString(),
      }),
      onError: (err: any) => toast({
        title: "AI suggestion failed",
        description: err?.response?.data?.error || err?.message || "Unknown error",
        variant: "destructive",
      }),
    });
  };

  const handleApplyShift = (s: DateShiftSuggestion) => {
    setApplyingTouchId(s.touchId);
    applyDateShift.mutate(
      { id: campaign.id, touchId: s.touchId, data: { proposedSendDate: s.proposedSendDate } },
      {
        onSuccess: () => {
          toast({ title: "Touch date shifted", description: `${s.touchName}: ${s.currentSendDate} → ${s.proposedSendDate}` });
          queryClient.invalidateQueries({ queryKey: getGetCampaignPreviewQueryKey(campaign.id) });
          queryClient.invalidateQueries({ queryKey: getListTouchesQueryKey(campaign.id) });
          queryClient.invalidateQueries({ queryKey: getListThresholdsQueryKey(campaign.id) });
          queryClient.invalidateQueries({ queryKey: getGetCampaignHealthCheckQueryKey(campaign.id) });
          queryClient.invalidateQueries({ queryKey: getGetLastAiDateShiftQueryKey(campaign.id, s.touchId) });
          // Re-run the suggestion call so the next round shows up automatically.
          suggestDateShifts.mutate({ id: campaign.id }, {
            onSuccess: (res) => setDateShifts({
              suggestions: (res.suggestions ?? []) as DateShiftSuggestion[],
              currentExcludedCount: res.currentExcludedCount ?? 0,
              generatedAt: typeof res.generatedAt === "string" ? res.generatedAt : new Date(res.generatedAt as unknown as Date).toISOString(),
            }),
          });
        },
        onError: (err: any) => toast({
          title: "Could not apply shift",
          description: err?.response?.data?.error || err?.message || "Unknown error",
          variant: "destructive",
        }),
        onSettled: () => setApplyingTouchId(null),
      },
    );
  };

  const hasErrors = health?.status === "error";
  const hasWarnings = health?.status === "warning";

  const buildSummary = (kind: "finalize" | "export"): string => {
    const fileCount = preview?.perTouch?.length ?? 0;
    const totalRows = preview?.totalPlannedTouchpointsAfter ?? 0;
    const audienceUnique = preview?.audienceUnique ?? 0;
    const flagged = preview?.thresholdFlaggedDonors ?? 0;
    const suppressed = preview?.manuallySuppressedDonors ?? 0;
    const seeds = preview?.totalSeedIds ?? 0;
    const action = kind === "finalize" ? "Finalize this campaign?" : "Export this campaign?";
    const consequence = kind === "finalize"
      ? "Finalizing locks the audience, thresholds, and suppressions for this campaign. You can still export afterwards."
      : "Exporting will permanently record these touchpoints in communication history and include them in future threshold checks.";
    return [
      action,
      "",
      `• ${fileCount} touch file(s)`,
      `• ${totalRows.toLocaleString()} total rows in export`,
      `• ${audienceUnique.toLocaleString()} unique constituent(s) in audience`,
      `• ${flagged.toLocaleString()} flagged · ${suppressed.toLocaleString()} suppressed · ${seeds.toLocaleString()} seed(s)`,
      "",
      consequence,
    ].join("\n");
  };

  const handleFinalize = () => {
    if (!confirm(buildSummary("finalize"))) return;
    finalizeMutation.mutate({ id: campaign.id }, {
      onSuccess: () => {
        toast({ title: "Campaign finalized" });
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
      }
    });
  };

  const handleExport = () => {
    if (hasErrors) {
      toast({
        title: "Export blocked",
        description: "Resolve the health-check errors above before exporting.",
        variant: "destructive",
      });
      return;
    }
    if (hasWarnings && !warningAck) {
      toast({
        title: "Acknowledge warnings",
        description: "Please review the health check and tick the acknowledgement before exporting.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(buildSummary("export"))) return;

    setExportError(null);
    exportMutation.mutate({ id: campaign.id }, {
      onSuccess: (result) => {
        toast({ title: "Campaign exported successfully" });
        setExportResult(result);
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
        queryClient.invalidateQueries({ queryKey: getGetCampaignHealthCheckQueryKey(campaign.id) });
      },
      onError: async (err: any) => {
        // Surface server-side health-check block as inline UI, not just a toast.
        let parsed: { error?: string; healthCheck?: { findings?: any[] } } | null = null;
        try {
          if (typeof err?.response?.json === "function") parsed = await err.response.json();
          else if (err?.response?.data) parsed = err.response.data;
        } catch { /* noop */ }
        const message = parsed?.error || err?.message || "Export failed.";
        setExportError({ message, findings: parsed?.healthCheck?.findings });
        queryClient.invalidateQueries({ queryKey: getGetCampaignHealthCheckQueryKey(campaign.id) });
        toast({ title: "Export failed", description: message, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  if (exportResult) {
    return (
      <Card className="border-emerald-200">
        <CardHeader className="bg-emerald-50/50">
          <CardTitle className="text-emerald-800 flex items-center gap-2"><Send className="h-5 w-5" /> Export Complete</CardTitle>
          <CardDescription>Your touchpoint files are ready for download.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exportResult.files.map((f: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{f.fileName}</TableCell>
                  <TableCell className="text-right">{f.rowCount}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" asChild>
                      <a href={f.downloadUrl} download><Download className="h-4 w-4 mr-2"/> Download</a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-6 mt-6 border-t">
            <Button variant="outline" asChild>
              <a
                href={`/api/campaigns/${campaign.id}/export-manifest.csv`}
                download
              >
                <FileText className="h-4 w-4 mr-2" /> Download Export Manifest CSV
              </a>
            </Button>
            <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}`)}>View Campaign Details</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-1 bg-muted/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Audience</p>
            <p className="text-2xl font-bold">{preview?.audienceUnique?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 bg-muted/30 border-amber-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Flagged</p>
            <p className="text-2xl font-bold text-amber-700">{preview?.thresholdFlaggedDonors?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 bg-muted/30 border-blue-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Suppressed</p>
            <p className="text-2xl font-bold text-blue-700">{preview?.manuallySuppressedDonors?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 bg-muted/30 border-emerald-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Seeds</p>
            <p className="text-2xl font-bold text-emerald-700">{preview?.totalSeedIds?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1 bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Total Output</p>
            <p className="text-2xl font-bold text-primary">{preview?.totalPlannedTouchpointsAfter?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Manifest Preview</CardTitle>
          <CardDescription>Review the files that will be generated and their specific row counts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">File</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Send Date</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
                <TableHead className="text-right">Suppressed</TableHead>
                <TableHead className="text-right">Seeds</TableHead>
                <TableHead className="pr-6 text-right font-bold">Final Export</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview?.perTouch.map((t: any) => (
                <TableRow key={t.touchId}>
                  <TableCell className="pl-6 font-mono text-sm">{t.fileName}</TableCell>
                  <TableCell>{t.channelLabel}</TableCell>
                  <TableCell>{format(new Date(t.sendDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">{t.eligibleCount}</TableCell>
                  <TableCell className="text-right text-destructive">{t.suppressedCount > 0 ? `-${t.suppressedCount}` : '0'}</TableCell>
                  <TableCell className="text-right text-emerald-600">{t.seedCount > 0 ? `+${t.seedCount}` : '0'}</TableCell>
                  <TableCell className="pr-6 text-right font-bold">{t.totalRowsInExport}</TableCell>
                </TableRow>
              ))}
              {!preview?.perTouch.length && (
                <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">No touchpoints defined.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <HealthCheckPanel campaignId={campaign.id} />

      {undoAffordancesEnabled && preview?.perTouch && preview.perTouch.length > 0 && (
        <div className="space-y-2">
          {preview.perTouch.map((t: any) => (
            <UndoableShiftRow
              key={t.touchId}
              campaignId={campaign.id}
              touchId={t.touchId}
              touchName={t.touchName ?? t.fileName ?? `Touch #${t.touchId}`}
              disabled={applyingTouchId !== null}
              onUndone={() => {
                queryClient.invalidateQueries({ queryKey: getGetCampaignPreviewQueryKey(campaign.id) });
              }}
            />
          ))}
        </div>
      )}

      {aiPanelEnabled && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> AI Suggestions
              </CardTitle>
              <CardDescription>
                Small touch send-date shifts that may reduce constituents excluded by your threshold rules. Suggestions are advisory; the server recomputes the impact under your own rules before showing them.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchDateShifts}
              disabled={suggestDateShifts.isPending}
            >
              {suggestDateShifts.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Sparkles className="h-4 w-4 mr-2 text-primary" />}
              Suggest date shifts
            </Button>
          </CardHeader>
          {shiftPanelOpen && (
            <CardContent className="space-y-3">
              {suggestDateShifts.isPending && !dateShifts && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Asking the model for candidates…
                </div>
              )}
              {dateShifts && dateShifts.suggestions.length === 0 && (
                <div className="text-sm text-muted-foreground">No suggestions to apply.</div>
              )}
              {dateShifts && dateShifts.suggestions.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Current excluded constituents under your rules: <strong>{dateShifts.currentExcludedCount.toLocaleString()}</strong>
                  </div>
                  {dateShifts.suggestions.map((s) => (
                    <div
                      key={`${s.touchId}-${s.proposedSendDate}`}
                      className="border rounded-md p-4 space-y-2 bg-muted/20"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                            <Sparkles className="h-3 w-3 mr-1" /> AI suggestion
                          </Badge>
                          <span className="font-semibold">{s.touchName}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleApplyShift(s)}
                          disabled={applyingTouchId !== null}
                        >
                          {applyingTouchId === s.touchId
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : null}
                          Apply
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono">{s.currentSendDate}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono font-semibold">{s.proposedSendDate}</span>
                        <span className="text-emerald-700">
                          · drops {s.projectedExcludedDelta.toLocaleString()} excluded
                          {" "}({dateShifts.currentExcludedCount.toLocaleString()} → {s.projectedExcludedAfter.toLocaleString()})
                        </span>
                      </div>
                      {s.rationale && (
                        <div className="text-sm text-muted-foreground">{s.rationale}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {exportError && (
        <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-md flex gap-3 text-destructive" role="alert">
          <AlertOctagon className="h-5 w-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold">{exportError.message}</div>
            {exportError.findings && exportError.findings.length > 0 && (
              <ul className="list-disc pl-5">
                {exportError.findings
                  .filter((f: any) => f.severity === "error")
                  .map((f: any, i: number) => (
                    <li key={i}>{f.message}</li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-md flex gap-3 text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div>
          <strong className="font-semibold">Important:</strong> Exporting this campaign will permanently save these touchpoints as sent/planned communications and include them in future communication volume checks based on the send dates shown.
        </div>
      </div>

      {hasWarnings && (
        <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={warningAck}
            onChange={(e) => setWarningAck(e.target.checked)}
            aria-label="I have reviewed the warnings in the campaign health check"
          />
          <span>
            I have reviewed the <strong>warnings</strong> in the campaign health check and want to export anyway.
          </span>
        </label>
      )}

      <div className="flex justify-between items-center pt-6 border-t mt-6">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=suppressions`)}>Back</Button>
        <div className="flex gap-4">
          <Button variant="secondary" onClick={handleFinalize} disabled={finalizeMutation.isPending || campaign.status === 'finalized' || campaign.status === 'exported'}>
            {finalizeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Mark Finalized
          </Button>
          <Button
            size="lg"
            onClick={handleExport}
            disabled={
              exportMutation.isPending ||
              !preview?.perTouch.length ||
              hasErrors ||
              (hasWarnings && !warningAck)
            }
            title={
              hasErrors
                ? "Resolve health-check errors before exporting."
                : hasWarnings && !warningAck
                  ? "Acknowledge the warnings to enable export."
                  : undefined
            }
          >
            {exportMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} 
            Export Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}
