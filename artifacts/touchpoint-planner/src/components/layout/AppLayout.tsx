import { useGetMe, useAcknowledgePii, useLogout } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Megaphone, 
  PlusCircle, 
  Search, 
  CalendarDays,
  BarChart3, 
  Download, 
  History, 
  Settings, 
  Users,
  LogOut,
  X,
  AlertTriangle,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/campaigns/new", label: "New Campaign", icon: PlusCircle },
  { href: "/donors", label: "Constituent Lookup", icon: Search },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/exports", label: "Exports & Uploads", icon: Download },
];

const adminItems = [
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/users", label: "Users", icon: Users },
];

function isActivePath(location: string, href: string): boolean {
  return location === href || (href !== "/" && location.startsWith(href));
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPiiBanner, setShowPiiBanner] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const acknowledgePii = useAcknowledgePii();

  const handleAcknowledge = () => {
    acknowledgePii.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "PII Policy Acknowledged" });
      }
    });
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  return (
    <div className="min-h-screen flex w-full bg-background flex-col md:flex-row">
      {/* Keyboard and screen-reader users can bypass repeated navigation and jump directly to page content. */}
      <a
        href="#main-content"
        className="sr-only-focusable fixed left-3 top-3 z-[1000] rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-md ring-2 ring-ring"
      >
        Skip to main content
      </a>

      <Dialog open={!!user && !user.piiAcknowledged}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              Data Privacy Policy
            </DialogTitle>
            <DialogDescription className="pt-3 pb-4 text-base">
              This system is strictly for planning touches using Constituent IDs only. 
              <br/><br/>
              <strong>Do NOT enter names, phone numbers, email addresses, mailing addresses, giving amounts, or any other personally identifiable information (PII).</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleAcknowledge} className="w-full">
              I Understand and Agree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileNavDialog
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        userRole={user?.role}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {showPiiBanner && (
          <div className="bg-muted px-4 py-2 text-sm font-medium text-muted-foreground flex justify-between items-center gap-3 border-b" role="status">
            <span><strong>Reminder:</strong> Use Constituent ID only. Do not upload or enter unnecessary PII.</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-black/5 shrink-0" onClick={() => setShowPiiBanner(false)} aria-label="Dismiss PII reminder">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
        
        <header className="h-16 border-b bg-card flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0" role="banner">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-navigation-dialog"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <img
              src={`${import.meta.env.BASE_URL}ncstate-brick.png`}
              alt="NC State University"
              className="h-8 w-auto shrink-0"
            />
            <div className="hidden sm:block border-l pl-3 min-w-0">
              <h1 className="font-semibold leading-tight text-foreground truncate">Constituent Touchpoint Planner</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">University Advancement</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0" aria-label="User actions">
            <div className="text-right hidden lg:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role.replace('_', ' ')}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/change-password")}
              data-testid="button-change-password"
              aria-label="Change password"
            >
              <KeyRound className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">Change Password</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar userRole={user?.role} />
          <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 outline-none" tabIndex={-1} aria-label="Main content">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function MobileNavDialog({
  open,
  onOpenChange,
  userRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" id="mobile-navigation-dialog">
        <DialogHeader>
          <DialogTitle>Navigation</DialogTitle>
          <DialogDescription>Go to a planning, reporting, or administration area.</DialogDescription>
        </DialogHeader>
        <NavList userRole={userRole} onNavigate={() => onOpenChange(false)} label="Mobile navigation" />
      </DialogContent>
    </Dialog>
  );
}

function Sidebar({ userRole }: { userRole?: string }) {
  return (
    <aside className="w-64 border-r bg-sidebar shrink-0 overflow-y-auto hidden md:block" aria-label="Primary navigation">
      <nav className="p-4 space-y-1" aria-label="Primary navigation">
        <NavList userRole={userRole} />
      </nav>
    </aside>
  );
}

function NavList({ userRole, onNavigate, label }: { userRole?: string; onNavigate?: () => void; label?: string }) {
  const [location] = useLocation();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="space-y-1" aria-label={label}>
      {navItems.map((item) => {
        const active = isActivePath(location, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}

      {isAdmin && (
        <>
          <div className="pt-6 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" aria-hidden="true">
            Administration
          </div>
          {adminItems.map((item) => {
            const active = isActivePath(location, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </>
      )}
    </div>
  );
}
