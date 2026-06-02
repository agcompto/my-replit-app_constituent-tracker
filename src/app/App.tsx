import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar, type Page } from "./components/Sidebar";
import { useMobile } from "./hooks/useMobile";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { Campaigns } from "./components/Campaigns";
import { Constituents } from "./components/Constituents";
import { CalendarPage } from "./components/CalendarPage";
import { Reports } from "./components/Reports";
import { Exports } from "./components/Exports";
import { Audit } from "./components/Audit";
import { UsersPage } from "./components/UsersPage";
import { SettingsPage } from "./components/SettingsPage";
import { ToastContainer, type Toast } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { PageSkeleton } from "./components/PageSkeleton";

let toastCounter = 0;

const PAGE_SKELETON_TYPE: Record<Page, "table" | "cards" | "dashboard"> = {
  dashboard:    "dashboard",
  campaigns:    "table",
  constituents: "table",
  calendar:     "cards",
  reports:      "cards",
  exports:      "table",
  audit:        "table",
  users:        "cards",
  settings:     "cards",
};

export default function App() {
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(3);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useMobile();
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chord shortcut state: waiting for second key after "g"
  const chordPendingRef = useRef(false);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastCounter;
    setToasts(t => [...t, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    setCmdOpen(false);
    setNotifOpen(false);
    setMobileNavOpen(false);
    // Skeleton shimmer for 400ms
    setLoading(true);
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setLoading(false), 400);
  }, []);

  // Global keyboard handler: ⌘K, ?, chord G+<key>
  useEffect(() => {
    const PAGE_CHORD: Record<string, Page> = {
      d: "dashboard", c: "campaigns", n: "constituents", l: "calendar",
      r: "reports",   e: "exports",   a: "audit",        u: "users", s: "settings",
    };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable;

      // ⌘K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(o => !o);
        return;
      }

      if (inInput) return;

      // ? → shortcuts overlay
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        setShortcutsOpen(o => !o);
        return;
      }

      // Escape → close any open overlay
      if (e.key === "Escape") {
        setShortcutsOpen(false);
        setNotifOpen(false);
        return;
      }

      // Chord: G then <key>
      if (chordPendingRef.current) {
        chordPendingRef.current = false;
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
        const dest = PAGE_CHORD[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); navigate(dest); }
        return;
      }

      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        chordPendingRef.current = true;
        chordTimerRef.current = setTimeout(() => { chordPendingRef.current = false; }, 1500);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  const sharedProps = { dark, addToast };

  return (
    <div className={`flex h-screen overflow-hidden ${dark ? "dark" : ""}`} style={{ background: "var(--background)" }}>
      <Sidebar activePage={page} onNavigate={navigate} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          page={page}
          dark={dark}
          onToggleDark={() => setDark(d => !d)}
          onOpenSearch={() => setCmdOpen(true)}
          onOpenNotifications={() => setNotifOpen(o => !o)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          notificationCount={notifCount}
        />

        <div className="flex-1 overflow-auto">
          {loading ? (
            <PageSkeleton type={PAGE_SKELETON_TYPE[page]} />
          ) : (
            <>
              {page === "dashboard"    && <Dashboard {...sharedProps} />}
              {page === "campaigns"    && <Campaigns {...sharedProps} />}
              {page === "constituents" && <Constituents {...sharedProps} />}
              {page === "calendar"     && <CalendarPage {...sharedProps} />}
              {page === "reports"      && <Reports {...sharedProps} />}
              {page === "exports"      && <Exports {...sharedProps} />}
              {page === "audit"        && <Audit {...sharedProps} />}
              {page === "users"        && <UsersPage {...sharedProps} />}
              {page === "settings"     && <SettingsPage dark={dark} onToggleDark={() => setDark(d => !d)} addToast={addToast} />}
            </>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onNavigate={navigate} dark={dark} />
      <NotificationsPanel open={notifOpen} dark={dark} onClose={() => setNotifOpen(false)} onUnreadChange={setNotifCount} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} dark={dark} />
    </div>
  );
}
