import { useState } from "react";
import {
  LayoutDashboard, Megaphone, Users, Calendar, BarChart2,
  Download, ShieldCheck, Settings, UserCog, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { useMobile } from "../hooks/useMobile";

export type Page = "dashboard" | "campaigns" | "constituents" | "calendar" | "reports" | "exports" | "audit" | "users" | "settings";

const navItems: { icon: React.ElementType; label: string; page: Page }[] = [
  { icon: LayoutDashboard, label: "Dashboard",    page: "dashboard" },
  { icon: Megaphone,       label: "Campaigns",    page: "campaigns" },
  { icon: Users,           label: "Constituents", page: "constituents" },
  { icon: Calendar,        label: "Calendar",     page: "calendar" },
  { icon: BarChart2,       label: "Reports",      page: "reports" },
  { icon: Download,        label: "Exports",      page: "exports" },
  { icon: ShieldCheck,     label: "Audit",        page: "audit" },
];

const bottomItems: { icon: React.ElementType; label: string; page: Page }[] = [
  { icon: UserCog,  label: "Users",    page: "users" },
  { icon: Settings, label: "Settings", page: "settings" },
];

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

interface SidebarProps {
  activePage: Page;
  onNavigate: (p: Page) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function NavButton({ icon: Icon, label, active, collapsed, onClick }: {
  icon: React.ElementType; label: string; active: boolean; collapsed: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 transition-all duration-150 cursor-pointer w-full text-left ${FOCUS_CLASS}`}
      aria-current={active ? "page" : undefined}
      style={{
        padding: collapsed ? "9px 14px" : "8px 12px",
        background: active ? "rgba(204,0,0,0.15)" : "transparent",
        color: active ? "#CC0000" : "var(--muted-foreground)",
        border: "none",
        borderLeft: active ? "3px solid #CC0000" : "3px solid transparent",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        justifyContent: collapsed ? "center" : "flex-start",
        letterSpacing: "0.01em",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLElement).style.color = "var(--sidebar-foreground)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
        }
      }}
      title={collapsed ? label : undefined}
    >
      <Icon size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function SidebarContents({ activePage, onNavigate, collapsed }: {
  activePage: Page; onNavigate: (p: Page) => void; collapsed: boolean;
}) {
  return (
    <>
      <div style={{ height: "1px", background: "var(--sidebar-border)" }} />

      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5" aria-label="Primary">
        {navItems.map(({ icon, label, page }) => (
          <NavButton key={page} icon={icon} label={label} active={activePage === page} collapsed={collapsed} onClick={() => onNavigate(page)} />
        ))}
      </nav>

      <div style={{ height: "1px", background: "var(--sidebar-border)" }} />

      <div className="px-2 py-2 flex flex-col gap-0.5">
        {bottomItems.map(({ icon, label, page }) => (
          <NavButton key={page} icon={icon} label={label} active={activePage === page} collapsed={collapsed} onClick={() => onNavigate(page)} />
        ))}
      </div>

      <div className="flex items-center gap-3 px-4 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 30, height: 30, background: "#CC0000", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em" }}
          aria-hidden="true"
        >
          JR
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--sidebar-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Jordan Rivera
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Admin</div>
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar({ activePage, onNavigate, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);

  const handleNavigate = (p: Page) => {
    onNavigate(p);
    if (isMobile) onCloseMobile?.();
  };

  const Logo = ({ showLabel }: { showLabel: boolean }) => (
    <div className="flex items-center gap-3 px-4 py-5" style={{ minHeight: 64 }}>
      {showLabel && (
        <div>
          <div style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: "var(--sidebar-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.1 }}>
            NC State
          </div>
          <div style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.3, marginTop: 1 }}>
            Touchpoint Planner
          </div>
        </div>
      )}
    </div>
  );

  // ── Mobile: overlay drawer ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40,
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? "auto" : "none",
            transition: "opacity 0.25s",
          }}
        />

        {/* Drawer */}
        <aside
          aria-label="Main navigation"
          aria-hidden={!mobileOpen}
          style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 41,
            display: "flex", flexDirection: "column",
            background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
            fontFamily: "'Roboto', sans-serif",
          }}
        >
          <div className="flex items-center justify-between pr-3">
            <Logo showLabel={true} />
            <button
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className={`flex items-center justify-center ${FOCUS_CLASS}`}
              style={{ width: 32, height: 32, background: "none", border: "1px solid var(--sidebar-border)", cursor: "pointer", color: "var(--muted-foreground)", flexShrink: 0 }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <SidebarContents activePage={activePage} onNavigate={handleNavigate} collapsed={false} />
        </aside>
      </>
    );
  }

  // ── Desktop: collapsible sidebar ────────────────────────────────────────────
  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 relative"
      aria-label="Main navigation"
      style={{
        width: collapsed ? "64px" : "220px",
        background: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <Logo showLabel={!collapsed} />
      <SidebarContents activePage={activePage} onNavigate={handleNavigate} collapsed={collapsed} />

      {/* Collapse toggle — full-width strip at the bottom */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className={`flex items-center transition-all duration-150 w-full ${FOCUS_CLASS}`}
        style={{
          padding: collapsed ? "10px 0" : "10px 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
          background: "transparent",
          border: "none",
          borderTop: "1px solid var(--sidebar-border)",
          color: "var(--muted-foreground)",
          cursor: "pointer",
          fontSize: 11.5,
          fontFamily: "'Roboto Condensed', sans-serif",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "var(--sidebar-foreground)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}
      >
        {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <><ChevronLeft size={14} aria-hidden="true" /><span>Collapse</span></>}
      </button>
    </aside>
  );
}
