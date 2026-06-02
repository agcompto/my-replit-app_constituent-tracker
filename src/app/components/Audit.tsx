import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";
const PAGE_SIZE = 6;

type AuditEntry = { id: string; ts: string; user: string; action: string; target: string; detail: string; severity: "info" | "warning" | "critical" };

const ENTRIES: AuditEntry[] = [
  { id: "AUD-4481", ts: "2026-06-02 09:14:32", user: "Jordan Rivera", action: "Export", target: "Constituent List", detail: "Exported 84,391 records as XLSX", severity: "info" },
  { id: "AUD-4480", ts: "2026-06-02 08:52:11", user: "Jordan Rivera", action: "Create", target: "Campaign", detail: "Created 'Q2 Annual Fund Appeal'", severity: "info" },
  { id: "AUD-4479", ts: "2026-06-01 17:30:00", user: "Priya Sharma", action: "Update", target: "CONST-00482", detail: "Updated contact info for Patricia Langford", severity: "info" },
  { id: "AUD-4478", ts: "2026-06-01 15:44:55", user: "System", action: "Scheduled Send", target: "Campaign #1", detail: "Triggered 18,200 email touchpoints", severity: "info" },
  { id: "AUD-4477", ts: "2026-06-01 11:20:08", user: "Marcus Webb", action: "Login", target: "Auth", detail: "Successful login from 152.14.xx.xx", severity: "info" },
  { id: "AUD-4476", ts: "2026-05-31 22:05:14", user: "Unknown", action: "Failed Login", target: "Auth", detail: "3 consecutive failures for mwebb@ncsu.edu", severity: "warning" },
  { id: "AUD-4475", ts: "2026-05-31 18:00:00", user: "System", action: "Bulk Delete", target: "Touchpoints", detail: "Purged 1,204 duplicate touchpoints from batch job", severity: "warning" },
  { id: "AUD-4474", ts: "2026-05-30 14:33:21", user: "Jordan Rivera", action: "Permission Change", target: "Elena Marchetti", detail: "Elevated from Editor to Admin", severity: "critical" },
  { id: "AUD-4473", ts: "2026-05-29 10:18:44", user: "Sandra Kowalski", action: "Export", target: "Audit Trail", detail: "Exported full audit log Mar–May 2026", severity: "info" },
  { id: "AUD-4472", ts: "2026-05-28 09:02:55", user: "David O'Brien", action: "Update", target: "Campaign #7", detail: "Changed status from Draft to Active", severity: "info" },
];

const SEV_FILTERS = ["All", "Info", "Warning", "Critical"];

