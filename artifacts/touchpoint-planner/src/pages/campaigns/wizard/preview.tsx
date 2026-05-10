import { useGetCampaignPreview, useFinalizeCampaign, useExportCampaign, getGetCampaignQueryKey, getGetCampaignPreviewQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertTriangle, Send } from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";

export default function PreviewStep({ campaign }: { campaign: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: preview, isLoading } = useGetCampaignPreview(campaign.id, {
    query: { queryKey: getGetCampaignPreviewQueryKey(campaign.id), enabled: !!campaign.id }
  });

  const finalizeMutation = useFinalizeCampaign();
  const exportMutation = useExportCampaign();
  
  const [exportResult, setExportResult] = useState<any>(null);

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
      `• ${audienceUnique.toLocaleString()} unique donor(s) in audience`,
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
    if (!confirm(buildSummary("export"))) return;

    exportMutation.mutate({ id: campaign.id }, {
      onSuccess: (result) => {
        toast({ title: "Campaign exported successfully" });
        setExportResult(result);
        queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
      }
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
          
          <div className="flex justify-end pt-6 mt-6 border-t">
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

      <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-md flex gap-3 text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div>
          <strong className="font-semibold">Important:</strong> Exporting this campaign will permanently save these touchpoints as sent/planned communications and include them in future communication volume checks based on the send dates shown.
        </div>
      </div>

      <div className="flex justify-between items-center pt-6 border-t mt-6">
        <Button variant="outline" onClick={() => setLocation(`/campaigns/${campaign.id}/edit?step=suppressions`)}>Back</Button>
        <div className="flex gap-4">
          <Button variant="secondary" onClick={handleFinalize} disabled={finalizeMutation.isPending || campaign.status === 'finalized' || campaign.status === 'exported'}>
            {finalizeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Mark Finalized
          </Button>
          <Button size="lg" onClick={handleExport} disabled={exportMutation.isPending || !preview?.perTouch.length}>
            {exportMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} 
            Export Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}
