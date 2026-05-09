import { useGetMe, useAcknowledgePii, useLogout } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { KeyRound } from "lucide-react";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Megaphone, 
  PlusCircle, 
  Search, 
  BarChart3, 
  Download, 
  History, 
  Settings, 
  Users,
  LogOut,
  X,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPiiBanner, setShowPiiBanner] = useState(true);

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
      {/* PII Modal */}
      <Dialog open={user && !user.piiAcknowledged}>
        <DialogContent className="sm:max-w-[425px]" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Data Privacy Policy
            </DialogTitle>
            <DialogDescription className="pt-3 pb-4 text-base">
              This system is strictly for planning touches using Donor IDs only. 
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

      <div className="flex-1 flex flex-col min-w-0">
        {showPiiBanner && (
          <div className="bg-muted px-4 py-2 text-sm font-medium text-muted-foreground flex justify-between items-center border-b">
            <span><strong>Reminder:</strong> Use Donor ID only. Do not upload or enter unnecessary PII.</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-black/5" onClick={() => setShowPiiBanner(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-sm flex items-center justify-center">
              <span className="text-primary-foreground font-bold leading-none tracking-tighter">NC</span>
            </div>
            <div>
              <h1 className="font-semibold leading-tight text-foreground">Constituent Touchpoint Planner</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">NC State University Advancement</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role.replace('_', ' ')}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/change-password")}
              data-testid="button-change-password"
            >
              <KeyRound className="h-4 w-4 mr-2" />
              Change Password
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar userRole={user?.role} />
          <main id="main-content" className="flex-1 overflow-y-auto p-6 lg:p-8 outline-none" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ userRole }: { userRole?: string }) {
  const [location] = useLocation();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/campaigns/new", label: "New Campaign", icon: PlusCircle },
    { href: "/donors", label: "Donor ID Lookup", icon: Search },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/exports", label: "Exports & Uploads", icon: Download },
    { href: "/audit", label: "Audit Log", icon: History },
  ];

  const adminItems = [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/users", label: "Users", icon: Users },
  ];

  return (
    <aside className="w-64 border-r bg-sidebar shrink-0 overflow-y-auto hidden md:block">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
              <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="pt-6 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Administration
            </div>
            {adminItems.map((item) => {
              const active = location === item.href || location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
