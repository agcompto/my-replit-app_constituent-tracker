import { useState } from "react";
import {
  useGetTouchDateHistory,
  getGetTouchDateHistoryQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, History, Loader2 } from "lucide-react";
import { format } from "date-fns";

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  manual_edit: { label: "Manual edit", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  ai_applied: { label: "AI shift", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  ai_undone: { label: "AI shift undone", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  manual_undone: { label: "Manual edit undone", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function TouchDateHistoryPopover({
  campaignId,
  touchId,
  touchName,
}: {
  campaignId: number;
  touchId: number;
  touchName: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGetTouchDateHistory(campaignId, touchId, {
    query: {
      queryKey: getGetTouchDateHistoryQueryKey(campaignId, touchId),
      enabled: open,
    },
  });
  const entries = data?.entries ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 ml-1 text-muted-foreground hover:text-foreground"
          title="View send-date history"
          aria-label={`View send-date history for ${touchName}`}
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Send-date history</div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Most recent first</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">{touchName}</div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No date changes recorded for this touch yet.
            </div>
          ) : (
            <ol className="divide-y">
              {entries.map((e, i) => {
                const meta = KIND_LABEL[e.kind] ?? { label: e.kind, cls: "" };
                return (
                  <li key={i} className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(e.at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <span>{e.from}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{e.to}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      by {e.actorName} <span className="opacity-70">({e.actorRole})</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
