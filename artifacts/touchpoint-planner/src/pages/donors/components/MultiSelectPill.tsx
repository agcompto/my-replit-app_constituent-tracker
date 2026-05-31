import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MultiSelectPillProps {
  label: string;
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (next: (string | number)[]) => void;
}

/**
 * Compact multi-select control used by Constituent Lookup filters.
 */
export function MultiSelectPill({ label, options, selected, onChange }: MultiSelectPillProps) {
  const [open, setOpen] = useState(false);

  function toggle(value: string | number) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }

    onChange([...selected, value]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 border-dashed text-sm",
            selected.length > 0 && "border-primary/50 bg-primary/5 text-primary",
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
          {selected.length > 0 ? (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
              {selected.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                active && "font-medium",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
                aria-hidden="true"
              >
                {active ? (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              {option.label}
            </button>
          );
        })}
        {selected.length > 0 ? (
          <>
            <div className="my-1 border-t" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
