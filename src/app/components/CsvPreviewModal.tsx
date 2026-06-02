import { useEffect } from "react";
import { X, Download } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const PREVIEW_DATA: Record<string, { headers: string[]; rows: string[][] }> = {
  "Constituent List": {
    headers: ["ID", "Type", "Class Year", "Total Giving", "Touchpoints", "Last Contact", "Status"],
    rows: [
      ["CONST-00482", "Alumni", "1988", "$124,500", "47", "May 30, 2026", "Major Donor"],
      ["CONST-01193", "Faculty", "—", "$12,200", "39", "May 28, 2026", "Active"],
      ["CONST-00718", "Alumni", "2001", "$54,000", "34", "May 25, 2026", "Major Donor"],
      ["CONST-02201", "Corporate", "—", "$250,000", "31", "May 20, 2026", "Major Donor"],
      ["CONST-00934", "Alumni", "1995", "$8,400", "28", "May 18, 2026", "Active"],
    ],
  },
  "Touchpoint Log": {
    headers: ["Touchpoint ID", "Constituent ID", "Campaign ID", "Channel", "Date", "Status"],
    rows: [
      ["TP-88421", "CONST-00482", "CAMP-007", "Email", "May 30, 2026", "Delivered"],
      ["TP-88420", "CONST-01193", "CAMP-003", "Phone", "May 29, 2026", "Completed"],
      ["TP-88419", "CONST-00718", "CAMP-007", "Email", "May 28, 2026", "Delivered"],
      ["TP-88418", "CONST-02201", "CAMP-003", "Phone", "May 27, 2026", "No Answer"],
      ["TP-88417", "CONST-00934", "CAMP-001", "Email", "May 26, 2026", "Delivered"],
    ],
  },
  "Campaign Summary": {
    headers: ["Campaign ID", "Name", "Type", "Channel", "Status", "Touchpoints", "Owner"],
    rows: [
      ["CAMP-001", "Q2 Annual Fund Appeal", "Solicitation", "Email", "Active", "24,600", "Jordan Rivera"],
      ["CAMP-002", "Spring Gala Follow-Up", "Stewardship", "Email", "Completed", "8,432", "Priya Sharma"],
      ["CAMP-003", "Major Gift Pipeline", "Cultivation", "Phone", "Active", "1,204", "Marcus Webb"],
      ["CAMP-004", "Lapsed Donor Re-engage", "Solicitation", "Direct Mail", "Draft", "0", "Elena Marchetti"],
      ["CAMP-005", "Board Member Comms", "Cultivation", "Email", "Paused", "312", "Jordan Rivera"],
    ],
  },
  "Major Gift Prospects": {
    headers: ["ID", "Type", "Class Year", "Total Giving", "Engagement Score", "Last Contact"],
    rows: [
      ["CONST-00482", "Alumni", "1988", "$124,500", "94", "May 30, 2026"],
      ["CONST-02201", "Corporate", "—", "$250,000", "88", "May 20, 2026"],
      ["CONST-00718", "Alumni", "2001", "$54,000", "81", "May 25, 2026"],
      ["CONST-00112", "Alumni", "1979", "$430,000", "76", "Mar 28, 2026"],
      ["CONST-06011", "Corporate", "—", "$75,000", "71", "May 10, 2026"],
    ],
  },
  "Lapsed Donors": {
    headers: ["ID", "Type", "Class Year", "Last Giving Date", "Last Contact", "Months Lapsed"],
    rows: [
      ["CONST-03812", "Alumni", "2010", "Jan 2024", "Apr 30, 2026", "28"],
      ["CONST-05233", "Alumni", "2005", "Aug 2023", "Jan 10, 2026", "34"],
      ["CONST-07441", "Alumni", "1997", "Jun 2023", "Feb 2, 2026", "36"],
      ["CONST-09102", "Friend", "—", "Mar 2024", "Mar 15, 2026", "26"],
      ["CONST-11204", "Alumni", "2015", "Nov 2023", "Jan 28, 2026", "31"],
    ],
  },
  "Audit Trail": {
    headers: ["Timestamp", "Actor ID", "Action", "Entity Type", "Entity ID", "Severity"],
    rows: [
      ["2026-05-30 14:22:01", "USER-003", "ROLE_ELEVATED", "User", "USER-007", "Critical"],
      ["2026-05-30 09:14:33", "SYSTEM", "BATCH_COMPLETE", "Campaign", "CAMP-001", "Info"],
      ["2026-05-29 16:48:11", "USER-001", "EXPORT_GENERATED", "Export", "EXP-044", "Info"],
      ["2026-05-29 11:02:55", "USER-005", "LOGIN_FAILED", "Auth", "USER-002", "Warning"],
      ["2026-05-28 08:30:00", "SYSTEM", "BULK_DELETE", "Touchpoint", "BATCH-019", "Warning"],
    ],
  },
};

interface Props {
  open: boolean;
  dark: boolean;
  exportLabel: string;
  format: string;
  onClose: () => void;
  addToast: (msg: string, type?: Toast["type"]) => void;
}

export function CsvPreviewModal({ open, dark, exportLabel, format, onClose, addToast }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const preview = PREVIEW_DATA[exportLabel];
  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";

  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />

      <div role="dialog" aria-label={`Preview: ${exportLabel}`} aria-modal="true"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(720px,94vw)", zIndex: 51, background: "var(--card)", border: `1px solid ${borderColor}`, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", maxHeight: "85vh" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ flex: 1, margin: 0, fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase", color: fg }}>
            Preview — {exportLabel}
          </h2>
          <span style={{ fontSize: 11, fontFamily: "'Roboto Mono', monospace", color: mutedFg, padding: "2px 8px", border: `1px solid ${borderColor}` }}>{format}</span>
          <button onClick={onClose} aria-label="Close preview" className={FOCUS_CLASS}
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: 6, cursor: "pointer", color: mutedFg, display: "flex" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Notice */}
        <div style={{ padding: "8px 20px", background: dark ? "rgba(250,200,0,0.06)" : "rgba(250,200,0,0.10)", borderBottom: `1px solid ${borderColor}`, fontSize: 11.5, color: mutedFg }}>
          Showing first 5 rows. The full export will include all matching records with no name or PII fields.
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", flex: 1 }}>
          {preview ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Roboto Mono', monospace" }} aria-label={`${exportLabel} preview`}>
              <thead>
                <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
                  {preview.headers.map(h => (
                    <th key={h} scope="col" style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: mutedFg, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${borderColor}`, background: i % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)") }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "9px 14px", color: j === 0 ? mutedFg : fg, whiteSpace: "nowrap" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: mutedFg, fontSize: 13 }}>No preview available.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${borderColor}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className={FOCUS_CLASS}
            style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${borderColor}`, cursor: "pointer", fontSize: 12, color: mutedFg }}>
            Cancel
          </button>
          <button onClick={() => { addToast(`${exportLabel} (${format}) export queued`, "success"); onClose(); }} className={FOCUS_CLASS}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            <Download size={13} aria-hidden="true" /> Export {format}
          </button>
        </div>
      </div>
    </>
  );
}
