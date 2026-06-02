import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "warning" | "info";
export interface Toast { id: number; message: string; type: ToastType }

const ICONS: Record<ToastType, React.ElementType> = { success: CheckCircle, warning: AlertTriangle, info: Info };
const COLORS: Record<ToastType, string> = { success: "#6F7D1C", warning: "#D14905", info: "#427E93" };

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[toast.type];
  const color = COLORS[toast.type];

  useEffect(() => {
    // Trigger entrance
    const showTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 3200);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        background: "var(--card)", border: `1px solid var(--border)`,
        borderLeft: `3px solid ${color}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        minWidth: 280, maxWidth: 380,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.25s, transform 0.25s",
        pointerEvents: "auto",
      }}
    >
      <Icon size={15} style={{ color, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ flex: 1, fontSize: 13, color: "var(--foreground)", fontFamily: "'Roboto', sans-serif" }}>
        {toast.message}
      </span>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
        aria-label="Dismiss notification"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2, display: "flex", alignItems: "center" }}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Notifications"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 100,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
