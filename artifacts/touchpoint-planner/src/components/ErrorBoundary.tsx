import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  errorId: string | null;
  message: string | null;
}

function makeErrorId(): string {
  // 8-char base36 — short enough to read aloud, unique enough for support tickets.
  return Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-4);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { errorId: null, message: null };

  static getDerivedStateFromError(err: Error): State {
    return { errorId: makeErrorId(), message: err.message || String(err) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error in the console for developers; production should ship
    // these to a logging endpoint, but the app has no client log sink yet.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.state.errorId, error, info.componentStack);
  }

  private handleCopy = (): void => {
    const text = `Error ID: ${this.state.errorId}\nMessage: ${this.state.message ?? ""}\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}`;
    void navigator.clipboard?.writeText(text);
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.errorId) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <h1 className="text-lg font-semibold leading-tight">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                The page hit an unexpected error. Reload to try again. If it
                keeps happening, send the error ID below to your administrator.
              </p>
            </div>
          </div>
          <div className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs flex items-center justify-between gap-2">
            <span aria-label="Error identifier">Error ID: {this.state.errorId}</span>
            <Button variant="ghost" size="sm" onClick={this.handleCopy} className="h-7 px-2">
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
          </div>
          {this.state.message ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Technical details</summary>
              <pre className="whitespace-pre-wrap break-words mt-1">{this.state.message}</pre>
            </details>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => window.history.back()}>Go back</Button>
            <Button onClick={this.handleReload}>Reload page</Button>
          </div>
        </div>
      </div>
    );
  }
}
