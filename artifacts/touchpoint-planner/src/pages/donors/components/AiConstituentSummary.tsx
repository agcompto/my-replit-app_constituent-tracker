import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AiConstituentSummaryResponse {
  generatedAt: string;
  summary: string;
  risks: string[];
  recommendations: string[];
}

interface AiConstituentSummaryProps {
  constituentId: string;
  queryString?: string;
  disabled?: boolean;
}

async function generateAiConstituentSummary(
  constituentId: string,
  queryString?: string,
): Promise<AiConstituentSummaryResponse> {
  const suffix = queryString ? `?${queryString.replace(/^\?/, "")}` : "";
  return customFetch<AiConstituentSummaryResponse>(
    `/api/donors/${encodeURIComponent(constituentId)}/ai/summary${suffix}`,
    { method: "POST", responseType: "json" },
  );
}

/**
 * User-visible AI summary panel for Constituent Lookup.
 *
 * The backend enforces AI enablement, rate limits, token budgets, audit logging,
 * and PII safeguards. The frontend only sends the active filter query string.
 */
export function AiConstituentSummary({
  constituentId,
  queryString,
  disabled,
}: AiConstituentSummaryProps) {
  const mutation = useMutation({
    mutationFn: () => generateAiConstituentSummary(constituentId, queryString),
  });

  const result = mutation.data;
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              AI Constituent Summary
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Summarizes communication patterns, risks, and recommended next actions from the active filters.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || mutation.isPending || !constituentId}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {result ? "Regenerate" : "Generate AI Summary"}
          </Button>
        </div>
      </CardHeader>

      {(errorMessage || result) ? (
        <CardContent className="space-y-4 pt-0">
          {errorMessage ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-medium">AI summary failed</div>
                <div className="text-xs">{errorMessage}</div>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Communication Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
              </div>

              {result.risks.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold">Communication Risks</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {result.risks.map((risk, index) => (
                      <li key={`${risk}-${index}`}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.recommendations.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold">Recommended Next Actions</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {result.recommendations.map((recommendation, index) => (
                      <li key={`${recommendation}-${index}`}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="text-[11px] text-muted-foreground">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
