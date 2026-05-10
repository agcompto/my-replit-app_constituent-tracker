import { useListChannels, useListOwningUnits } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type ReportFilters = {
  owningUnit?: string;
  channelId?: number;
  startDate?: string;
  endDate?: string;
};

export const ALL_VALUE = "__all__";

export function emptyFilters(): ReportFilters {
  return {};
}

export function hasAnyFilter(f: ReportFilters): boolean {
  return !!(f.owningUnit || f.channelId !== undefined || f.startDate || f.endDate);
}

export function ReportsFilterBar({
  value,
  onChange,
}: {
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
}) {
  const { data: owningUnits } = useListOwningUnits();
  const { data: channels } = useListChannels();
  const activeUnits = (owningUnits || []).filter((u) => u.active);
  const activeChannels = (channels || []).filter((c) => c.active);

  return (
    <div className="rounded-md border bg-card p-4 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <Label className="text-xs text-muted-foreground">Owning Unit</Label>
        <Select
          value={value.owningUnit ?? ALL_VALUE}
          onValueChange={(v) => onChange({ ...value, owningUnit: v === ALL_VALUE ? undefined : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All units</SelectItem>
            {activeUnits.map((u) => (
              <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <Label className="text-xs text-muted-foreground">Channel</Label>
        <Select
          value={value.channelId === undefined ? ALL_VALUE : String(value.channelId)}
          onValueChange={(v) =>
            onChange({ ...value, channelId: v === ALL_VALUE ? undefined : Number(v) })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All channels</SelectItem>
            {activeChannels.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Start date</Label>
        <Input
          type="date"
          value={value.startDate ?? ""}
          max={value.endDate}
          onChange={(e) => onChange({ ...value, startDate: e.target.value || undefined })}
          className="w-[160px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">End date</Label>
        <Input
          type="date"
          value={value.endDate ?? ""}
          min={value.startDate}
          onChange={(e) => onChange({ ...value, endDate: e.target.value || undefined })}
          className="w-[160px]"
        />
      </div>

      {hasAnyFilter(value) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="self-end">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
