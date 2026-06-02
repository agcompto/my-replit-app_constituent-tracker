import { useState } from "react";
import { Plus, Search } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const USERS = [
  { id: 1, initials: "JR", name: "Jordan Rivera",   email: "jrivera@ncsu.edu",   role: "Admin",   status: "active",   lastLogin: "Jun 2, 2026" },
  { id: 2, initials: "PS", name: "Priya Sharma",    email: "psharma@ncsu.edu",    role: "Editor",  status: "active",   lastLogin: "Jun 1, 2026" },
  { id: 3, initials: "MW", name: "Marcus Webb",     email: "mwebb@ncsu.edu",      role: "Editor",  status: "active",   lastLogin: "Jun 2, 2026" },
  { id: 4, initials: "EM", name: "Elena Marchetti", email: "emarchetti@ncsu.edu", role: "Admin",   status: "active",   lastLogin: "May 31, 2026" },
  { id: 5, initials: "DO", name: "David O'Brien",   email: "dobrien@ncsu.edu",    role: "Viewer",  status: "active",   lastLogin: "May 30, 2026" },
  { id: 6, initials: "SK", name: "Sandra Kowalski", email: "skowalski@ncsu.edu",  role: "Editor",  status: "inactive", lastLogin: "Apr 12, 2026" },
];

const ROLE_COLORS: Record<string, string> = { Admin: "#CC0000", Editor: "#427E93", Viewer: "#6F7D1C" };
const AVATAR_COLORS = ["#CC0000", "#D14905", "#008473", "#427E93", "#6F7D1C", "#FAC800"];

export function UsersPage({ dark, addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const [search, setSearch] = useState("");

  const filtered = USERS.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";
  const headerBg = dark ? "var(--card)" : "#fff";
  const cardBg = dark ? "var(--card)" : "#fff";

  return (
    <main style={{ background: "var(--background)" }} aria-label="User management">
      {/* Toolbar */}
      <div style={{ padding: "14px 28px", display: "flex", gap: 12, alignItems: "center", borderBottom: `1px solid ${borderColor}`, background: headerBg }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: mutedFg, pointerEvents: "none" }} aria-hidden="true" />
          <input type="search" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search users" className={FOCUS_CLASS}
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: "var(--input-background)", border: `1px solid ${borderColor}`, fontSize: 12, color: fg, outline: "none" }} />
        </div>
        <button className={FOCUS_CLASS} onClick={() => addToast("Invitation sent", "success")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}
          aria-label="Invite new user">
          <Plus size={13} aria-hidden="true" /> Invite User
        </button>
      </div>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map((u, i) => {
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const roleColor = ROLE_COLORS[u.role] ?? mutedFg;
            const isInactive = u.status === "inactive";
            return (
              <div key={u.id} style={{ background: cardBg, border: `1px solid ${borderColor}`, padding: 18, display: "flex", gap: 14, alignItems: "flex-start", opacity: isInactive ? 0.65 : 1 }}>
                <div style={{ width: 40, height: 40, background: avatarColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", flexShrink: 0 }} aria-hidden="true">
                  {u.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: fg }}>{u.name}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: roleColor, background: `${roleColor}18`, padding: "2px 7px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{u.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: mutedFg, marginTop: 3 }}>{u.email}</div>
                  <div style={{ fontSize: 11, color: mutedFg, marginTop: 6, display: "flex", gap: 12 }}>
                    <span>Last login: <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{u.lastLogin}</span></span>
                    <span style={{ color: isInactive ? "#888" : "#6F7D1C", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5 }}>{u.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
