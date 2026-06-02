import { useState } from "react";
import { Download, FileText, Eye } from "lucide-react";
import type { Toast } from "./Toast";
import { CsvPreviewModal } from "./CsvPreviewModal";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const EXPORT_TYPES = [
  { label: "Constituent List",   description: "All constituents with contact info, type, and giving history.",          formats: ["CSV", "XLSX"],        rows: "10,284", updated: "May 30, 2026" },
  { label: "Touchpoint Log",     description: "Full record of all touchpoints with dates, channels, and campaign IDs.", formats: ["CSV", "XLSX", "JSON"], rows: "847,921", updated: "Jun 1, 2026" },
  { label: "Campaign Summary",   description: "Campaign names, statuses, touchpoint counts, and owners.",               formats: ["CSV", "XLSX"],        rows: "389", updated: "Jun 1, 2026" },
  { label: "Major Gift Prospects", description: "Constituents flagged as major gift prospects with engagement scores.", formats: ["CSV", "XLSX"],        rows: "1,204", updated: "May 28, 2026" },
  { label: "Lapsed Donors",      description: "Donors with no giving activity in 18+ months and last contact dates.",  formats: ["CSV"],                rows: "3,842", updated: "May 25, 2026" },
  { label: "Audit Trail",        description: "Full system audit log for compliance reporting.",                        formats: ["CSV", "JSON"],        rows: "22,410", updated: "Jun 2, 2026" },
];

const RECENT_EXPORTS = [
  { name: "Constituent List — May 2026", format: "XLSX", size: "1.8 MB", date: "May 30, 2026" },
  { name: "Touchpoint Log Q1 2026",      format: "CSV",  size: "4.2 MB", date: "Apr 5, 2026" },
  { name: "Major Gift Prospects",        format: "XLSX", size: "320 KB", date: "Apr 1, 2026" },
  { name: "Audit Trail — March",         format: "JSON", size: "8.6 MB", date: "Mar 31, 2026" },
];

interface PreviewTarget { label: string; format: string }

export function Exports({ dark, addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [queued, setQueued] = useState<string[]>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const cardBg = dark ? "var(--card)" : "#fff";
  const redText = dark ? "#ff6060" : "#CC0000";

  const queue = (label: string, fmt: string) => {
    const key = `${label}-${fmt}`;
    setQueued(q => q.includes(key) ? q : [...q, key]);
    addToast(`${label} (${fmt}) export queued`, "success");
    setTimeout(() => setQueued(q => q.filter(x => x !== key)), 4000);
  };

  return (
    <main style={{ background: "var(--background)", padding: 24, display: "flex", flexDirection: "column", gap: 24 }} aria-label="Exports">

      {/* Export builder */}
      <section aria-label="Create new export">
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 16px" }}>
            Create Export
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {EXPORT_TYPES.map(et => (
              <div key={et.label} style={{ border: `1px solid ${borderColor}`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <FileText size={15} style={{ color: redText, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: fg }}>{et.label}</div>
                    <div style={{ fontSize: 11.5, color: mutedFg, marginTop: 3, lineHeight: 1.5 }}>{et.description}</div>
                  </div>
                </div>

                {/* Metadata row */}
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>
                  <span>{et.rows} rows</span>
                  <span>Updated {et.updated}</span>
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Preview button */}
                  <button className={FOCUS_CLASS} onClick={() => setPreview({ label: et.label, format: et.formats[0] })}
                    aria-label={`Preview ${et.label}`}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11.5, background: "transparent", border: `1px solid ${borderColor}`, color: mutedFg, cursor: "pointer" }}>
                    <Eye size={11} aria-hidden="true" /> Preview
                  </button>

                  <div style={{ width: 1, height: 20, background: borderColor }} />

                  {et.formats.map(fmt => {
                    const key = `${et.label}-${fmt}`;
                    const done = queued.includes(key);
                    return (
                      <button key={fmt} className={FOCUS_CLASS}
                        onClick={() => queue(et.label, fmt)}
                        aria-label={`Export ${et.label} as ${fmt}`}
                        style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, background: done ? "rgba(111,125,28,0.15)" : "transparent", border: `1px solid ${done ? "#6F7D1C" : borderColor}`, color: done ? "#6F7D1C" : mutedFg, cursor: "pointer", fontFamily: "'Roboto Mono', monospace", display: "flex", alignItems: "center", gap: 4 }}>
                        {done ? "✓ " : ""}{fmt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent exports */}
      <section aria-label="Recent exports">
        <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Recent Exports
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }} aria-label="Recent export files">
            <thead>
              <tr style={{ background: dark ? "#1a1a1a" : "#f0f0f0", borderBottom: `1px solid ${borderColor}` }}>
                {["File", "Format", "Size", "Date", ""].map(col => (
                  <th key={col} scope="col" style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT_EXPORTS.map((r, i) => {
                const isHov = hoveredRow === i;
                return (
                  <tr key={r.name} onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                    style={{ borderBottom: `1px solid ${borderColor}`, background: isHov ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)") : (i % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)")), transition: "background 0.1s" }}>
                    <td style={{ padding: "11px 12px", fontWeight: 500, color: fg }}>{r.name}</td>
                    <td style={{ padding: "11px 12px", color: mutedFg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }}>{r.format}</td>
                    <td style={{ padding: "11px 12px", color: mutedFg, fontFamily: "'Roboto Mono', monospace", fontSize: 12 }}>{r.size}</td>
                    <td style={{ padding: "11px 12px", color: mutedFg }}>{r.date}</td>
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

      {preview && (
        <CsvPreviewModal
          open={true}
          dark={dark}
          exportLabel={preview.label}
          format={preview.format}
          onClose={() => setPreview(null)}
          addToast={addToast}
        />
      )}
    </main>
  );
}
