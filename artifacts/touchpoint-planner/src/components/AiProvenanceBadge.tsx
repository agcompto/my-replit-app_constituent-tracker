import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  source: string | null | undefined;
  model?: string | null;
  generatedAt?: string | null;
}

/**
 * Small badge that appears next to a touch when it was originally generated
 * by an AI cadence suggestion. Lets reviewers see provenance at a glance.
 */
export function AiProvenanceBadge({ source, model, generatedAt }: Props) {
  if (!source || source === "manual") return null;
  const when = generatedAt ? new Date(generatedAt).toLocaleString() : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-ai-source">
          <Sparkles className="h-3 w-3" aria-hidden />
          <span>AI-suggested</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          {model ? <div><span className="text-muted-foreground">Model:</span> {model}</div> : null}
          {when ? <div><span className="text-muted-foreground">Generated:</span> {when}</div> : null}
          <div className="text-muted-foreground mt-1">A staff member accepted this AI suggestion.</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
