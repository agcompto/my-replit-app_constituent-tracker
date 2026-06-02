import { useEffect, useRef, useState } from "react";
import { Megaphone, Users, MessageSquare, TrendingUp, TrendingDown, ArrowUpRight, Filter } from "lucide-react";
import type { Toast } from "./Toast";
import { useMobile } from "../hooks/useMobile";

// ── Per-filter datasets ────────────────────────────────────────────────────

const DATA = {
  "All time": {
    stats: [
      { label: "Total Campaigns", num: 389, delta: "+41%", up: true, icon: Megaphone, sub: "since inception", accent: "#CC0000" },
      { label: "Constituents Processed", num: 218432, delta: "+22%", up: true, icon: Users, sub: "since inception", accent: "#008473" },
      { label: "Planned Touchpoints", num: 847921, delta: "+18%", up: true, icon: MessageSquare, sub: "since inception", accent: "#427E93" },
    ],
    byChannel: [{ label: "Email", count: 402100 }, { label: "Phone", count: 198400 }, { label: "Direct Mail", count: 148200 }, { label: "SMS", count: 72800 }, { label: "In-Person", count: 26421 }],
    byType:    [{ label: "Solicitation", count: 380000 }, { label: "Cultivation", count: 241000 }, { label: "Stewardship", count: 142000 }, { label: "Acknowledgment", count: 61000 }, { label: "Event", count: 23921 }],
  },
  "This quarter": {
    stats: [
      { label: "Total Campaigns", num: 142, delta: "+12%", up: true, icon: Megaphone, sub: "vs. last quarter", accent: "#CC0000" },
      { label: "Constituents Processed", num: 84391, delta: "+8.4%", up: true, icon: Users, sub: "vs. last quarter", accent: "#008473" },
      { label: "Planned Touchpoints", num: 317042, delta: "-2.1%", up: false, icon: MessageSquare, sub: "vs. last quarter", accent: "#427E93" },
    ],
    byChannel: [{ label: "Email", count: 128400 }, { label: "Phone", count: 74200 }, { label: "Direct Mail", count: 56300 }, { label: "SMS", count: 41600 }, { label: "In-Person", count: 16540 }],
    byType:    [{ label: "Solicitation", count: 142000 }, { label: "Cultivation", count: 89300 }, { label: "Stewardship", count: 54700 }, { label: "Acknowledgment", count: 23100 }, { label: "Event", count: 7942 }],
  },
  "Last 30 days": {
    stats: [
      { label: "Total Campaigns", num: 38, delta: "+5%", up: true, icon: Megaphone, sub: "vs. prior 30 days", accent: "#CC0000" },
      { label: "Constituents Processed", num: 21840, delta: "+3.2%", up: true, icon: Users, sub: "vs. prior 30 days", accent: "#008473" },
      { label: "Planned Touchpoints", num: 94210, delta: "-1.4%", up: false, icon: MessageSquare, sub: "vs. prior 30 days", accent: "#427E93" },
    ],
    byChannel: [{ label: "Email", count: 42300 }, { label: "Phone", count: 21400 }, { label: "Direct Mail", count: 16200 }, { label: "SMS", count: 9800 }, { label: "In-Person", count: 4510 }],
    byType:    [{ label: "Solicitation", count: 42000 }, { label: "Cultivation", count: 26100 }, { label: "Stewardship", count: 15400 }, { label: "Acknowledgment", count: 7200 }, { label: "Event", count: 3510 }],
  },
  "Last 7 days": {
    stats: [
      { label: "Total Campaigns", num: 11, delta: "+2", up: true, icon: Megaphone, sub: "vs. prior 7 days", accent: "#CC0000" },
      { label: "Constituents Processed", num: 4820, delta: "-0.8%", up: false, icon: Users, sub: "vs. prior 7 days", accent: "#008473" },
      { label: "Planned Touchpoints", num: 18340, delta: "+4.1%", up: true, icon: MessageSquare, sub: "vs. prior 7 days", accent: "#427E93" },
    ],
    byChannel: [{ label: "Email", count: 9400 }, { label: "Phone", count: 4200 }, { label: "Direct Mail", count: 2100 }, { label: "SMS", count: 1840 }, { label: "In-Person", count: 800 }],
    byType:    [{ label: "Solicitation", count: 8200 }, { label: "Cultivation", count: 5100 }, { label: "Stewardship", count: 2840 }, { label: "Acknowledgment", count: 1400 }, { label: "Event", count: 800 }],
  },
} as const;

