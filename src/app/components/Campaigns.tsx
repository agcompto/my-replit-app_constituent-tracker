import { useEffect, useRef, useState } from "react";
import { Plus, Search, ChevronDown, ChevronLeft, ChevronRight, Download, Tag, X, Columns3, Megaphone } from "lucide-react";
import type { Toast } from "./Toast";
import { DetailDrawer, type CampaignDetail } from "./DetailDrawer";
import { NewCampaignModal } from "./NewCampaignModal";
import { EmptyState } from "./EmptyState";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";
const PAGE_SIZE = 6;

const CAMPAIGNS: CampaignDetail[] = [
  { kind: "campaign", id: 1, name: "Q2 Annual Fund Appeal", type: "Solicitation", status: "active", channel: "Email", touchpoints: 24600, constituents: 18200, created: "May 28, 2026", owner: "Jordan Rivera" },
  { kind: "campaign", id: 2, name: "Spring Gala Follow-Up", type: "Stewardship", status: "completed", channel: "Email", touchpoints: 8432, constituents: 6100, created: "May 14, 2026", owner: "Priya Sharma" },
  { kind: "campaign", id: 3, name: "Major Gift Pipeline", type: "Cultivation", status: "active", channel: "Phone", touchpoints: 1204, constituents: 312, created: "May 2, 2026", owner: "Marcus Webb" },
  { kind: "campaign", id: 4, name: "Lapsed Donor Re-engage", type: "Solicitation", status: "draft", channel: "Direct Mail", touchpoints: 0, constituents: 4800, created: "Apr 29, 2026", owner: "Elena Marchetti" },
  { kind: "campaign", id: 5, name: "Board Member Comms", type: "Cultivation", status: "paused", channel: "Email", touchpoints: 312, constituents: 48, created: "Apr 18, 2026", owner: "Jordan Rivera" },
  { kind: "campaign", id: 6, name: "Freshman Welcome Series", type: "Acknowledgment", status: "completed", channel: "SMS", touchpoints: 54200, constituents: 27100, created: "Apr 10, 2026", owner: "Sandra Kowalski" },
  { kind: "campaign", id: 7, name: "Athletic Fund Drive", type: "Solicitation", status: "active", channel: "Email", touchpoints: 9840, constituents: 7200, created: "Mar 30, 2026", owner: "David O'Brien" },
  { kind: "campaign", id: 8, name: "Reunion Outreach 2026", type: "Event", status: "draft", channel: "Direct Mail", touchpoints: 0, constituents: 1540, created: "Mar 22, 2026", owner: "Priya Sharma" },
];

const STATUS_FILTERS = ["All", "Active", "Completed", "Draft", "Paused"];
const STATUS_OPTIONS = ["active", "completed", "draft", "paused"];
const ALL_COLS = ["Campaign Name", "Type", "Channel", "Status", "Touchpoints", "Constituents", "Owner", "Created"] as const;
type ColName = typeof ALL_COLS[number];

function getStatusStyle(status: string, dark: boolean) {
  const r = dark ? "#ff6060" : "#CC0000";
  const map: Record<string, { bg: string; text: string }> = {
    active:    { bg: dark ? "rgba(255,96,96,0.12)" : "rgba(204,0,0,0.10)", text: r },
    completed: { bg: "rgba(111,125,28,0.15)", text: "#6F7D1C" },
    draft:     { bg: "rgba(128,128,128,0.10)", text: "#888888" },
    paused:    { bg: "rgba(209,73,5,0.14)", text: "#D14905" },
  };
  return map[status] ?? map.draft;
}

