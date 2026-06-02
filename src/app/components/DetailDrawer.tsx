import { useEffect, useRef } from "react";
import { X, Megaphone, Users, Mail, Phone, Calendar, TrendingUp, Tag, User, Clock } from "lucide-react";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

// ── Campaign drawer ────────────────────────────────────────────────────────

export interface CampaignDetail {
  kind: "campaign";
  id: number;
  name: string;
  type: string;
  status: string;
  channel: string;
  touchpoints: number;
  constituents: number;
  created: string;
  owner: string;
}

const CAMPAIGN_ACTIVITY: Record<number, { date: string; event: string }[]> = {
  1: [
    { date: "Jun 2, 2026",  event: "Email batch 3 sent — 6,200 recipients" },
    { date: "May 30, 2026", event: "Email batch 2 sent — 6,100 recipients" },
    { date: "May 28, 2026", event: "Campaign activated by Jordan Rivera" },
  ],
  2: [
    { date: "May 14, 2026", event: "Campaign marked completed" },
    { date: "May 12, 2026", event: "Final thank-you wave sent — 8,432 recipients" },
    { date: "May 3, 2026",  event: "Follow-up sequence launched" },
  ],
  3: [
    { date: "May 2, 2026",  event: "Pipeline activated" },
    { date: "Apr 28, 2026", event: "Prospect list finalized — 312 constituents" },
  ],
  4: [{ date: "Apr 29, 2026", event: "Draft created by Elena Marchetti" }],
  5: [
    { date: "Apr 22, 2026", event: "Campaign paused — pending content review" },
    { date: "Apr 18, 2026", event: "Initial wave sent — 312 recipients" },
  ],
  6: [
    { date: "Apr 10, 2026", event: "Campaign completed — 54,200 total sends" },
    { date: "Aug 28, 2025", event: "Welcome series launched" },
  ],
  7: [
    { date: "Apr 2, 2026",  event: "Email batch 2 sent — 4,840 recipients" },
    { date: "Mar 30, 2026", event: "Campaign activated by David O'Brien" },
  ],
  8: [{ date: "Mar 22, 2026", event: "Draft created by Priya Sharma" }],
};

// ── Constituent drawer ─────────────────────────────────────────────────────

export interface ConstituentDetail {
  kind: "constituent";
  id: string;
  name: string;
  email: string;
  type: string;
  class: string;
  giving: string;
  touchpoints: number;
  lastContact: string;
  status: string;
}

const CONSTITUENT_TOUCHPOINTS: Record<string, { date: string; campaign: string; channel: string }[]> = {
  "CONST-00482": [
    { date: "May 30, 2026", campaign: "Q2 Annual Fund Appeal", channel: "Email" },
    { date: "May 12, 2026", campaign: "Spring Gala Follow-Up", channel: "Phone" },
    { date: "Apr 18, 2026", campaign: "Major Gift Pipeline", channel: "In-Person" },
  ],
  "CONST-01193": [
    { date: "May 28, 2026", campaign: "Board Member Comms", channel: "Email" },
    { date: "May 10, 2026", campaign: "Q2 Annual Fund Appeal", channel: "Email" },
  ],
  "CONST-00718": [
    { date: "May 25, 2026", campaign: "Major Gift Pipeline", channel: "Phone" },
    { date: "Apr 30, 2026", campaign: "Q2 Annual Fund Appeal", channel: "Email" },
  ],
  "CONST-02201": [
    { date: "May 20, 2026", campaign: "Major Gift Pipeline", channel: "In-Person" },
    { date: "May 5, 2026",  campaign: "Athletic Fund Drive", channel: "Email" },
  ],
  "CONST-00934": [
    { date: "May 18, 2026", campaign: "Q2 Annual Fund Appeal", channel: "Email" },
    { date: "Apr 15, 2026", campaign: "Freshman Welcome Series", channel: "SMS" },
  ],
};

// ── Shared drawer shell ────────────────────────────────────────────────────

export type DrawerItem = CampaignDetail | ConstituentDetail | null;

function statusStyle(status: string, dark: boolean) {
  const r = dark ? "#ff6060" : "#CC0000";
  const map: Record<string, { bg: string; text: string }> = {
    active:        { bg: dark ? "rgba(255,96,96,0.12)" : "rgba(204,0,0,0.10)", text: r },
    completed:     { bg: "rgba(111,125,28,0.15)", text: "#6F7D1C" },
    draft:         { bg: "rgba(128,128,128,0.10)", text: "#888888" },
    paused:        { bg: "rgba(209,73,5,0.14)", text: "#D14905" },
    "Major Donor": { bg: dark ? "rgba(255,96,96,0.12)" : "rgba(204,0,0,0.10)", text: r },
    Active:        { bg: "rgba(66,126,147,0.14)", text: "#427E93" },
    Lapsed:        { bg: "rgba(128,128,128,0.10)", text: "#888888" },
  };
  return map[status] ?? { bg: "rgba(128,128,128,0.10)", text: "#888888" };
}

interface DrawerProps {
  item: DrawerItem;
  dark: boolean;
  onClose: () => void;
}

