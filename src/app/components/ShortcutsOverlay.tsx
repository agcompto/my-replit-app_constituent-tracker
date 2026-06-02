import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const SHORTCUTS = [
  { section: "Navigation", items: [
    { keys: ["G", "D"], label: "Go to Dashboard" },
    { keys: ["G", "C"], label: "Go to Campaigns" },
    { keys: ["G", "N"], label: "Go to Constituents" },
    { keys: ["G", "L"], label: "Go to Calendar" },
    { keys: ["G", "R"], label: "Go to Reports" },
    { keys: ["G", "E"], label: "Go to Exports" },
    { keys: ["G", "A"], label: "Go to Audit Log" },
    { keys: ["G", "U"], label: "Go to Users" },
    { keys: ["G", "S"], label: "Go to Settings" },
  ]},
  { section: "Global", items: [
    { keys: ["⌘", "K"], label: "Open global search" },
    { keys: ["?"],       label: "Show keyboard shortcuts" },
    { keys: ["Esc"],     label: "Close panel / overlay" },
  ]},
  { section: "Tables", items: [
    { keys: ["Space"],       label: "Toggle row selection" },
    { keys: ["Shift", "A"],  label: "Select all on page" },
    { keys: ["Esc"],         label: "Clear selection" },
  ]},
];

interface Props {
  open: boolean;
  onClose: () => void;
  dark: boolean;
}

export function ShortcutsOverlay({ open, onClose, dark }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const borderColor = "var(--border)";
  const fg = "var(--foreground)";
  const mutedFg = "var(--muted-foreground)";

  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50 }} />

      <div role="dialog" aria-label="Keyboard shortcuts" aria-modal="true"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(580px,90vw)", zIndex: 51, background: "var(--card)", border: `1px solid ${borderColor}`, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ flex: 1, fontSize: 13, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: fg, margin: 0 }}>
            Keyboard Shortcuts
          </h2>
          <kbd style={{ padding: "2px 7px", background: dark ? "#2a2a2a" : "#f0f0f0", border: `1px solid ${borderColor}`, fontSize: 11, fontFamily: "'Roboto Mono', monospace", color: mutedFg }}>?</kbd>
          <button ref={closeRef} onClick={onClose} aria-label="Close shortcuts overlay" className={FOCUS_CLASS}
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: 6, cursor: "pointer", color: mutedFg, display: "flex", alignItems: "center" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Sections */}
        <div style={{ overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
          {SHORTCUTS.map(({ section, items }) => (
            <section key={section} aria-label={`${section} shortcuts`}>
              <div style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: mutedFg, marginBottom: 10 }}>
                {section}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map(({ keys, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${borderColor}` }}>
                    <span style={{ fontSize: 13, color: fg }}>{label}</span>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {keys.map((k, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <kbd style={{ padding: "3px 8px", background: dark ? "#2a2a2a" : "#f0f0f0", border: `1px solid ${borderColor}`, fontSize: 11.5, fontFamily: "'Roboto Mono', monospace", color: fg, fontWeight: 600, minWidth: 24, textAlign: "center" }}>
                            {k}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span style={{ fontSize: 10, color: mutedFg }}>then</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${borderColor}`, fontSize: 11.5, color: mutedFg }}>
          Shortcuts are disabled when focus is inside an input field.
        </div>
      </div>
    </>
  );
}
