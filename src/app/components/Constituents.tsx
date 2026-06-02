import { useEffect, useRef, useState } from "react";
import { Search, Filter, ChevronDown, ChevronLeft, ChevronRight, Download, X, Columns3, Users } from "lucide-react";
import type { Toast } from "./Toast";
import { DetailDrawer, type ConstituentDetail } from "./DetailDrawer";
import { EmptyState } from "./EmptyState";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";
const PAGE_SIZE = 6;

type ConstituentRow = ConstituentDetail & { score: number };

const CONSTITUENTS: ConstituentRow[] = [
  { kind: "constituent", id: "CONST-00482", name: "Patricia Langford", email: "p.langford@gmail.com", type: "Alumni", class: "1988", giving: "$124,500", touchpoints: 47, lastContact: "May 30, 2026", status: "Major Donor", score: 94 },
  { kind: "constituent", id: "CONST-01193", name: "Marcus Webb", email: "mwebb@ncsu.edu", type: "Faculty", class: "—", giving: "$12,200", touchpoints: 39, lastContact: "May 28, 2026", status: "Active", score: 82 },
  { kind: "constituent", id: "CONST-00718", name: "Elena Marchetti", email: "emarchetti@wolfalum.com", type: "Alumni", class: "2001", giving: "$54,000", touchpoints: 34, lastContact: "May 25, 2026", status: "Major Donor", score: 81 },
  { kind: "constituent", id: "CONST-02201", name: "David O'Brien", email: "dobrien@redbriefcase.com", type: "Corporate", class: "—", giving: "$250,000", touchpoints: 31, lastContact: "May 20, 2026", status: "Major Donor", score: 88 },
  { kind: "constituent", id: "CONST-00934", name: "Sandra Kowalski", email: "skowalski@gmail.com", type: "Alumni", class: "1995", giving: "$8,400", touchpoints: 28, lastContact: "May 18, 2026", status: "Active", score: 67 },
  { kind: "constituent", id: "CONST-03812", name: "James Thornton", email: "jthornton@ncstate.net", type: "Alumni", class: "2010", giving: "$3,100", touchpoints: 14, lastContact: "Apr 30, 2026", status: "Lapsed", score: 34 },
  { kind: "constituent", id: "CONST-04501", name: "Ayesha Patel", email: "apatel@techpark.io", type: "Friend", class: "—", giving: "$1,500", touchpoints: 9, lastContact: "Apr 15, 2026", status: "Active", score: 51 },
  { kind: "constituent", id: "CONST-00112", name: "Robert Huang", email: "rhuang@wolfpack.edu", type: "Alumni", class: "1979", giving: "$430,000", touchpoints: 6, lastContact: "Mar 28, 2026", status: "Major Donor", score: 76 },
  { kind: "constituent", id: "CONST-05233", name: "Lisa Fontaine", email: "lfontaine@ncsupport.org", type: "Alumni", class: "2005", giving: "$0", touchpoints: 2, lastContact: "Jan 10, 2026", status: "Lapsed", score: 18 },
  { kind: "constituent", id: "CONST-06011", name: "Tom Bradshaw", email: "tbradshaw@biz.com", type: "Corporate", class: "—", giving: "$75,000", touchpoints: 22, lastContact: "May 10, 2026", status: "Active", score: 71 },
];

const TYPE_FILTERS = ["All", "Alumni", "Faculty", "Corporate", "Friend"];
const ALL_COLS = ["ID", "Name", "Email", "Type", "Class", "Total Giving", "Touchpoints", "Score", "Last Contact", "Status"] as const;
type ColName = typeof ALL_COLS[number];

function getStatusStyle(status: string, dark: boolean) {
  const r = dark ? "#ff6060" : "#CC0000";
  const map: Record<string, { bg: string; text: string }> = {
    "Major Donor": { bg: dark ? "rgba(255,96,96,0.12)" : "rgba(204,0,0,0.10)", text: r },
    "Active":      { bg: "rgba(66,126,147,0.14)", text: "#427E93" },
    "Lapsed":      { bg: "rgba(128,128,128,0.10)", text: "#888888" },
  };
  return map[status] ?? map["Active"];
}

