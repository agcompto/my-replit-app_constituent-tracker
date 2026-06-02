import { useState } from "react";
import { Settings, Bell, Shield, Database, Moon, Sun } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

function Toggle({ on, onChange, id, label }: { on: boolean; onChange: () => void; id: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <label htmlFor={id} style={{ fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>{label}</label>
      <button id={id} role="switch" aria-checked={on} onClick={onChange} className={FOCUS_CLASS} aria-label={label}
        style={{ width: 40, height: 22, background: on ? "#CC0000" : "var(--switch-background)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, background: "#fff", transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

const SECTIONS = [
  { id: "profile",       label: "Profile",       icon: Settings },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security",      label: "Security",       icon: Shield },
  { id: "data",          label: "Data & Privacy", icon: Database },
];

export function SettingsPage({ dark, onToggleDark, addToast }: { dark: boolean; onToggleDark: () => void; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [activeSection, setActiveSection] = useState("profile");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(false);
  const [notifDigest, setNotifDigest] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);
  const [dataAnon, setDataAnon] = useState(true);

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const headerBg = dark ? "var(--card)" : "#fff";
  const cardBg = dark ? "var(--card)" : "#fff";

  return (
    <main style={{ display: "flex", height: "100%" }} aria-label="Settings">
      {/* Section nav */}
      <nav aria-label="Settings sections" style={{ width: 180, borderRight: `1px solid ${borderColor}`, background: headerBg, padding: "12px 8px", flexShrink: 0 }}>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveSection(id)} aria-current={activeSection === id ? "page" : undefined} className={FOCUS_CLASS}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: activeSection === id ? (dark ? "rgba(255,96,96,0.10)" : "rgba(204,0,0,0.08)") : "transparent", borderLeft: `3px solid ${activeSection === id ? "#CC0000" : "transparent"}`, color: activeSection === id ? (dark ? "#ff6060" : "#CC0000") : mutedFg, border: "none", borderLeftStyle: "solid", borderLeftWidth: 3, borderLeftColor: activeSection === id ? "#CC0000" : "transparent", cursor: "pointer", fontSize: 13, textAlign: "left" }}>
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
        {activeSection === "profile" && (
          <section aria-label="Profile settings">
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 20px" }}>Profile</h2>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 500 }}>
              {[
                { label: "Full Name", defaultValue: "Jordan Rivera", type: "text" },
                { label: "Email Address", defaultValue: "jrivera@ncsu.edu", type: "email" },
                { label: "Unity ID", defaultValue: "jrivera", type: "text" },
                { label: "Department", defaultValue: "University Development", type: "text" },
              ].map(({ label, defaultValue, type }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase", color: mutedFg }}>{label}</label>
                  <input type={type} defaultValue={defaultValue} className={FOCUS_CLASS}
                    style={{ padding: "8px 10px", background: "var(--input-background)", border: `1px solid ${borderColor}`, fontSize: 13, color: fg, outline: "none" }} />
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 18 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase", color: mutedFg, marginBottom: 12 }}>Appearance</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={onToggleDark} className={FOCUS_CLASS} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", border: `1px solid ${borderColor}`, background: "transparent", cursor: "pointer", color: mutedFg, fontSize: 12 }}>
                    {dark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                    {dark ? "Light mode" : "Dark mode"}
                  </button>
                  <span style={{ fontSize: 12, color: mutedFg }}>Currently: <strong style={{ color: fg }}>{dark ? "Dark" : "Light"}</strong></span>
                </div>
              </div>
              <button className={FOCUS_CLASS} onClick={() => addToast("Profile saved", "success")}
                style={{ alignSelf: "flex-start", padding: "8px 20px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Save Changes
              </button>
            </div>
          </section>
        )}

        {activeSection === "notifications" && (
          <section aria-label="Notification settings">
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 20px" }}>Notifications</h2>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 500 }}>
              <Toggle id="notif-email" on={notifEmail} onChange={() => { setNotifEmail(v => !v); addToast("Notification preference saved", "info"); }} label="Email notifications for campaign events" />
              <Toggle id="notif-sms" on={notifSms} onChange={() => { setNotifSms(v => !v); addToast("Notification preference saved", "info"); }} label="SMS alerts for critical system events" />
              <Toggle id="notif-digest" on={notifDigest} onChange={() => { setNotifDigest(v => !v); addToast("Notification preference saved", "info"); }} label="Weekly activity digest email" />
            </div>
          </section>
        )}

        {activeSection === "security" && (
          <section aria-label="Security settings">
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 20px" }}>Security</h2>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 500 }}>
              <Toggle id="2fa" on={twoFactor} onChange={() => { setTwoFactor(v => !v); addToast(twoFactor ? "Two-factor authentication disabled" : "Two-factor authentication enabled", twoFactor ? "warning" : "success"); }} label="Two-factor authentication (Duo)" />
              <Toggle id="session" on={sessionTimeout} onChange={() => { setSessionTimeout(v => !v); addToast("Session timeout setting saved", "info"); }} label="Auto-lock session after 30 minutes" />
              <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 16 }}>
                <button className={FOCUS_CLASS} onClick={() => addToast("Password change email sent", "info")}
                  style={{ padding: "8px 16px", border: `1px solid ${borderColor}`, background: "transparent", cursor: "pointer", color: fg, fontSize: 12 }}>
                  Change Password
                </button>
              </div>
            </div>
          </section>
        )}

        {activeSection === "data" && (
          <section aria-label="Data and privacy settings">
            <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 20px" }}>Data &amp; Privacy</h2>
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 500 }}>
              <Toggle id="anon" on={dataAnon} onChange={() => { setDataAnon(v => !v); addToast("Data anonymization setting saved", "info"); }} label="Anonymize constituent data in exports" />
              <div style={{ fontSize: 12.5, color: mutedFg, lineHeight: 1.7, background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", padding: 14, borderLeft: "3px solid #427E93" }}>
                Constituent data is governed by NC State's data governance policies and FERPA. Contact your data steward before bulk exporting PII.
              </div>
              <button className={FOCUS_CLASS} onClick={() => addToast("Data export request submitted", "info")}
                style={{ alignSelf: "flex-start", padding: "8px 16px", border: `1px solid ${dark ? "rgba(255,96,96,0.4)" : "rgba(204,0,0,0.3)"}`, background: "transparent", cursor: "pointer", color: dark ? "#ff6060" : "#CC0000", fontSize: 12 }}>
                Request Data Export
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