export function DetailDrawer({ item, dark, onClose }: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (item) setTimeout(() => closeRef.current?.focus(), 50);
  }, [item]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const drawerBg = dark ? "#1c1c1c" : "#ffffff";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40,
          opacity: item ? 1 : 0, pointerEvents: item ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item ? (item.kind === "campaign" ? `Campaign: ${item.name}` : `Constituent: ${item.name}`) : "Detail panel"}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 400,
          background: drawerBg, borderLeft: `1px solid ${borderColor}`,
          zIndex: 41, display: "flex", flexDirection: "column",
          transform: item ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 16px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {item && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {item.kind === "campaign"
                    ? <Megaphone size={14} style={{ color: dark ? "#ff6060" : "#CC0000" }} aria-hidden="true" />
                    : <Users size={14} style={{ color: dark ? "#ff6060" : "#CC0000" }} aria-hidden="true" />}
                  <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: mutedFg }}>
                    {item.kind === "campaign" ? "Campaign" : "Constituent"}
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: fg, fontFamily: "'Roboto Condensed', sans-serif", lineHeight: 1.3, letterSpacing: "0.01em" }}>
                  {item.name}
                </div>
                <div style={{ marginTop: 8 }}>
                  {(() => { const s = statusStyle(item.status, dark); return (
                    <span style={{ background: s.bg, color: s.text, padding: "3px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {item.status}
                    </span>
                  ); })()}
                </div>
              </>
            )}
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close detail panel" className={FOCUS_CLASS}
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: 6, cursor: "pointer", color: mutedFg, display: "flex", alignItems: "center", flexShrink: 0 }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        {item?.kind === "campaign" && <CampaignContent item={item} dark={dark} />}
        {item?.kind === "constituent" && <ConstituentContent item={item} dark={dark} />}
      </div>
    </>
  );
}

// ── Campaign content ───────────────────────────────────────────────────────

function CampaignContent({ item, dark }: { item: CampaignDetail; dark: boolean }) {
  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const activity = CAMPAIGN_ACTIVITY[item.id] ?? [];

  const metrics = [
    { label: "Touchpoints", value: item.touchpoints.toLocaleString(), icon: TrendingUp },
    { label: "Constituents", value: item.constituents.toLocaleString(), icon: Users },
    { label: "Channel", value: item.channel, icon: Mail },
    { label: "Type", value: item.type, icon: Tag },
  ];

  return (
    <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} style={{ background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${borderColor}`, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon size={11} style={{ color: mutedFg }} aria-hidden="true" />
              <span style={{ fontSize: 10.5, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg }}>{label}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: fg, fontFamily: "'Roboto Mono', monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { icon: User, label: "Owner", value: item.owner },
          { icon: Calendar, label: "Created", value: item.created },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <Icon size={13} style={{ color: mutedFg, flexShrink: 0 }} aria-hidden="true" />
            <span style={{ color: mutedFg, minWidth: 60 }}>{label}</span>
            <span style={{ color: fg, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Activity */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", color: mutedFg, marginBottom: 12 }}>
          Activity
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {activity.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, background: "#CC0000", marginTop: 4 }} />
                {i < activity.length - 1 && <div style={{ width: 1, flex: 1, background: borderColor, marginTop: 4 }} />}
              </div>
              <div style={{ paddingBottom: i < activity.length - 1 ? 0 : 0 }}>
                <div style={{ fontSize: 12.5, color: fg, lineHeight: 1.4 }}>{a.event}</div>
                <div style={{ fontSize: 11, color: mutedFg, marginTop: 3, fontFamily: "'Roboto Mono', monospace" }}>{a.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Constituent content ────────────────────────────────────────────────────

function ConstituentContent({ item, dark }: { item: ConstituentDetail; dark: boolean }) {
  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const recentTouchpoints = CONSTITUENT_TOUCHPOINTS[item.id] ?? [];

  const metrics = [
    { label: "Total Giving", value: item.giving },
    { label: "Touchpoints", value: String(item.touchpoints) },
    { label: "Class Year", value: item.class },
    { label: "Type", value: item.type },
  ];

  return (
    <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Contact */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { icon: Mail, label: "Email", value: item.email },
          { icon: Clock, label: "Last Contact", value: item.lastContact },
          { icon: Tag, label: "ID", value: item.id },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <Icon size={13} style={{ color: mutedFg, flexShrink: 0 }} aria-hidden="true" />
            <span style={{ color: mutedFg, minWidth: 90 }}>{label}</span>
            <span style={{ color: fg, fontWeight: 500, fontFamily: label === "ID" ? "'Roboto Mono', monospace" : "inherit", fontSize: label === "ID" ? 12 : 13 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {metrics.map(({ label, value }) => (
          <div key={label} style={{ background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${borderColor}`, padding: "12px 14px" }}>
            <div style={{ fontSize: 10.5, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: fg, fontFamily: "'Roboto Mono', monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Recent touchpoints */}
      {recentTouchpoints.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", color: mutedFg, marginBottom: 12 }}>
            Recent Touchpoints
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {recentTouchpoints.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, background: "#427E93", marginTop: 4 }} />
                  {i < recentTouchpoints.length - 1 && <div style={{ width: 1, flex: 1, background: borderColor, marginTop: 4 }} />}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: fg, fontWeight: 500 }}>{t.campaign}</div>
                  <div style={{ fontSize: 11.5, color: mutedFg, marginTop: 2 }}>{t.channel}</div>
                  <div style={{ fontSize: 11, color: mutedFg, marginTop: 2, fontFamily: "'Roboto Mono', monospace" }}>{t.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