export function Constituents({ dark, addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [pageNum, setPageNum] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<ConstituentDetail | null>(null);
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

  const filtered = CONSTITUENTS.filter(c => {
    const matchType = typeFilter === "All" || c.type === typeFilter;
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE);

  const allPageSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id));
  const somePageSelected = pageRows.some(r => selected.has(r.id));

  const toggleRow = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
      <main className="flex flex-col min-h-full" style={{ background: "var(--background)" }} aria-label="Constituents">
        {/* Toolbar */}
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", borderBottom: `1px solid ${borderColor}`, background: headerBg, flexWrap: "wrap", rowGap: 8 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: mutedFg, pointerEvents: "none" }} aria-hidden="true" />
            <input type="search" placeholder="Search by name, ID, or email…" value={search}
              onChange={e => { setSearch(e.target.value); setPageNum(0); }} aria-label="Search constituents" className={FOCUS_CLASS}
              style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: "var(--input-background)", border: `1px solid ${borderColor}`, fontSize: 12, color: fg, outline: "none" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: mutedFg, fontSize: 11 }}>
            <Filter size={12} aria-hidden="true" />
            <span style={{ fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>Type:</span>
          </div>
          <div role="group" aria-label="Filter by constituent type" style={{ display: "flex", gap: 4 }}>
            {TYPE_FILTERS.map(f => (
              <button key={f} onClick={() => { setTypeFilter(f); setPageNum(0); }} aria-pressed={typeFilter === f} className={FOCUS_CLASS}
                style={{ padding: "6px 12px", border: `1px solid ${typeFilter === f ? "#CC0000" : borderColor}`, background: typeFilter === f ? (dark ? "rgba(255,96,96,0.15)" : "rgba(204,0,0,0.08)") : "transparent", color: typeFilter === f ? (dark ? "#ff6060" : "#CC0000") : mutedFg, fontSize: 11.5, fontWeight: typeFilter === f ? 600 : 400, cursor: "pointer" }}>
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

          <span style={{ fontSize: 11.5, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>
            {filtered.length.toLocaleString()} of {CONSTITUENTS.length.toLocaleString()} records
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontFamily: "'Roboto', sans-serif" }} aria-label="Constituent directory">
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
                <th scope="col" style={{ padding: "10px 14px 10px 18px", width: 36 }}>
                  <input type="checkbox" checked={allPageSelected} ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleAll} aria-label="Select all constituents on this page"
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
                    {visibleCols.has("ID") && <td style={{ padding: "11px 16px", fontFamily: "'Roboto Mono', monospace", fontSize: 11.5, color: mutedFg }} onClick={() => setDrawer(c)}>{c.id}</td>}
                    {visibleCols.has("Name") && <td style={{ padding: "11px 16px", fontWeight: 500, color: fg, whiteSpace: "nowrap" }} onClick={() => setDrawer(c)}>{c.name}</td>}
                    {visibleCols.has("Email") && <td style={{ padding: "11px 16px", color: mutedFg, fontSize: 12 }} onClick={() => setDrawer(c)}>{c.email}</td>}
                    {visibleCols.has("Type") && <td style={{ padding: "11px 16px", color: mutedFg }} onClick={() => setDrawer(c)}>{c.type}</td>}
                    {visibleCols.has("Class") && <td style={{ padding: "11px 16px", color: mutedFg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }} onClick={() => setDrawer(c)}>{c.class}</td>}
                    {visibleCols.has("Total Giving") && <td style={{ padding: "11px 16px", color: fg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }} onClick={() => setDrawer(c)}>{c.giving}</td>}
                    {visibleCols.has("Touchpoints") && <td style={{ padding: "11px 16px", color: fg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }} onClick={() => setDrawer(c)}>{c.touchpoints}</td>}
                    {visibleCols.has("Score") && <td style={{ padding: "11px 16px" }} onClick={() => setDrawer(c)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", maxWidth: 60 }}>
                          <div style={{ width: `${c.score}%`, height: "100%", background: c.score >= 75 ? "#6F7D1C" : c.score >= 50 ? "#427E93" : c.score >= 30 ? "#D14905" : "#888" }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontFamily: "'Roboto Mono', monospace", color: c.score >= 75 ? "#6F7D1C" : c.score >= 50 ? "#427E93" : c.score >= 30 ? "#D14905" : "#888", fontWeight: 600, minWidth: 24 }}>{c.score}</span>
                      </div>
                    </td>}
                    {visibleCols.has("Last Contact") && <td style={{ padding: "11px 16px", color: mutedFg, whiteSpace: "nowrap" }} onClick={() => setDrawer(c)}>{c.lastContact}</td>}
                    {visibleCols.has("Status") && <td style={{ padding: "11px 16px" }} onClick={() => setDrawer(c)}>
                      <span style={{ background: st.bg, color: st.text, padding: "3px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.status}</span>
                    </td>}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.size + 1}>
                    <EmptyState
                      dark={dark}
                      icon={<Users size={24} aria-hidden="true" />}
                      title="No constituents found"
                      body="Try adjusting your search term or type filter to find matching records."
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
          <div role="toolbar" aria-label="Bulk actions" style={{ position: "sticky", bottom: 0, padding: "12px 28px", background: "#1a1a1a", borderTop: "2px solid #CC0000", display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em" }}>
              {selected.size} selected
            </span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)" }} />
            <button className={FOCUS_CLASS} onClick={() => { addToast(`Exporting ${selected.size} constituent${selected.size !== 1 ? "s" : ""}`, "info"); clearSelection(); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer", fontSize: 12 }}>
              <Download size={12} aria-hidden="true" /> Export Selected
            </button>
            <button className={FOCUS_CLASS} onClick={() => { addToast(`${selected.size} constituent${selected.size !== 1 ? "s" : ""} added to campaign`, "success"); clearSelection(); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer", fontSize: 12 }}>
              Add to Campaign
            </button>
            <button className={FOCUS_CLASS} onClick={clearSelection} aria-label="Clear selection"
              style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", padding: "6px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>
              <X size={12} aria-hidden="true" /> Clear
            </button>
          </div>
        )}
      </main>

      <DetailDrawer item={drawer} dark={dark} onClose={() => setDrawer(null)} />
    </>
  );
}
