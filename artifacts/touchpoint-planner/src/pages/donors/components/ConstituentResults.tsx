import { format } from "date-fns";
import { AlertCircle, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ChevronsUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TouchDateHistoryPopover } from "@/components/touch-date-history-popover";
import { cn } from "@/lib/utils";
import type { ConstituentSortState, SortCol, TouchpointRow } from "../shared-types";

interface ConstituentResultsProps {
  activeConstituentId: string;
  csvUrl: string | null;
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  hasFilters: boolean;
  rows: TouchpointRow[];
  sortedCount: number;
  page: number;
  totalPages: number;
  pageSize: number;
  highlightedIndex: number | null;
  sort: ConstituentSortState;
  rowRefs: React.MutableRefObject<Map<number, HTMLTableRowElement>>;
  onSort: (col: SortCol) => void;
  onClearFilters: () => void;
  onWidenToAllTime: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

function SortIcon({ col, sort }: { col: SortCol; sort: ConstituentSortState }) {
  if (sort.col !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
  return sort.dir === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
}

/**
 * Results table for Constituent Lookup touchpoints.
 */
export function ConstituentResults({
  activeConstituentId,
  csvUrl,
  isLoading,
  error,
  isEmpty,
  hasFilters,
  rows,
  sortedCount,
  page,
  totalPages,
  pageSize,
  highlightedIndex,
  sort,
  rowRefs,
  onSort,
  onClearFilters,
  onWidenToAllTime,
  onPreviousPage,
  onNextPage,
}: ConstituentResultsProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>
            Touchpoints for{" "}
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary">
              {activeConstituentId}
            </span>
          </CardTitle>
          {csvUrl && rows.length > 0 ? (
            <a href={csvUrl} download={`constituent_${activeConstituentId}_touchpoints.csv`}>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                <Download className="h-3 w-3" aria-hidden="true" /> CSV
              </Button>
            </a>
          ) : null}
        </div>
      </CardHeader>

      <div className="overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("channelLabel")}>
                <span className="flex items-center">Channel <SortIcon col="channelLabel" sort={sort} /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("campaignTypeLabel")}>
                <span className="flex items-center">Campaign Type <SortIcon col="campaignTypeLabel" sort={sort} /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort("sendDate")}>
                <span className="flex items-center">Send Date <SortIcon col="sendDate" sort={sort} /></span>
              </TableHead>
              <TableHead>Threshold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`sk-${index}`} aria-hidden>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  </TableRow>
                ))
              : null}

            {error ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-destructive">
                  Failed to load constituent data.
                </TableCell>
              </TableRow>
            ) : null}

            {isEmpty ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 opacity-30" aria-hidden="true" />
                    <div className="text-sm font-medium">No touchpoints in this range</div>
                    <p className="text-xs max-w-xs">
                      No communications match the active filters. Try clearing filters or widening the date range.
                    </p>
                    <div className="flex gap-2 mt-1">
                      {hasFilters ? (
                        <Button variant="outline" size="sm" onClick={onClearFilters}>Clear filters</Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={onWidenToAllTime}>Widen to all time</Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {rows.map((touchpoint, pageIndex) => {
              const globalSortedIndex = (page - 1) * pageSize + pageIndex;
              const isHighlighted = highlightedIndex === globalSortedIndex;
              return (
                <TableRow
                  key={`${touchpoint.campaignId}-${touchpoint.touchId}-${touchpoint.sendDate}`}
                  ref={(element) => {
                    if (element) rowRefs.current.set(globalSortedIndex, element);
                    else rowRefs.current.delete(globalSortedIndex);
                  }}
                  className={cn(isHighlighted && "bg-primary/5 outline outline-1 outline-primary/30")}
                >
                  <TableCell className="font-medium">{touchpoint.campaignName}</TableCell>
                  <TableCell><StatusBadge status={touchpoint.campaignStatus} /></TableCell>
                  <TableCell>{touchpoint.channelLabel}</TableCell>
                  <TableCell>{touchpoint.campaignTypeLabel}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span>{format(new Date(`${touchpoint.sendDate}T00:00:00`), "MMM d, yyyy")}</span>
                      <TouchDateHistoryPopover
                        campaignId={touchpoint.campaignId}
                        touchId={touchpoint.touchId}
                        touchName={touchpoint.campaignName}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {touchpoint.countsTowardThreshold ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Yes</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">No</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedCount)} of {sortedCount}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={onPreviousPage}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <span className="text-xs">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={onNextPage}>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
