import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { useAiSuggestOverrideReason } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  campaignId: number;
  thresholdId: number;
  projectedCount: number;
  ariaLabel?: string;
}

export function AiSuggestReasonPopover({ campaignId, thresholdId, projectedCount, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const mutation = useAiSuggestOverrideReason();
  const { toast } = useToast();

  useEffect(() => { if (!open) { setCopied(false); } }, [open]);

  const handleGenerate = () => {
    setReason("");
    setEdited(false);
    setCopied(false);
    mutation.mutate(
      { id: campaignId, data: { thresholdId, projectedCount } },
      {
        onSuccess: (data) => { setReason(data.reason); setEdited(false); },
        onError: (err: any) => {
          const code = err?.response?.status;
          const msg = err?.response?.data?.error || String(err?.message ?? err);
          toast({
            title: code === 403 ? "AI assist disabled" : code === 429 ? "AI rate limit" : "Could not generate suggestion",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCopy = async () => {
    if (!reason) return;
    try {
      await navigator.clipboard.writeText(reason);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Select the text manually instead.", variant: "destructive" });
    }
  };

  const hasReason = reason.length > 0;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && !hasReason && !mutation.isPending) handleGenerate(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary hover:text-primary"
          title="Suggest override reason"
          aria-label={ariaLabel ?? "Suggest override reason"}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2" align="end">
        <div className="text-xs font-medium">Suggested override reason</div>
        {mutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Generating...
          </div>
        )}
        {hasReason && (
          <>
            <Textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setEdited(true); setCopied(false); }}
              rows={4}
              className="text-sm"
              aria-label="Override reason"
            />
            <p className="text-[11px] text-muted-foreground">
              {edited ? "Edited locally — copy to use it." : "A starting point — edit and add specific business context before recording it."}
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleGenerate} disabled={mutation.isPending}>
                Regenerate
              </Button>
            </div>
          </>
        )}
        {!mutation.isPending && !hasReason && (
          <Button type="button" size="sm" onClick={handleGenerate}>Generate</Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
