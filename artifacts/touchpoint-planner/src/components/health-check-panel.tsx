import { useGetCampaignHealthCheck, getGetCampaignHealthCheckQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, Loader2, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Severity = "info" | "warning" | "error";

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

function severityIcon(sev: Severity) {
  if (sev === "error")
    return <AlertOctagon className="h-4 w-4 text-destructive shrink-0" aria-hidden />;
  if (sev === "warning")
    return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />;
  return <Info className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />;
}

function severityRowClass(sev: Severity) {
  if (sev === "error") return "border-destructive/30 bg-destructive/5";
  if (sev === "warning") return "border-amber-300 bg-amber-50/60";
  return "border-blue-200 bg-blue-50/40";
}

function StatusPill({ status }: { status: "pass" | "warning" | "error" }) {
  if (status === "error") {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300" aria-label="Health check status: errors">
        <AlertOctagon className="h-3 w-3 mr-1" /> Errors block export
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300" aria-label="Health check status: warnings">
        <AlertTriangle className="h-3 w-3 mr-1" /> Warnings to review
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300" aria-label="Health check status: passed">
      <CheckCircle2 className="h-3 w-3 mr-1" /> Healthy
    </Badge>
  );
}

export function HealthCheckPanel({ campaignId }: { campaignId: number }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useGetCampaignHealthCheck(campaignId, {
    query: { queryKey: getGetCampaignHealthCheckQueryKey(campaignId), enabled: !!campaignId },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetCampaignHealthCheckQueryKey(campaignId) });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            Campaign Health Check
            {data && <StatusPill status={data.status as "pass" | "warning" | "error"} />}
          </CardTitle>
          <CardDescription>
            Errors must be cleared before this campaign can be exported. Warnings should be reviewed.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isFetching}
          aria-label="Re-run health check"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="flex h-20 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : data.findings.length === 0 ? (
          <div className="text-sm text-muted-foreground">No findings recorded.</div>
        ) : (
          <ul className="space-y-2" role="list">
            {data.findings.map((f, i) => (
              <li
                key={`${f.code}-${i}`}
                className={`flex gap-3 rounded-md border p-3 ${severityRowClass(f.severity as Severity)}`}
              >
                {severityIcon(f.severity as Severity)}
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    <span className="sr-only">{SEVERITY_LABEL[f.severity as Severity]}: </span>
                    {f.message}
                  </div>
                  {f.recommendation && (
                    <div className="text-muted-foreground text-xs">{f.recommendation}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