type FilterKey = keyof typeof DATA;

const recentCampaigns = [
  { id: 1, name: "Q2 Annual Fund Appeal", status: "active", touches: 24600, created: "May 28, 2026" },
  { id: 2, name: "Spring Gala Follow-Up", status: "completed", touches: 8432, created: "May 14, 2026" },
  { id: 3, name: "Major Gift Pipeline", status: "active", touches: 1204, created: "May 2, 2026" },
  { id: 4, name: "Lapsed Donor Re-engage", status: "draft", touches: 0, created: "Apr 29, 2026" },
  { id: 5, name: "Board Member Comms", status: "paused", touches: 312, created: "Apr 18, 2026" },
];

const highVolume = [
  { id: "CONST-00482", touchpoints: 47 },
  { id: "CONST-01193", touchpoints: 39 },
  { id: "CONST-00718", touchpoints: 34 },
  { id: "CONST-02201", touchpoints: 31 },
  { id: "CONST-00934", touchpoints: 28 },
];

const volumeColors = ["#CC0000", "#D14905", "#FAC800", "#6F7D1C", "#427E93"];
const CHART_COLORS = ["#CC0000", "#D14905", "#FAC800", "#6F7D1C", "#427E93"];
const FILTERS: FilterKey[] = ["All time", "This quarter", "Last 30 days", "Last 7 days"];

const legendItems = [
  { color: "#CC0000", name: "Wolfpack Red",    symbol: "■" },
  { color: "#D14905", name: "Pyroman Flame",   symbol: "▲" },
  { color: "#FAC800", name: "Hunt Yellow",     symbol: "●" },
  { color: "#6F7D1C", name: "Genomic Green",  symbol: "◆" },
  { color: "#427E93", name: "Innovation Blue", symbol: "▶" },
];

function getStatusStyles(dark: boolean) {
  const r = dark ? "#ff6060" : "#CC0000";
  return {
    active:    { bg: dark ? "rgba(255,96,96,0.12)" : "rgba(204,0,0,0.10)", text: r, bar: r },
    completed: { bg: "rgba(111,125,28,0.15)", text: "#6F7D1C", bar: "#6F7D1C" },
    draft:     { bg: "rgba(128,128,128,0.10)", text: "#888888", bar: "#888888" },
    paused:    { bg: "rgba(209,73,5,0.14)", text: "#D14905", bar: "#D14905" },
  } as Record<string, { bg: string; text: string; bar: string }>;
}

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

// ── Count-up hook ──────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setValue(0);
    let start: number | null = null;

    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setValue(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Animated stat card ─────────────────────────────────────────────────────

function StatCard({ label, num, delta, up, icon: Icon, sub, accent, dark }: {
  label: string; num: number; delta: string; up: boolean;
  icon: React.ElementType; sub: string; accent: string; dark: boolean;
}) {
  const animated = useCountUp(num);
  const redText = dark ? "#ff6060" : "#CC0000";
  const cardAccent = accent === "#CC0000" ? (dark ? "#ff6060" : "#CC0000") : accent;

  const display = animated >= 1000
    ? animated.toLocaleString()
    : String(animated);

  return (
    <div role="listitem" className="flex flex-col gap-4 p-5 relative overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div className="flex items-start justify-between" style={{ marginTop: 4 }}>
        <div aria-hidden="true" className="flex items-center justify-center" style={{ width: 36, height: 36, background: `${cardAccent}1a`, color: cardAccent }}>
          <Icon size={17} />
        </div>
        <div aria-label={`${up ? "Up" : "Down"} ${delta} ${sub}`} className="flex items-center gap-1 px-2 py-0.5"
          style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.03em", background: up ? "rgba(111,125,28,0.14)" : dark ? "rgba(255,96,96,0.14)" : "rgba(204,0,0,0.10)", color: up ? "#6F7D1C" : redText }}>
          {up ? <TrendingUp size={10} aria-hidden="true" /> : <TrendingDown size={10} aria-hidden="true" />}
          <span aria-hidden="true">{delta}</span>
        </div>
      </div>
      <div>
        <div aria-label={`${label}: ${num.toLocaleString()}`} style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 32, color: "var(--foreground)", letterSpacing: "-0.01em", lineHeight: 1 }}>
          {display}
        </div>
        <div aria-hidden="true" style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Roboto Condensed', sans-serif" }}>
          {label}
        </div>
        <div aria-hidden="true" style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2, opacity: 0.7 }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Animated bar chart ─────────────────────────────────────────────────────

