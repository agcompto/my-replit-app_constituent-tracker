import {
  LayoutDashboard, Megaphone, Users, Calendar, BarChart2,
  Download, ShieldCheck, Settings, UserCog, Bell, Sun, Moon, Search, Menu,
} from "lucide-react";
import type { Page } from "./Sidebar";
import { useMobile } from "../hooks/useMobile";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const PAGE_META: Record<Page, { label: string; sub: string; Icon: React.ElementType }> = {
  dashboard:    { label: "Dashboard",    sub: "Communication volume and campaign intelligence", Icon: LayoutDashboard },
  campaigns:    { label: "Campaigns",    sub: "Manage and monitor outreach campaigns",          Icon: Megaphone },
  constituents: { label: "Constituents", sub: "Constituent directory and engagement history",   Icon: Users },
  calendar:     { label: "Calendar",     sub: "Scheduled touchpoints and upcoming activity",    Icon: Calendar },
  reports:      { label: "Reports",      sub: "Analytics and performance summaries",            Icon: BarChart2 },
  exports:      { label: "Exports",      sub: "Download constituent and campaign data",         Icon: Download },
  audit:        { label: "Audit Log",    sub: "System event history and compliance trail",      Icon: ShieldCheck },
  users:        { label: "Users",        sub: "Manage team members and permissions",            Icon: UserCog },
  settings:     { label: "Settings",     sub: "Account, notifications, and preferences",       Icon: Settings },
};

interface HeaderProps {
  page: Page;
  dark: boolean;
  onToggleDark: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenMobileNav?: () => void;
  notificationCount?: number;
}

export function Header({ page, dark, onToggleDark, onOpenSearch, onOpenNotifications, onOpenMobileNav, notificationCount = 0 }: HeaderProps) {
  const isMobile = useMobile();
  const { label, sub, Icon } = PAGE_META[page];
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const shortcut = isMac ? "⌘K" : "Ctrl K";

  return (
    <header
      className="flex items-center gap-3 sticky top-0 z-20"
      style={{
        padding: isMobile ? "12px 16px" : "16px 28px",
        background: "var(--background)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Hamburger — mobile only */}
      {isMobile && (
        <button
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className={`flex items-center justify-center flex-shrink-0 ${FOCUS_CLASS}`}
          style={{ width: 36, height: 36, background: "var(--muted)", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
        >
          <Menu size={16} aria-hidden="true" />
        </button>
      )}

      {/* Page identity */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon size={18} style={{ color: dark ? "#ff6060" : "#CC0000", flexShrink: 0 }} aria-hidden="true" />
        <div className="min-w-0">
          <h1 style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: isMobile ? 15 : 18, color: "var(--foreground)", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.2, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </h1>
          {!isMobile && (
            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>{sub}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search — desktop: full button; mobile: icon only */}
        {isMobile ? (
          <button
            onClick={onOpenSearch}
            aria-label="Open global search"
            className={`flex items-center justify-center ${FOCUS_CLASS}`}
            style={{ width: 36, height: 36, background: "var(--muted)", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
          >
            <Search size={15} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={onOpenSearch}
            aria-label="Open global search"
            className={`flex items-center gap-2 ${FOCUS_CLASS}`}
            style={{
              padding: "6px 12px", background: "var(--muted)", border: "1px solid var(--border)",
              color: "var(--muted-foreground)", cursor: "pointer", fontSize: 12,
              fontFamily: "'Roboto', sans-serif",
            }}
          >
            <Search size={12} aria-hidden="true" />
            <span style={{ color: "var(--muted-foreground)" }}>Search…</span>
            <kbd style={{
              marginLeft: 8, padding: "1px 5px", background: "var(--background)",
              border: "1px solid var(--border)", fontSize: 10.5,
              fontFamily: "'Roboto Mono', monospace", color: "var(--muted-foreground)",
            }}>
              {shortcut}
            </kbd>
          </button>
        )}

        {/* Dark / light toggle — hide on small mobile to save space */}
        {!isMobile && (
          <button
            onClick={onToggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className={`flex items-center justify-center transition-all duration-150 ${FOCUS_CLASS}`}
            style={{ width: 36, height: 36, background: "var(--muted)", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        )}

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} unread)` : ""}`}
          aria-haspopup="dialog"
          className={`flex items-center justify-center relative ${FOCUS_CLASS}`}
          style={{ width: 36, height: 36, background: "var(--muted)", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
        >
          <Bell size={15} aria-hidden="true" />
          {notificationCount > 0 && (
            <span aria-hidden="true" className="absolute" style={{ top: 7, right: 7, width: 7, height: 7, background: "#CC0000" }} />
          )}
        </button>

        {/* User avatar */}
        {!isMobile && (
          <div
            style={{ width: 32, height: 32, background: "#CC0000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", flexShrink: 0 }}
            aria-label="Jordan Rivera, Admin"
            role="img"
          >
            JR
          </div>
        )}

        {/* Mobile: dark toggle in avatar spot */}
        {isMobile && (
          <button
            onClick={onToggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className={`flex items-center justify-center ${FOCUS_CLASS}`}
            style={{ width: 36, height: 36, background: "var(--muted)", border: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        )}
      </div>
    </header>
  );
}
