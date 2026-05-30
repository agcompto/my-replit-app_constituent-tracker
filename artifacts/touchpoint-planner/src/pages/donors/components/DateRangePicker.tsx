import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "../shared-types";

interface DateRangePickerProps {
  range: DateRange;
  onSelect: (range: DateRange) => void;
}

/**
 * Date range picker used by Constituent Lookup filters.
 */
export function DateRangePicker({ range, onSelect }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const label = range.from && range.to
    ? `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
    : range.from
      ? `From ${format(range.from, "MMM d, yyyy")}`
      : "Pick custom range";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
          <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={{ from: range.from, to: range.to }}
          onSelect={(selectedRange) => {
            if (selectedRange) onSelect({ from: selectedRange.from, to: selectedRange.to });
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
