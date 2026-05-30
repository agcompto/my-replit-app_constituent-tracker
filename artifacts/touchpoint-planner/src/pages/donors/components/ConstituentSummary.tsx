import type { ReactNode } from "react";

export interface ConstituentSummaryItem {
  label: string;
  value: string | number;
  helperText?: string;
}

interface ConstituentSummaryProps {
  title?: string;
  items: ConstituentSummaryItem[];
  actions?: ReactNode;
}

/**
 * Summary cards displayed at the top of Constituent Lookup.
 * Initial extraction to reduce page complexity.
 */
export function ConstituentSummary({
  title = "Constituent Summary",
  items,
  actions,
}: ConstituentSummaryProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">{item.label}</div>
            <div className="mt-2 text-2xl font-bold">{item.value}</div>
            {item.helperText ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {item.helperText}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
