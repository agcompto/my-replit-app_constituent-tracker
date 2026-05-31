import { useMemo, useRef, useState } from "react";
import type { TouchpointRow } from "../shared-types";

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

interface ConstituentTimelineProps {
  touchpoints: TouchpointRow[];
  highlightedIndex: number | null;
  onPointClick: (index: number) => void;
}

function getChannelColor(channelId: number, allChannelIds: number[]): string {
  const index = allChannelIds.indexOf(channelId);
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

/**
 * Timeline visualization for constituent touch history.
 */
export function ConstituentTimeline({
  touchpoints,
  highlightedIndex,
  onPointClick,
}: ConstituentTimelineProps) {
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allChannelIds = useMemo(
    () => Array.from(new Set(touchpoints.map((touchpoint) => touchpoint.channelId))),
    [touchpoints],
  );

  if (touchpoints.length === 0) return null;

  const dates = touchpoints.map((touchpoint) => new Date(`${touchpoint.sendDate}T00:00:00`).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const span = maxDate - minDate || 1;

  const width = 800;
  const height = 36;
  const dotRadius = 5;
  const padding = 12;
  const usableWidth = width - padding * 2;

  function dateToX(timestamp: number): number {
    return padding + ((timestamp - minDate) / span) * usableWidth;
  }

  const currentTooltip = tooltip ? touchpoints[tooltip.index] : null;

  return (
    <div className="relative" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded border bg-muted/20"
        style={{ height: 44 }}
        onMouseLeave={() => setTooltip(null)}
        role="img"
        aria-label="Constituent touchpoint timeline"
      >
        <line
          x1={padding}
          y1={height / 2}
          x2={width - padding}
          y2={height / 2}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        {touchpoints.map((touchpoint, index) => {
          const timestamp = new Date(`${touchpoint.sendDate}T00:00:00`).getTime();
          const x = dateToX(timestamp);
          const color = getChannelColor(touchpoint.channelId, allChannelIds);
          const isHighlighted = highlightedIndex === index;

          return (
            <circle
              key={`${touchpoint.touchId}-${index}`}
              cx={x}
              cy={height / 2}
              r={isHighlighted ? dotRadius + 2 : dotRadius}
              fill={color}
              stroke={isHighlighted ? "#111" : "white"}
              strokeWidth={isHighlighted ? 2 : 1}
              className="cursor-pointer transition-all"
              onMouseEnter={(event) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                  setTooltip({ index, x: event.clientX - rect.left, y: event.clientY - rect.top });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => onPointClick(index)}
            />
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{new Date(minDate).toLocaleDateString()}</span>
        <span>{new Date(maxDate).toLocaleDateString()}</span>
      </div>

      {tooltip && currentTooltip ? (
        <div
          className="pointer-events-none absolute z-10 rounded border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: tooltip.x + 8, top: tooltip.y + 8 }}
        >
          <div className="font-medium">{currentTooltip.campaignName}</div>
          <div className="text-muted-foreground">
            {currentTooltip.channelLabel} • {currentTooltip.sendDate}
          </div>
        </div>
      ) : null}
    </div>
  );
}
