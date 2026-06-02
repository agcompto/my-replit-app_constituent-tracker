import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  useKeyboardShortcuts,
  ShortcutHelpDialog,
} from "@/hooks/useKeyboardShortcuts";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AppLayout } from "@/components/layout/AppLayout";

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/login"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ChangePassword = lazy(() => import("@/pages/change-password"));
const SetupPassword = lazy(() => import("@/pages/setup-password"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Campaigns = lazy(() => import("@/pages/campaigns"));
const CampaignDetail = lazy(() => import("@/pages/campaigns/detail"));
const CampaignSummary = lazy(() => import("@/pages/campaigns/summary"));
const CampaignWizard = lazy(() => import("@/pages/campaigns/wizard/index"));
const Donors = lazy(() => import("@/pages/donors"));
const Audit = lazy(() => import("@/pages/audit"));
const Users = lazy(() => import("@/pages/users"));
const Reports = lazy(() => import("@/pages/reports"));
const Exports = lazy(() => import("@/pages/exports"));
const Settings = lazy(() => import("@/pages/settings"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const PublicCalendarPage = lazy(() => import("@/pages/public-calendar"));

function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading page…
    </div>
  );
}

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
          <Route path="/calendar" component={CalendarPage} />
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
      // Reference data (channels, settings, lookups) changes infrequently.
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts();
  return (
    <>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/setup-password/:token" component={SetupPassword} />
          <Route
            path="/public/calendars/:slug"
            component={PublicCalendarPage}
          />
          <Route path="/change-password">
            <AuthGuard>
              <ChangePassword />
            </AuthGuard>
          </Route>
          <Route path="*">
            <AuthenticatedRoutes />
          </Route>
        </Switch>
      </Suspense>
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
