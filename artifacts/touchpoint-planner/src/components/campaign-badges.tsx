import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Sparkles,
  Columns3,
  Copy,
  Filter,
  Send,
  Archive,
  Ban,
  Eye,
  CircleDashed,
} from "lucide-react";

export type BadgeFields = {
  status: string;
  rejectedIdCount?: number;
  duplicateIdCount?: number;
  extraColumnsIgnored?: boolean;
  suppressionCount?: number;
  seedCount?: number;
  lastHealthCheckStatus?: string | null;
};

type BadgeSpec = {
  key: string;
  label: string;
  icon: React.ReactNode;
  className: string;
  title?: string;
};

function specsFor(c: BadgeFields): BadgeSpec[] {
  const out: BadgeSpec[] = [];
  const status = (c.status || "").toLowerCase();

  // Lifecycle / status
  if (status === "exported") {
    out.push({
      key: "exported",
      label: "Exported / Sent",
      icon: <Send className="h-3 w-3 mr-1" />,
      className: "bg-primary/10 text-primary border-primary/30",
    });
  } else if (status === "finalized") {
    out.push({
      key: "finalized",
      label: "Finalized",
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    });
  } else if (status === "previewed") {
    out.push({
      key: "previewed",
      label: "Previewed",
      icon: <Eye className="h-3 w-3 mr-1" />,
      className: "bg-purple-50 text-purple-700 border-purple-200",
    });
  } else if (status === "uploaded") {
    out.push({
      key: "uploaded",
      label: "Audience Uploaded",
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      className: "bg-blue-50 text-blue-700 border-blue-200",
    });
  } else if (status === "draft") {
    out.push({
      key: "draft",
      label: "Draft",
      icon: <CircleDashed className="h-3 w-3 mr-1" />,
      className: "bg-gray-50 text-gray-700 border-gray-200",
    });
  } else if (status === "archived") {
    out.push({
      key: "archived",
      label: "Archived",
      icon: <Archive className="h-3 w-3 mr-1" />,
      className: "bg-gray-100 text-gray-600 border-gray-200",
    });
  } else if (status === "voided") {
    out.push({
      key: "voided",
      label: "Voided",
      icon: <Ban className="h-3 w-3 mr-1" />,
      className: "bg-red-50 text-red-700 border-red-200",
    });
  }

  // Health check
  const hc = c.lastHealthCheckStatus;
  if (hc === "pass") {
    out.push({
      key: "hc-pass",
      label: "Health Pass",
      icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      title: "Last health check at export time: pass",
    });
  } else if (hc === "warning") {
    out.push({
      key: "hc-warn",
      label: "Health Warnings",
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
      className: "bg-amber-50 text-amber-700 border-amber-300",
      title: "Last health check: warnings to review",
    });
  } else if (hc === "error") {
    out.push({
      key: "hc-err",
      label: "Health Errors",
      icon: <AlertOctagon className="h-3 w-3 mr-1" />,
      className: "bg-red-50 text-red-700 border-red-300",
      title: "Last health check: errors blocking export",
    });
  }

  // Upload signals
  if ((c.rejectedIdCount ?? 0) > 0) {
    out.push({
      key: "rejected",
      label: `${c.rejectedIdCount} Rejected`,
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
      className: "bg-amber-50 text-amber-700 border-amber-200",
      title: "Rejected constituent IDs in the upload",
    });
  }
  if ((c.duplicateIdCount ?? 0) > 0) {
    out.push({
      key: "duplicates",
      label: `${c.duplicateIdCount} Duplicates`,
      icon: <Copy className="h-3 w-3 mr-1" />,
      className: "bg-slate-50 text-slate-700 border-slate-200",
      title: "Duplicate IDs were collapsed during upload",
    });
  }
  if (c.extraColumnsIgnored) {
    out.push({
      key: "extra-cols",
      label: "Extra Columns Ignored",
      icon: <Columns3 className="h-3 w-3 mr-1" />,
      className: "bg-slate-50 text-slate-700 border-slate-200",
      title: "Only the donor-ID column was used from the upload",
    });
  }

  // Suppressions / seeds
  if ((c.suppressionCount ?? 0) > 0) {
    out.push({
      key: "suppressions",
      label: `${c.suppressionCount} Suppression${c.suppressionCount === 1 ? "" : "s"}`,
      icon: <ShieldAlert className="h-3 w-3 mr-1" />,
      className: "bg-blue-50 text-blue-700 border-blue-200",
    });
  }
  if ((c.seedCount ?? 0) > 0) {
    out.push({
      key: "seeds",
      label: `${c.seedCount} Seed Group${c.seedCount === 1 ? "" : "s"}`,
      icon: <Sparkles className="h-3 w-3 mr-1" />,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    });
  }

  return out;
}

export function CampaignBadges({
  campaign,
  max,
  className = "",
}: {
  campaign: BadgeFields;
  max?: number;
  className?: string;
}) {
  const all = specsFor(campaign);
  const shown = max != null ? all.slice(0, max) : all;
  const overflow = max != null ? all.length - shown.length : 0;
  if (all.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`} role="list" aria-label="Campaign workflow status badges">
      {shown.map((b) => (
        <Badge
          key={b.key}
          variant="outline"
          className={`${b.className} text-xs font-normal`}
          title={b.title}
          role="listitem"
        >
          {b.icon}
          {b.label}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-xs text-muted-foreground" role="listitem">
          <Filter className="h-3 w-3 mr-1" /> +{overflow} more
        </Badge>
      )}
    </div>
  );
}