function SimpleBarChart({ data, colors, label }: { data: { label: string; count: number }[]; colors: string[]; label: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const max = Math.max(...data.map(d => d.count));

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <div>
      <div role="img" aria-label={label} style={{ height: 220, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 10 }}>
          {data.map((d, i) => {
            const pct = (d.count / max) * 100;
            const isHov = hovered === i;
            return (
              <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", cursor: "default" }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                {isHov && (
                  <div style={{ background: "var(--popover)", border: "1px solid var(--border)", padding: "4px 8px", fontSize: 11.5, color: "var(--foreground)", fontWeight: 600, marginBottom: 6, whiteSpace: "nowrap", fontFamily: "'Roboto Mono', monospace" }}>
                    {d.count.toLocaleString()}
                  </div>
                )}
                <div style={{
                  width: "100%",
                  height: mounted ? `${pct}%` : "0%",
                  background: colors[i % colors.length],
                  opacity: hovered !== null && !isHov ? 0.3 : 1,
                  transition: "height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.15s",
                  minHeight: mounted ? 4 : 0,
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {data.map(d => (
            <div key={d.label} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Roboto', sans-serif" }}>
              {d.label}
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Category</th><th scope="col">Count</th></tr></thead>
        <tbody>{data.map(d => <tr key={d.label}><td>{d.label}</td><td>{d.count.toLocaleString()}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function Dashboard({ dark, addToast: _addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const isMobile = useMobile();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("This quarter");
  const [activeTab, setActiveTab] = useState<"channel" | "type">("channel");

  const d = DATA[activeFilter];
  const statusStyles = getStatusStyles(dark);
  const redText = dark ? "#ff6060" : "#CC0000";

  return (
    <div style={{ fontFamily: "'Roboto', sans-serif", background: "var(--background)" }}>
      <main style={{ padding: isMobile ? "16px" : "24px 32px" }} className="flex flex-col gap-6">

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by time period">
          <Filter size={13} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginRight: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Roboto Condensed', sans-serif" }}>
            Period
          </span>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} aria-pressed={activeFilter === f}
              className={`px-3 py-1.5 transition-all duration-150 ${FOCUS_CLASS}`}
              style={{ fontSize: 12, fontWeight: activeFilter === f ? 700 : 400, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.03em", background: activeFilter === f ? "#CC0000" : "var(--muted)", color: activeFilter === f ? "#ffffff" : "var(--muted-foreground)", border: "none", cursor: "pointer" }}>
              {f}
            </button>
          ))}
        </div>

        {/* Stat cards */}
        <div className="grid gap-4" role="list" aria-label="Key metrics" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
          {d.stats.map(s => (
            <StatCard key={`${activeFilter}-${s.label}`} {...s} dark={dark} />
          ))}
        </div>

        {/* Color legend */}
        <div className="flex items-center gap-3 px-1 flex-wrap" aria-label="Chart color legend">
          {legendItems.map(({ color, name, symbol }) => (
            <div key={name} className="flex items-center gap-1.5">
              <span aria-hidden="true" style={{ color, fontSize: 10, lineHeight: 1 }}>{symbol}</span>
              <span style={{ fontSize: 10.5, color: "var(--muted-foreground)", fontFamily: "'Roboto Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{name}</span>
            </div>
          ))}
        </div>

        {/* Chart panel */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-0" role="group" aria-label="Chart view">
              {(["channel", "type"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab}
                  className={`px-4 py-2 transition-all duration-150 ${FOCUS_CLASS}`}
                  style={{ fontSize: 12, fontWeight: activeTab === tab ? 700 : 400, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", background: activeTab === tab ? "#CC0000" : "transparent", color: activeTab === tab ? "#ffffff" : "var(--muted-foreground)", border: "none", cursor: "pointer" }}>
                  By {tab}
                </button>
              ))}
            </div>
            <div aria-hidden="true" style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'Roboto Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Touchpoints Distribution
            </div>
          </div>
          <div className="px-6 py-5">
            <SimpleBarChart
              key={`${activeFilter}-${activeTab}`}
              data={activeTab === "channel" ? [...d.byChannel] : [...d.byType]}
              colors={CHART_COLORS}
              label={`Touchpoints by ${activeTab} — ${activeFilter}`}
            />
          </div>
        </div>

        {/* Bottom tables */}
        <div className="grid gap-4" style={{ gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>

          {/* Recent Campaigns */}
          <section aria-label="Recent campaigns">
            <div className="flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                  Recent Campaigns
                </h2>
                <button className={`flex items-center gap-1 px-3 py-1 ${FOCUS_CLASS}`} aria-label="View all campaigns"
                  style={{ fontSize: 11, color: redText, background: dark ? "rgba(255,96,96,0.10)" : "rgba(204,0,0,0.08)", border: `1px solid ${dark ? "rgba(255,96,96,0.25)" : "rgba(204,0,0,0.2)"}`, cursor: "pointer", fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  View all <ArrowUpRight size={10} aria-hidden="true" />
                </button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead className="sr-only">
                  <tr><th scope="col">Campaign</th><th scope="col">Created</th><th scope="col">Touchpoints</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((c, i) => {
                    const s = statusStyles[c.status];
                    return (
                      <tr key={c.id} style={{ borderBottom: i < recentCampaigns.length - 1 ? "1px solid var(--border)" : "none" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <td style={{ padding: "10px 0 10px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div aria-hidden="true" style={{ width: 3, height: 32, background: s.bar, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>{c.created}</div>
                            </div>
                          </div>
                        </td>
                        <td className="sr-only">{c.created}</td>
                        <td style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)", fontFamily: "'Roboto Mono', monospace", textAlign: "right", paddingRight: 12, whiteSpace: "nowrap" }}>
                          {c.touches.toLocaleString()}
                        </td>
                        <td style={{ paddingRight: 20 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 10px", fontSize: 10, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", background: s.bg, color: s.text, minWidth: 78 }}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* High Volume Constituents */}
          <section aria-label="High-volume constituents">
            <div className="flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: "var(--foreground)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                  High-Volume Constituents
                </h2>
                <span aria-hidden="true" style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'Roboto Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Top 5</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {highVolume.map((d, i) => {
                  const pct = Math.round((d.touchpoints / highVolume[0].touchpoints) * 100);
                  const barColor = volumeColors[i % volumeColors.length];
                  return (
                    <li key={d.id} style={{ padding: "14px 20px", borderBottom: i < highVolume.length - 1 ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <div className="flex items-center justify-between mb-2">
                        <div style={{ fontSize: 12, fontFamily: "'Roboto Mono', monospace", color: "var(--muted-foreground)" }}>{d.id}</div>
                        <div aria-label={`${d.touchpoints} touchpoints`} style={{ fontSize: 16, fontWeight: 700, color: barColor, fontFamily: "'Roboto Condensed', sans-serif" }}>
                          {d.touchpoints}
                        </div>
                      </div>
                      <div aria-hidden="true" style={{ height: 3, background: "var(--border)" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 0.4s" }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
