import { type ReactNode } from "react";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  dark?: boolean;
}

export function EmptyState({ icon, title, body, action, dark }: EmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 32px", gap: 16, textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center",
        background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        border: "1px solid var(--border)",
        color: "var(--muted-foreground)",
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--foreground)", marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 320, lineHeight: 1.6 }}>
          {body}
        </div>
      </div>
      {action && (
        <button onClick={action.onClick} className={FOCUS_CLASS}
          style={{ marginTop: 4, padding: "8px 20px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
