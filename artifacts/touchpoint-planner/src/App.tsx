import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useKeyboardShortcuts, ShortcutHelpDialog } from "@/hooks/useKeyboardShortcuts";
import NotFound from "@/pages/not-found";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/login";
import ChangePassword from "@/pages/change-password";
import SetupPassword from "@/pages/setup-password";
import Dashboard from "@/pages/dashboard";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaigns/detail";
import CampaignSummary from "@/pages/campaigns/summary";
import CampaignWizard from "@/pages/campaigns/wizard/index";
import Donors from "@/pages/donors";
import Audit from "@/pages/audit";
import Users from "@/pages/users";
import Reports from "@/pages/reports";
import Exports from "@/pages/exports";
import Settings from "@/pages/settings";

function AuthenticatedRoutes() {
  return (
    <AuthGuard>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/campaigns" component={Campaigns} />
          <Route path="/campaigns/new" component={CampaignWizard} />
          <Route path="/campaigns/:id/edit" component={CampaignWizard} />
          <Route path="/campaigns/:id/summary" component={CampaignSummary} />
          <Route path="/campaigns/:id" component={CampaignDetail} />
          <Route path="/donors" component={Donors} />
          <Route path="/reports" component={Reports} />
          <Route path="/exports" component={Exports} />
          <Route path="/audit" component={Audit} />
          <Route path="/settings" component={Settings} />
          <Route path="/users" component={Users} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </AuthGuard>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts();
  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/setup-password/:token" component={SetupPassword} />
        <Route path="/change-password">
          <AuthGuard>
            <ChangePassword />
          </AuthGuard>
        </Route>
        <Route path="*">
          <AuthenticatedRoutes />
        </Route>
      </Switch>
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
