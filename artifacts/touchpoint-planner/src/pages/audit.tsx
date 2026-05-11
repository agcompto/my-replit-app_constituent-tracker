import { useState } from "react";
import { useGetAuditLog } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

type AuditFilters = {
  actor?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
};

function hasAny(f: AuditFilters): boolean {
  return !!(f.actor || f.action || f.entityType || f.startDate || f.endDate);
}

export default function Audit() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const { data: auditLogs, isLoading } = useGetAuditLog(filters);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">System-wide record of critical actions.</p>
      </div>

      <div className="rounded-md border bg-card p-4 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-actor">Actor name</Label>
          <Input
            id="audit-actor"
            placeholder="any"
            value={filters.actor ?? ""}
            onChange={(e) => setFilters({ ...filters, actor: e.target.value || undefined })}
            className="w-[180px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            placeholder="e.g. login, export"
            value={filters.action ?? ""}
            onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined })}
            className="w-[180px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-entity">Entity type</Label>
          <Input
            id="audit-entity"
            placeholder="e.g. user, campaign"
            value={filters.entityType ?? ""}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined })}
            className="w-[180px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-start">Start date</Label>
          <Input
            id="audit-start"
            type="date"
            max={filters.endDate}
            value={filters.startDate ?? ""}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value || undefined })}
            className="w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground" htmlFor="audit-end">End date</Label>
          <Input
            id="audit-end"
            type="date"
            min={filters.startDate}
            value={filters.endDate ?? ""}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value || undefined })}
            className="w-[160px]"
          />
        </div>
        {hasAny(filters) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="self-end">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="pr-6">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} aria-hidden>
                    <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="h-4 w-40" /></TableCell>
                  </TableRow>
                ))
              ) : auditLogs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No audit records match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                auditLogs?.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="pl-6 whitespace-nowrap text-muted-foreground text-sm">
                      {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{log.actorName}</TableCell>
                    <TableCell>
                      {log.actorRole && <Badge variant="outline" className="text-[10px] uppercase">{log.actorRole.replace('_', ' ')}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.entityType} {log.entityId ? `#${log.entityId}` : ''}
                    </TableCell>
                    <TableCell className="pr-6 text-sm text-muted-foreground max-w-md truncate" title={log.details || ""}>
                      {log.details || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
