import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional custom fallback. Receives the error and a reset callback that
   * clears the boundary's error state, allowing children to re-render.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Called when the user clicks "Start over". Use this to reset upstream
   * state (e.g. clear the selected image/template) so children get a clean
   * mount when the boundary's internal state resets.
   */
  onReset?: () => void;
  /**
   * Label for the reset button. Defaults to "Start over".
   */
  resetLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in children and shows a graceful fallback
 * instead of white-screening. Intended to wrap the heavy crop-flow views
 * (PreCropShell, CropEditor) so a bug in the pipeline doesn't kill the app.
 *
 * Errors thrown in event handlers and async code will NOT be caught here —
 * those must be handled at the source (try/catch or Promise.catch).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in devtools so developers can see the component stack.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Something went wrong
              </h2>
              <p className="text-xs text-muted-foreground">
                The editor hit an unexpected error.
              </p>
            </div>
          </div>

          <details className="mb-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {error.message || String(error)}
            </pre>
          </details>

          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={this.reset}
              className="flex-1"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {this.props.resetLabel ?? "Start over"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={this.reload}
              className="flex-1"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
