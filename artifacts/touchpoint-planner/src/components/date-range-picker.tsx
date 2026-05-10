import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";

export type DateRange = { startDate?: string; endDate?: string };

export type ShortcutKey =
  | "fy"
  | "next30"
  | "next60"
  | "rolling12"
  | "all"
  | "custom";

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  fiscalYearStartMonth?: number; // 1-12, default 7
  fiscalYearStartDay?: number; // 1-31, default 1
  className?: string;
  align?: "start" | "end";
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fiscalYearRange(fyMonth: number, fyDay: number, today: Date): DateRange {
  const y = today.getFullYear();
  // Try this calendar year's FY start; if today is before it, use last year.
  const thisYearStart = new Date(y, fyMonth - 1, fyDay);
  const start = today < thisYearStart ? new Date(y - 1, fyMonth - 1, fyDay) : thisYearStart;
  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
  return { startDate: iso(start), endDate: iso(end) };
}

function nextNDays(n: number, today: Date): DateRange {
  const start = today;
  const end = new Date(today);
  end.setDate(end.getDate() + n);
  return { startDate: iso(start), endDate: iso(end) };
}

function rolling12(today: Date): DateRange {
  const end = today;
  const start = new Date(today);
  start.setMonth(start.getMonth() - 12);
  return { startDate: iso(start), endDate: iso(end) };
}

function detectShortcut(
  value: DateRange,
  fyMonth: number,
  fyDay: number,
  today: Date,
): ShortcutKey {
  if (!value.startDate && !value.endDate) return "all";
  const fy = fiscalYearRange(fyMonth, fyDay, today);
  if (value.startDate === fy.startDate && value.endDate === fy.endDate) return "fy";
  const r12 = rolling12(today);
  if (value.startDate === r12.startDate && value.endDate === r12.endDate) return "rolling12";
  const n30 = nextNDays(30, today);
  if (value.startDate === n30.startDate && value.endDate === n30.endDate) return "next30";
  const n60 = nextNDays(60, today);
  if (value.startDate === n60.startDate && value.endDate === n60.endDate) return "next60";
  return "custom";
}

function labelFor(value: DateRange, key: ShortcutKey): string {
  const fmt = (s?: string) => (s ? format(new Date(s + "T00:00:00"), "MMM d, yyyy") : "");
  switch (key) {
    case "all":
      return "All time";
    case "fy":
      return "This Fiscal Year";
    case "rolling12":
      return "Rolling 12 Months";
    case "next30":
      return "Next 30 Days";
    case "next60":
      return "Next 60 Days";
    case "custom":
      if (value.startDate && value.endDate) return `${fmt(value.startDate)} – ${fmt(value.endDate)}`;
      if (value.startDate) return `From ${fmt(value.startDate)}`;
      if (value.endDate) return `Through ${fmt(value.endDate)}`;
      return "Custom range";
  }
}

const SHORTCUTS: { key: ShortcutKey; label: string }[] = [
  { key: "fy", label: "This Fiscal Year" },
  { key: "next30", label: "Next 30 Days" },
  { key: "next60", label: "Next 60 Days" },
  { key: "rolling12", label: "Rolling 12 Months" },
  { key: "all", label: "All Time" },
];

export function DateRangePicker({
  value,
  onChange,
  fiscalYearStartMonth = 7,
  fiscalYearStartDay = 1,
  className = "",
  align = "start",
}: Props) {
  const today = useMemo(() => new Date(), []);
  const detected = detectShortcut(value, fiscalYearStartMonth, fiscalYearStartDay, today);
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.startDate ?? "");
  const [draftEnd, setDraftEnd] = useState(value.endDate ?? "");

  useEffect(() => {
    setDraftStart(value.startDate ?? "");
    setDraftEnd(value.endDate ?? "");
  }, [value.startDate, value.endDate]);

  const apply = (key: ShortcutKey) => {
    if (key === "all") {
      onChange({});
      setOpen(false);
      return;
    }
    if (key === "custom") return; // wait for explicit Apply
    const today = new Date();
    if (key === "fy") onChange(fiscalYearRange(fiscalYearStartMonth, fiscalYearStartDay, today));
    if (key === "rolling12") onChange(rolling12(today));
    if (key === "next30") onChange(nextNDays(30, today));
    if (key === "next60") onChange(nextNDays(60, today));
    setOpen(false);
  };

  const applyCustom = () => {
    onChange({
      startDate: draftStart || undefined,
      endDate: draftEnd || undefined,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-between font-normal ${className}`}
          aria-label="Select date range"
        >
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 opacity-70" />
            {labelFor(value, detected)}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align={align}>
        <div className="space-y-1">
          {SHORTCUTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => apply(s.key)}
              className={`w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-muted transition ${
                detected === s.key ? "bg-muted font-medium" : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 border-t pt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Custom range</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="dr-start" className="text-xs">Start</Label>
              <Input
                id="dr-start"
                type="date"
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(e) => setDraftStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dr-end" className="text-xs">End</Label>
              <Input
                id="dr-end"
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftStart("");
                setDraftEnd("");
                onChange({});
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={applyCustom} disabled={!draftStart && !draftEnd}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