export function Campaigns({ dark, addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [pageNum, setPageNum] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<CampaignDetail | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColName>>(new Set(ALL_COLS));
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleCol = (col: ColName) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(col) && next.size > 1) next.delete(col); else next.add(col);
      return next;
    });
  };

  const filtered = CAMPAIGNS.filter(c => {
    const matchStatus = filter === "All" || c.status === filter.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.owner.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE);

  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
  const somePageSelected = pageRows.some(r => selected.has(r.id));

  const toggleRow = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPageSelected) {
      setSelected(prev => { const n = new Set(prev); pageRows.forEach(r => n.delete(r.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); pageRows.forEach(r => n.add(r.id)); return n; });
    }
  };

  const clearSelection = () => setSelected(new Set());

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const headerBg = dark ? "var(--card)" : "#fff";

  return (
    <>
      <main className="flex flex-col min-h-full" style={{ background: "var(--background)" }} aria-label="Campaigns">
        {/* Toolbar */}
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", borderBottom: `1px solid ${borderColor}`, background: headerBg, flexWrap: "wrap", rowGap: 8 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: mutedFg, pointerEvents: "none" }} aria-hidden="true" />
            <input type="search" placeholder="Search campaigns or owner…" value={search}
              onChange={e => { setSearch(e.target.value); setPageNum(0); }} aria-label="Search campaigns" className={FOCUS_CLASS}
              style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: "var(--input-background)", border: `1px solid ${borderColor}`, fontSize: 12, color: fg, outline: "none" }} />
          </div>
          <div role="group" aria-label="Filter by status" style={{ display: "flex", gap: 4, flex: 1 }}>
            {STATUS_FILTERS.map(f => (
              <button key={f} onClick={() => { setFilter(f); setPageNum(0); }} aria-pressed={filter === f} className={FOCUS_CLASS}
                style={{ padding: "6px 12px", border: `1px solid ${filter === f ? "#CC0000" : borderColor}`, background: filter === f ? (dark ? "rgba(255,96,96,0.15)" : "rgba(204,0,0,0.08)") : "transparent", color: filter === f ? (dark ? "#ff6060" : "#CC0000") : mutedFg, fontSize: 11.5, fontWeight: filter === f ? 600 : 400, cursor: "pointer" }}>
                {f}
              </button>
            ))}
          </div>
          {/* Column visibility */}
          <div ref={colMenuRef} style={{ position: "relative" }}>
            <button className={FOCUS_CLASS} onClick={() => setColMenuOpen(o => !o)} aria-haspopup="listbox" aria-expanded={colMenuOpen}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "transparent", border: `1px solid ${borderColor}`, color: mutedFg, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
              <Columns3 size={13} aria-hidden="true" /> Columns <ChevronDown size={11} aria-hidden="true" />
            </button>
            {colMenuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "var(--card)", border: `1px solid ${borderColor}`, zIndex: 30, minWidth: 170, padding: "6px 0", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }} role="listbox" aria-label="Toggle columns">
                {ALL_COLS.map(col => (
                  <label key={col} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, color: fg }}>
                    <input type="checkbox" checked={visibleCols.has(col)} onChange={() => toggleCol(col)}
                      style={{ accentColor: "#CC0000", cursor: "pointer" }} />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button className={FOCUS_CLASS} onClick={() => setWizardOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0 }}
            aria-label="Create new campaign">
            <Plus size={13} aria-hidden="true" /> New Campaign
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontFamily: "'Roboto', sans-serif" }} aria-label="Campaign list">
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
                {/* Select all */}
                <th scope="col" style={{ padding: "10px 14px 10px 18px", width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleAll} aria-label="Select all campaigns on this page"
                    className={FOCUS_CLASS} style={{ cursor: "pointer", accentColor: "#CC0000" }} />
                </th>
                {ALL_COLS.filter(col => visibleCols.has(col)).map(col => (
                  <th key={col} scope="col" style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg, whiteSpace: "nowrap" }}>
                    <button className={`${FOCUS_CLASS} flex items-center gap-1`} style={{ background: "none", border: "none", cursor: "pointer", color: mutedFg, fontWeight: 600, fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit", padding: 0 }}>
                      {col} <ChevronDown size={10} aria-hidden="true" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c, i) => {
                const st = getStatusStyle(c.status, dark);
                const isHov = hoveredRow === i;
                const isSel = selected.has(c.id);
                return (
                  <tr key={c.id} onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                    style={{ borderBottom: `1px solid ${borderColor}`, background: isSel ? (dark ? "rgba(255,96,96,0.07)" : "rgba(204,0,0,0.04)") : isHov ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)") : (i % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)")), cursor: "pointer", transition: "background 0.1s" }}>
                    <td style={{ padding: "11px 14px 11px 18px" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleRow(c.id)} aria-label={`Select ${c.name}`}
                        className={FOCUS_CLASS} style={{ cursor: "pointer", accentColor: "#CC0000" }} />
                    </td>
                    {visibleCols.has("Campaign Name") && <td style={{ padding: "11px 16px", fontWeight: 500, color: fg }} onClick={() => setDrawer(c)}>{c.name}</td>}
                    {visibleCols.has("Type") && <td style={{ padding: "11px 16px", color: mutedFg }} onClick={() => setDrawer(c)}>{c.type}</td>}
                    {visibleCols.has("Channel") && <td style={{ padding: "11px 16px", color: mutedFg }} onClick={() => setDrawer(c)}>{c.channel}</td>}
                    {visibleCols.has("Status") && <td style={{ padding: "11px 16px" }} onClick={() => setDrawer(c)}>
                      <span style={{ background: st.bg, color: st.text, padding: "3px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.status}</span>
                    </td>}
                    {visibleCols.has("Touchpoints") && <td style={{ padding: "11px 16px", color: fg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }} onClick={() => setDrawer(c)}>{c.touchpoints.toLocaleString()}</td>}
                    {visibleCols.has("Constituents") && <td style={{ padding: "11px 16px", color: fg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }} onClick={() => setDrawer(c)}>{c.constituents.toLocaleString()}</td>}
                    {visibleCols.has("Owner") && <td style={{ padding: "11px 16px", color: mutedFg }} onClick={() => setDrawer(c)}>{c.owner}</td>}
                    {visibleCols.has("Created") && <td style={{ padding: "11px 16px", color: mutedFg, whiteSpace: "nowrap" }} onClick={() => setDrawer(c)}>{c.created}</td>}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.size + 1}>
                    <EmptyState
                      dark={dark}
                      icon={<Megaphone size={24} aria-hidden="true" />}
                      title={search || filter !== "All" ? "No results found" : "No campaigns yet"}
                      body={search || filter !== "All" ? "Try adjusting your search or filter to find what you're looking for." : "Create your first campaign to start planning constituent outreach."}
                      action={search || filter !== "All" ? undefined : { label: "New Campaign", onClick: () => setWizardOpen(true) }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && selected.size === 0 && (
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

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div role="toolbar" aria-label="Bulk actions" style={{ position: "sticky", bottom: 0, padding: "12px 28px", background: dark ? "#1a1a1a" : "#1a1a1a", borderTop: `2px solid #CC0000`, display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em" }}>
              {selected.size} selected
            </span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)" }} />
            <button className={FOCUS_CLASS} onClick={() => { addToast(`Exporting ${selected.size} campaign${selected.size !== 1 ? "s" : ""}`, "info"); clearSelection(); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer", fontSize: 12 }}>
              <Download size={12} aria-hidden="true" /> Export Selected
            </button>
            <div style={{ position: "relative" }}>
              <button className={FOCUS_CLASS} onClick={() => setStatusMenuOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer", fontSize: 12 }}>
                <Tag size={12} aria-hidden="true" /> Change Status <ChevronDown size={11} aria-hidden="true" />
              </button>
              {statusMenuOpen && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--card)", border: `1px solid ${borderColor}`, zIndex: 20, minWidth: 140 }}>
                  {STATUS_OPTIONS.map(s => (
                    <button key={s} className={FOCUS_CLASS} onClick={() => { addToast(`${selected.size} campaign${selected.size !== 1 ? "s" : ""} set to ${s}`, "success"); setStatusMenuOpen(false); clearSelection(); }}
                      style={{ display: "block", width: "100%", padding: "9px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: fg, textTransform: "capitalize" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className={FOCUS_CLASS} onClick={clearSelection} aria-label="Clear selection"
              style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", padding: "6px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>
              <X size={12} aria-hidden="true" /> Clear
            </button>
          </div>
        )}
      </main>

      <DetailDrawer item={drawer} dark={dark} onClose={() => setDrawer(null)} />
      <NewCampaignModal open={wizardOpen} dark={dark} onClose={() => setWizardOpen(false)} addToast={addToast} />
    </>
  );
}
