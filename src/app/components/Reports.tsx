import { useState } from "react";
import { Download } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";
const CHART_COLORS = ["#CC0000", "#D14905", "#FAC800", "#6F7D1C", "#427E93"];

const quarterlyData = [
  { label: "Q3 '25", email: 98000, phone: 52000, mail: 38000, sms: 27000, inPerson: 11000 },
  { label: "Q4 '25", email: 134000, phone: 61000, mail: 44000, sms: 33000, inPerson: 14000 },
  { label: "Q1 '26", email: 112000, phone: 58000, mail: 41000, sms: 29000, inPerson: 12000 },
  { label: "Q2 '26", email: 128400, phone: 74200, mail: 56300, sms: 41600, inPerson: 16540 },
];

const channels = ["Email", "Phone", "Direct Mail", "SMS", "In-Person"];
const channelKeys = ["email", "phone", "mail", "sms", "inPerson"] as const;

const REPORTS = [
  { name: "Q2 2026 Channel Performance", date: "Jun 1, 2026", size: "284 KB" },
  { name: "Constituent Touchpoint Summary", date: "May 28, 2026", size: "512 KB" },
  { name: "Campaign ROI Analysis", date: "May 15, 2026", size: "1.1 MB" },
  { name: "Lapsed Donor Re-engagement Metrics", date: "Apr 30, 2026", size: "318 KB" },
  { name: "Major Gifts Pipeline Forecast", date: "Apr 14, 2026", size: "220 KB" },
];

export function Reports({ dark, addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const cardBg = dark ? "var(--card)" : "#fff";

  const maxTotal = Math.max(...quarterlyData.map(q =>
    channelKeys.reduce((s, k) => s + (q[k] as number), 0)
  ));

  return (
    <main style={{ background: "var(--background)", padding: 24, display: "flex", flexDirection: "column", gap: 24 }} aria-label="Reports">
      {/* Stacked bar chart */}
      <section aria-label="Quarterly touchpoints by channel">
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 16px" }}>
            Quarterly Touchpoints by Channel
          </h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {channels.map((ch, i) => (
              <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: mutedFg }}>
                <div style={{ width: 10, height: 10, background: CHART_COLORS[i], flexShrink: 0 }} aria-hidden="true" />
                {ch}
              </div>
            ))}
          </div>
          <div role="img" aria-label="Stacked bar chart: quarterly touchpoints by channel">
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end", height: 200 }}>
              {quarterlyData.map(q => {
                const total = channelKeys.reduce((s, k) => s + (q[k] as number), 0);
                const pct = (total / maxTotal) * 100;
                return (
                  <div key={q.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 6 }}>
                    <div style={{ fontSize: 10.5, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>{(total / 1000).toFixed(0)}k</div>
                    <div style={{ width: "100%", height: `${pct}%`, display: "flex", flexDirection: "column-reverse", minHeight: 8 }}
                      onMouseEnter={() => setHovered(q.label)} onMouseLeave={() => setHovered(null)}>
                      {channelKeys.map((k, i) => {
                        const segPct = ((q[k] as number) / total) * 100;
                        return <div key={k} style={{ width: "100%", height: `${segPct}%`, background: CHART_COLORS[i], opacity: hovered && hovered !== q.label ? 0.3 : 1, transition: "opacity 0.15s", minHeight: 2 }} />;
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: mutedFg, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.03em" }}>{q.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <table className="sr-only">
            <caption>Quarterly touchpoints by channel</caption>
            <thead><tr><th scope="col">Quarter</th>{channels.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {quarterlyData.map(q => (
                <tr key={q.label}><td>{q.label}</td>{channelKeys.map(k => <td key={k}>{(q[k] as number).toLocaleString()}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Saved reports */}
      <section aria-label="Saved reports">
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Saved Reports
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }} aria-label="Saved reports list">
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
                {["Report Name", "Generated", "Size", ""].map(col => (
                  <th key={col} scope="col" style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REPORTS.map((r, i) => {
                const isHov = hoveredRow === i;
                return (
                  <tr key={r.name} onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                    style={{ borderBottom: `1px solid ${borderColor}`, background: isHov ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)") : (i % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)")), transition: "background 0.1s" }}>
                    <td style={{ padding: "11px 12px", fontWeight: 500, color: fg }}>{r.name}</td>
                    <td style={{ padding: "11px 12px", color: mutedFg }}>{r.date}</td>
                    <td style={{ padding: "11px 12px", color: mutedFg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }}>{r.size}</td>
                    <td style={{ padding: "11px 12px" }}>
                      <button className={`${FOCUS_CLASS} flex items-center gap-1`} aria-label={`Download ${r.name}`}
                        onClick={() => addToast(`Downloading ${r.name}`, "info")}
                        style={{ background: "none", border: `1px solid ${borderColor}`, padding: "4px 10px", cursor: "pointer", color: mutedFg, fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                        <Download size={11} aria-hidden="true" /> Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
