import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in React Component Tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-text-primary">
          <div className="w-full max-w-md rounded-[6px] border border-status-danger/40 bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-status-danger">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-status-dangerSubtle">
                <AlertOctagon className="h-6 w-6 text-status-danger" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Application Error</h2>
                <p className="text-xs text-text-secondary">An unexpected rendering error occurred.</p>
              </div>
            </div>

            {this.state.error && (
              <div className="max-h-40 overflow-y-auto rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-xs text-status-danger">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-[6px] bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
