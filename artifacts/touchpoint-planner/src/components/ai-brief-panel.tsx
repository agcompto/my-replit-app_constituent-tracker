import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { useAiCampaignBrief } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PiiWarning } from "@/components/ui/PiiWarning";

export interface BriefExtraction {
  name: string;
  owningUnit: string | null;
  intendedSendStartDate: string | null;
  campaignTypeIds: number[];
  campaignTypeMatches: { id: number; name: string; confidence: number }[];
  owningUnitMatch: { name: string; confidence: number } | null;
  touches: { order: number; channelLabel: string; dayOffset: number; purpose: string }[];
  notes: string;
}

interface AiBriefPanelProps {
  onApply: (extraction: BriefExtraction) => void;
}

export function AiBriefPanel({ onApply }: AiBriefPanelProps) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<BriefExtraction | null>(null);
  const briefMutation = useAiCampaignBrief();
  const { toast } = useToast();

  const handleGenerate = () => {
    if (brief.trim().length < 10) {
      toast({ title: "Add a bit more detail", description: "Describe the campaign in at least a couple of sentences.", variant: "destructive" });
      return;
    }
    briefMutation.mutate({ data: { brief } }, {
      onSuccess: (data) => {
        setResult(data as BriefExtraction);
      },
      onError: (err: any) => {
        const code = err?.response?.status;
        const msg = err?.response?.data?.error || String(err?.message ?? err);
        toast({
          title: code === 422 ? "Brief contains PII" : code === 403 ? "AI assist disabled" : "Could not extract from brief",
          description: msg,
          variant: "destructive",
        });
      },
    });
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result);
    toast({ title: "Brief applied", description: "Review the populated fields before saving." });
    setOpen(false);
    setResult(null);
    setBrief("");
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-between w-full text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate from brief
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Paste a short brief (goals, audience description, intended timing). The assistant will draft a name, suggest matching types and owning unit, and propose a touch cadence — you review before saving. <strong>Do not include constituent names, IDs, emails, phone numbers, or other PII.</strong>
            </p>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={5}
              placeholder="e.g. End-of-fiscal-year giving push for College of Engineering alumni who gave in FY24. Want to launch around June 1 with three touches: an email, a follow-up email a week later, and a phone outreach for the top tier."
              className="text-sm"
            />
            <PiiWarning text={brief} />

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={handleGenerate} disabled={briefMutation.isPending}>
                {briefMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate
              </Button>
              {result && (
                <Button type="button" size="sm" variant="secondary" onClick={() => { setResult(null); }}>
                  Discard suggestion
                </Button>
              )}
            </div>

            {result && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                <div className="font-medium">Draft</div>
                <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd>{result.name || <span className="text-muted-foreground italic">(not extracted)</span>}</dd>

                  <dt className="text-muted-foreground">Owning unit</dt>
                  <dd>
                    {result.owningUnitMatch ? (
                      <>{result.owningUnitMatch.name} <span className="text-muted-foreground">({Math.round(result.owningUnitMatch.confidence * 100)}% match)</span></>
                    ) : (
                      <span className="text-muted-foreground italic">(none matched)</span>
                    )}
                  </dd>

                  <dt className="text-muted-foreground">Intended start</dt>
                  <dd>{result.intendedSendStartDate ?? <span className="text-muted-foreground italic">(not extracted)</span>}</dd>

                  <dt className="text-muted-foreground">Types</dt>
                  <dd>
                    {result.campaignTypeMatches.length === 0
                      ? <span className="text-muted-foreground italic">(none matched)</span>
                      : result.campaignTypeMatches.map((m) => (
                          <span key={m.id} className="inline-block mr-2 mb-1 px-2 py-0.5 bg-background border rounded">
                            {m.name} <span className="text-muted-foreground">({Math.round(m.confidence * 100)}%)</span>
                          </span>
                        ))}
                  </dd>

                  <dt className="text-muted-foreground">Touch cadence</dt>
                  <dd>
                    {result.touches.length === 0
                      ? <span className="text-muted-foreground italic">(none suggested)</span>
                      : (
                        <ul className="space-y-1">
                          {result.touches.map((t, i) => (
                            <li key={i}>
                              <strong>#{t.order}</strong> · {t.channelLabel} · day +{t.dayOffset}
                              {t.purpose && <> · <span className="text-muted-foreground">{t.purpose}</span></>}
                            </li>
                          ))}
                        </ul>
                      )}
                  </dd>
                </dl>
                {result.notes && <p className="text-xs text-muted-foreground italic">Note: {result.notes}</p>}
                <p className="text-xs text-muted-foreground">
                  Touch cadence is shown for reference only — apply will populate the campaign fields below; you can add the suggested touches on the Touches step.
                </p>
                <div>
                  <Button type="button" size="sm" onClick={handleApply}>Apply to form</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
