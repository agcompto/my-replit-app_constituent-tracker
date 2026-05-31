import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CHANNEL_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

interface ConstituentSummaryProps {
  total: number;
  byChannel: { channelId: number; label: string; count: number; percent: number }[];
  byCampaignType: { campaignTypeId: number; label: string; count: number }[];
  longestGapDays: number | null;
  mostRecentDate: string | null;
  earliestDate: string | null;
  isLoading: boolean;
}

function getChannelColor(channelId: number, allChannelIds: number[]): string {
  const index = allChannelIds.indexOf(channelId);
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

/**
 * Summary cards displayed at the top of Constituent Lookup.
 */
export function ConstituentSummary({
  total,
  byChannel,
  byCampaignType,
  longestGapDays,
  mostRecentDate,
  earliestDate,
  isLoading,
}: ConstituentSummaryProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="pt-4 pb-3">
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const allChannelIds = byChannel.map((channel) => channel.channelId);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold">{total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total touchpoints in range</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1">
            {byChannel.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              byChannel.map((channel) => (
                <div key={channel.channelId} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getChannelColor(channel.channelId, allChannelIds) }}
                  />
                  <span className="truncate flex-1">{channel.label}</span>
                  <span className="font-medium tabular-nums">{channel.count}</span>
                  <span className="text-muted-foreground">({channel.percent}%)</span>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">By channel</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1">
            {byCampaignType.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              byCampaignType.map((campaignType) => (
                <div key={campaignType.campaignTypeId} className="flex items-center gap-1 text-xs">
                  <span className="truncate flex-1">{campaignType.label}</span>
                  <span className="font-medium tabular-nums">{campaignType.count}</span>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">By campaign type</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="space-y-1.5 text-xs">
            {mostRecentDate ? (
              <div>
                <span className="text-muted-foreground">Most recent: </span>
                <span className="font-medium">
                  {format(new Date(`${mostRecentDate}T00:00:00`), "MMM d, yyyy")}
                </span>
              </div>
            ) : null}
            {earliestDate && earliestDate !== mostRecentDate ? (
              <div>
                <span className="text-muted-foreground">Earliest: </span>
                <span className="font-medium">
                  {format(new Date(`${earliestDate}T00:00:00`), "MMM d, yyyy")}
                </span>
              </div>
            ) : null}
            {longestGapDays !== null ? (
              <div>
                <span className="text-muted-foreground">Longest gap: </span>
                <span className="font-medium">{longestGapDays} days</span>
              </div>
            ) : null}
            {!mostRecentDate && longestGapDays === null ? (
              <div className="text-muted-foreground">—</div>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Dates</div>
        </CardContent>
      </Card>
    </div>
  );
}
