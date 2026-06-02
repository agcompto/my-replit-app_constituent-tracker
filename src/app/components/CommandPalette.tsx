import { useEffect, useRef, useState } from "react";
import { Search, LayoutDashboard, Megaphone, Users, Calendar, BarChart2, Download, ShieldCheck, UserCog, Settings, ArrowRight } from "lucide-react";
import type { Page } from "./Sidebar";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

interface Result {
  id: string;
  label: string;
  sub: string;
  page: Page;
  Icon: React.ElementType;
  group: string;
}

const PAGES: Result[] = [
  { id: "p-dashboard",    label: "Dashboard",    sub: "Overview and KPIs",                    page: "dashboard",    Icon: LayoutDashboard, group: "Pages" },
  { id: "p-campaigns",    label: "Campaigns",    sub: "Manage outreach campaigns",             page: "campaigns",    Icon: Megaphone,       group: "Pages" },
  { id: "p-constituents", label: "Constituents", sub: "Constituent directory",                 page: "constituents", Icon: Users,           group: "Pages" },
  { id: "p-calendar",     label: "Calendar",     sub: "Scheduled touchpoints",                 page: "calendar",     Icon: Calendar,        group: "Pages" },
  { id: "p-reports",      label: "Reports",      sub: "Analytics and summaries",               page: "reports",      Icon: BarChart2,       group: "Pages" },
  { id: "p-exports",      label: "Exports",      sub: "Download data",                         page: "exports",      Icon: Download,        group: "Pages" },
  { id: "p-audit",        label: "Audit Log",    sub: "System event history",                  page: "audit",        Icon: ShieldCheck,     group: "Pages" },
  { id: "p-users",        label: "Users",        sub: "Team members and permissions",          page: "users",        Icon: UserCog,         group: "Pages" },
  { id: "p-settings",     label: "Settings",     sub: "Account and preferences",              page: "settings",     Icon: Settings,        group: "Pages" },
];

const CAMPAIGNS: Result[] = [
  { id: "c-1", label: "Q2 Annual Fund Appeal",     sub: "Active · Email · 24,600 touchpoints",   page: "campaigns", Icon: Megaphone, group: "Campaigns" },
  { id: "c-2", label: "Spring Gala Follow-Up",     sub: "Completed · Email · 8,432 touchpoints", page: "campaigns", Icon: Megaphone, group: "Campaigns" },
  { id: "c-3", label: "Major Gift Pipeline",        sub: "Active · Phone · 1,204 touchpoints",   page: "campaigns", Icon: Megaphone, group: "Campaigns" },
  { id: "c-4", label: "Lapsed Donor Re-engage",    sub: "Draft · Direct Mail",                   page: "campaigns", Icon: Megaphone, group: "Campaigns" },
  { id: "c-5", label: "Board Member Comms",         sub: "Paused · Email · 312 touchpoints",     page: "campaigns", Icon: Megaphone, group: "Campaigns" },
  { id: "c-6", label: "Athletic Fund Drive",        sub: "Active · Email · 9,840 touchpoints",   page: "campaigns", Icon: Megaphone, group: "Campaigns" },
];

const CONSTITUENTS: Result[] = [
  { id: "u-1", label: "Patricia Langford",  sub: "CONST-00482 · Alumni '88 · Major Donor",   page: "constituents", Icon: Users, group: "Constituents" },
  { id: "u-2", label: "Marcus Webb",        sub: "CONST-01193 · Faculty",                    page: "constituents", Icon: Users, group: "Constituents" },
  { id: "u-3", label: "Elena Marchetti",   sub: "CONST-00718 · Alumni '01 · Major Donor",   page: "constituents", Icon: Users, group: "Constituents" },
  { id: "u-4", label: "David O'Brien",     sub: "CONST-02201 · Corporate · Major Donor",    page: "constituents", Icon: Users, group: "Constituents" },
  { id: "u-5", label: "Sandra Kowalski",   sub: "CONST-00934 · Alumni '95",                 page: "constituents", Icon: Users, group: "Constituents" },
  { id: "u-6", label: "Robert Huang",      sub: "CONST-00112 · Alumni '79 · Major Donor",   page: "constituents", Icon: Users, group: "Constituents" },
];

const ALL_RESULTS = [...PAGES, ...CAMPAIGNS, ...CONSTITUENTS];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  dark: boolean;
}

export function CommandPalette({ open, onClose, onNavigate, dark }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim() === ""
    ? PAGES
    : ALL_RESULTS.filter(r =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.sub.toLowerCase().includes(query.toLowerCase())
      );

  // Group results
  const groups = results.reduce<Record<string, Result[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = [];
    acc[r.group].push(r);
    return acc;
  }, {});

  const flatResults = Object.values(groups).flat();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && flatResults[selectedIndex]) {
        onNavigate(flatResults[selectedIndex].page);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatResults, selectedIndex, onNavigate, onClose]);

  if (!open) return null;

  const borderColor = "var(--border)";
  const fg = "var(--foreground)";
  const mutedFg = "var(--muted-foreground)";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-label="Global search"
        aria-modal="true"
        style={{
          position: "fixed", top: "18%", left: "50%", transform: "translateX(-50%)",
          width: "min(560px, 90vw)", zIndex: 51,
          background: "var(--card)", border: `1px solid ${borderColor}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column", maxHeight: "60vh",
        }}
      >
        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${borderColor}` }}>
          <Search size={15} style={{ color: mutedFg, flexShrink: 0 }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, campaigns, constituents…"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="cmd-results"
            aria-activedescendant={flatResults[selectedIndex] ? `cmd-item-${flatResults[selectedIndex].id}` : undefined}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: fg, fontFamily: "'Roboto', sans-serif" }}
          />
          <kbd style={{ padding: "2px 6px", background: "var(--muted)", border: `1px solid ${borderColor}`, fontSize: 10.5, fontFamily: "'Roboto Mono', monospace", color: mutedFg }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div id="cmd-results" role="listbox" aria-label="Search results" style={{ overflowY: "auto", flex: 1 }}>
          {flatResults.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: mutedFg, fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                <div style={{ padding: "8px 16px 4px", fontSize: 10.5, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: mutedFg }}>
                  {groupName}
                </div>
                {items.map(item => {
                  const flatIdx = flatResults.indexOf(item);
                  const isSelected = flatIdx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      id={`cmd-item-${item.id}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { onNavigate(item.page); onClose(); }}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "9px 16px",
                        background: isSelected ? (dark ? "rgba(255,96,96,0.10)" : "rgba(204,0,0,0.06)") : "transparent",
                        cursor: "pointer",
                        borderLeft: `3px solid ${isSelected ? "#CC0000" : "transparent"}`,
                      }}
                    >
                      <item.Icon size={14} style={{ color: isSelected ? (dark ? "#ff6060" : "#CC0000") : mutedFg, flexShrink: 0 }} aria-hidden="true" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? fg : fg }}>{item.label}</div>
                        <div style={{ fontSize: 11.5, color: mutedFg, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sub}</div>
                      </div>
                      {isSelected && <ArrowRight size={13} style={{ color: dark ? "#ff6060" : "#CC0000", flexShrink: 0 }} aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${borderColor}`, display: "flex", gap: 16, fontSize: 11, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>
          <span>↑↓ navigate</span>
          <span>↵ go</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  );
}
