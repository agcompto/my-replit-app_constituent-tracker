import { useState } from "react";
import { X, Bell, CheckCircle, AlertTriangle, ShieldAlert, Check } from "lucide-react";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

type NotifType = "info" | "warning" | "critical";

interface Notification {
  id: number;
  type: NotifType;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const INITIAL: Notification[] = [
  { id: 1, type: "info",     title: "Batch send complete",     body: "Q2 Annual Fund email batch 3 delivered to 6,200 recipients.", time: "2 min ago",  read: false },
  { id: 2, type: "warning",  title: "Failed login attempt",    body: "3 consecutive failures for mwebb@ncsu.edu from 198.x.x.x.", time: "31 min ago", read: false },
  { id: 3, type: "info",     title: "Export ready",            body: "Constituent List (XLSX, 1.8 MB) is ready to download.",       time: "1 hr ago",   read: false },
  { id: 4, type: "critical", title: "Permission elevated",     body: "Jordan Rivera elevated Elena Marchetti to Admin role.",        time: "2 hr ago",   read: true  },
  { id: 5, type: "info",     title: "Campaign activated",      body: "Athletic Fund Drive changed from Draft to Active.",            time: "Yesterday",  read: true  },
  { id: 6, type: "warning",  title: "Bulk delete completed",   body: "1,204 duplicate touchpoints purged by system batch job.",     time: "Yesterday",  read: true  },
  { id: 7, type: "info",     title: "New user added",          body: "Elena Marchetti invited and accepted — role: Admin.",         time: "2 days ago", read: true  },
];

const TYPE_META: Record<NotifType, { Icon: React.ElementType; color: string }> = {
  info:     { Icon: CheckCircle,  color: "#427E93" },
  warning:  { Icon: AlertTriangle, color: "#D14905" },
  critical: { Icon: ShieldAlert,  color: "#CC0000" },
};

interface Props {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
}

export function NotificationsPanel({ open, dark, onClose, onUnreadChange }: Props) {
  const [notifications, setNotifications] = useState(INITIAL);

  const unread = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    onUnreadChange(0);
  };

  const markRead = (id: number) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updated);
    onUnreadChange(updated.filter(n => !n.read).length);
  };

  const dismiss = (id: number) => {
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    onUnreadChange(updated.filter(n => !n.read).length);
  };

  const borderColor = "var(--border)";
  const fg = "var(--foreground)";
  const mutedFg = "var(--muted-foreground)";
  const panelBg = dark ? "#1c1c1c" : "#ffffff";

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 40, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.2s" }} />

      {/* Panel */}
      <div role="dialog" aria-label="Notifications" aria-modal="true"
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 380, background: panelBg, borderLeft: `1px solid ${borderColor}`, zIndex: 41, display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={16} style={{ color: dark ? "#ff6060" : "#CC0000" }} aria-hidden="true" />
          <h2 style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", color: fg, margin: 0 }}>
            Notifications
          </h2>
          {unread > 0 && (
            <span style={{ background: "#CC0000", color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", fontFamily: "'Roboto Mono', monospace" }}>
              {unread} new
            </span>
          )}
          {unread > 0 && (
            <button onClick={markAllRead} className={FOCUS_CLASS}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11.5, border: `1px solid ${borderColor}`, background: "transparent", cursor: "pointer", color: mutedFg }}>
              <Check size={11} aria-hidden="true" /> Mark all read
            </button>
          )}
          <button onClick={onClose} aria-label="Close notifications" className={FOCUS_CLASS}
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: 6, cursor: "pointer", color: mutedFg, display: "flex", alignItems: "center" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {notifications.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: mutedFg, fontSize: 13 }}>
              No notifications.
            </div>
          )}
          {notifications.map((n, i) => {
            const { Icon, color } = TYPE_META[n.type];
            return (
              <div key={n.id}
                style={{ display: "flex", gap: 12, padding: "14px 18px", borderBottom: i < notifications.length - 1 ? `1px solid ${borderColor}` : "none", background: n.read ? "transparent" : (dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"), position: "relative", cursor: n.read ? "default" : "pointer" }}
                onClick={() => !n.read && markRead(n.id)}
              >
                {/* Unread dot */}
                {!n.read && (
                  <div aria-hidden="true" style={{ position: "absolute", top: 18, left: 6, width: 5, height: 5, background: "#CC0000" }} />
                )}

                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <Icon size={15} style={{ color }} aria-hidden="true" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: fg, lineHeight: 1.3 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: mutedFg, marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: mutedFg, marginTop: 5, fontFamily: "'Roboto Mono', monospace" }}>{n.time}</div>
                </div>

                <button onClick={e => { e.stopPropagation(); dismiss(n.id); }} aria-label={`Dismiss: ${n.title}`} className={FOCUS_CLASS}
                  style={{ background: "none", border: "none", cursor: "pointer", color: mutedFg, padding: 2, flexShrink: 0, display: "flex", alignItems: "flex-start", opacity: 0.5 }}>
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