function getSevStyle(s: string, dark: boolean) {
  if (s === "critical") return { bg: dark ? "rgba(255,96,96,0.15)" : "rgba(204,0,0,0.10)", text: dark ? "#ff6060" : "#CC0000" };
  if (s === "warning")  return { bg: "rgba(209,73,5,0.14)", text: "#D14905" };
  return { bg: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", text: "var(--muted-foreground)" };
}

export function Audit({ dark, addToast: _addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [sev, setSev] = useState("All");
  const [search, setSearch] = useState("");
  const [pageNum, setPageNum] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const filtered = ENTRIES.filter(e => {
    const matchSev = sev === "All" || e.severity === sev.toLowerCase();
    const matchSearch = e.user.toLowerCase().includes(search.toLowerCase()) ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.detail.toLowerCase().includes(search.toLowerCase());
    return matchSev && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE);

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const headerBg = dark ? "var(--card)" : "#fff";

  return (
    <main className="flex flex-col min-h-full" style={{ background: "var(--background)" }} aria-label="Audit log">
      {/* Toolbar */}
      <div style={{ padding: "14px 28px", display: "flex", gap: 12, alignItems: "center", borderBottom: `1px solid ${borderColor}`, background: headerBg }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: mutedFg, pointerEvents: "none" }} aria-hidden="true" />
          <input type="search" placeholder="Search user, action, or detail…" value={search}
            onChange={e => { setSearch(e.target.value); setPageNum(0); }} aria-label="Search audit log" className={FOCUS_CLASS}
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: "var(--input-background)", border: `1px solid ${borderColor}`, fontSize: 12, color: fg, outline: "none" }} />
        </div>
        <div role="group" aria-label="Filter by severity" style={{ display: "flex", gap: 4 }}>
          {SEV_FILTERS.map(f => (
            <button key={f} onClick={() => { setSev(f); setPageNum(0); }} aria-pressed={sev === f} className={FOCUS_CLASS}
              style={{ padding: "6px 12px", border: `1px solid ${sev === f ? "#CC0000" : borderColor}`, background: sev === f ? (dark ? "rgba(255,96,96,0.15)" : "rgba(204,0,0,0.08)") : "transparent", color: sev === f ? (dark ? "#ff6060" : "#CC0000") : mutedFg, fontSize: 11.5, fontWeight: sev === f ? 600 : 400, cursor: "pointer" }}>
              {f}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontFamily: "'Roboto', sans-serif" }} aria-label="Audit log entries">
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
              {["ID", "Timestamp", "User", "Action", "Target", "Detail", "Severity"].map(col => (
                <th key={col} scope="col" style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg, whiteSpace: "nowrap" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e, i) => {
              const st = getSevStyle(e.severity, dark);
              const isHov = hoveredRow === i;
              return (
                <tr key={e.id} onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                  style={{ borderBottom: `1px solid ${borderColor}`, background: isHov ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)") : (i % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)")), transition: "background 0.1s" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "'Roboto Mono', monospace", fontSize: 11.5, color: mutedFg, whiteSpace: "nowrap" }}>{e.id}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "'Roboto Mono', monospace", fontSize: 11.5, color: mutedFg, whiteSpace: "nowrap" }}>{e.ts}</td>
                  <td style={{ padding: "10px 16px", fontWeight: 500, color: fg, whiteSpace: "nowrap" }}>{e.user}</td>
                  <td style={{ padding: "10px 16px", color: fg }}>{e.action}</td>
                  <td style={{ padding: "10px 16px", color: mutedFg }}>{e.target}</td>
                  <td style={{ padding: "10px 16px", color: mutedFg, maxWidth: 280 }}>{e.detail}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ background: st.bg, color: st.text, padding: "3px 8px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {e.severity}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: mutedFg }}>No log entries match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 28px", borderTop: `1px solid ${borderColor}`, background: headerBg }}>
          <span style={{ fontSize: 12, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>
            {pageNum * PAGE_SIZE + 1}–{Math.min((pageNum + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPageNum(p => Math.max(0, p - 1))} disabled={pageNum === 0} aria-label="Previous page" className={FOCUS_CLASS}
              style={{ padding: "5px 10px", border: `1px solid ${borderColor}`, background: "transparent", cursor: pageNum === 0 ? "not-allowed" : "pointer", color: pageNum === 0 ? mutedFg : fg, opacity: pageNum === 0 ? 0.4 : 1 }}>
              <ChevronLeft size={13} aria-hidden="true" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPageNum(i)} aria-label={`Page ${i + 1}`} aria-current={pageNum === i ? "page" : undefined} className={FOCUS_CLASS}
                style={{ padding: "5px 10px", border: `1px solid ${pageNum === i ? "#CC0000" : borderColor}`, background: pageNum === i ? (dark ? "rgba(255,96,96,0.15)" : "rgba(204,0,0,0.08)") : "transparent", color: pageNum === i ? (dark ? "#ff6060" : "#CC0000") : fg, cursor: "pointer", fontSize: 12, fontFamily: "'Roboto Mono', monospace" }}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPageNum(p => Math.min(totalPages - 1, p + 1))} disabled={pageNum === totalPages - 1} aria-label="Next page" className={FOCUS_CLASS}
              style={{ padding: "5px 10px", border: `1px solid ${borderColor}`, background: "transparent", cursor: pageNum === totalPages - 1 ? "not-allowed" : "pointer", color: pageNum === totalPages - 1 ? mutedFg : fg, opacity: pageNum === totalPages - 1 ? 0.4 : 1 }}>
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
