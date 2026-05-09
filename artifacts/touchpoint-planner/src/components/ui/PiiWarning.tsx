import { hasPiiPatterns } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export function PiiWarning({ text, className }: { text: string, className?: string }) {
  if (!hasPiiPatterns(text)) return null;
  
  return (
    <div className={`mt-2 flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-2.5 rounded-md border border-amber-200 ${className || ''}`}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        <strong>Potential PII detected.</strong> Please avoid entering names, phone numbers, email addresses, or other unnecessary PII. This system should use Donor ID only.
      </p>
    </div>
  );
}
