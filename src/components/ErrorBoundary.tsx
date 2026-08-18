import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Bug } from 'lucide-react';
import i18n from '../i18n/config';
import { GitHubIssueModal } from './GitHubIssueModal';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isGitHubModalOpen: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isGitHubModalOpen: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isGitHubModalOpen: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in React Component Tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, isGitHubModalOpen: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errMessage = this.state.error?.toString() || i18n.t('error_boundary.unknown_error', 'Unknown application error');

      return (
        <div className="flex h-full w-full min-h-[400px] items-center justify-center bg-background p-6 text-text-primary">
          <div className="w-full max-w-md rounded-[6px] border border-status-danger/40 bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-status-danger">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-status-dangerSubtle">
                <AlertOctagon className="h-6 w-6 text-status-danger" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {i18n.t('error_boundary.title', 'Application Error')}
                </h2>
                <p className="text-xs text-text-secondary">
                  {i18n.t('error_boundary.description', 'An unexpected rendering error occurred.')}
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="max-h-40 overflow-y-auto rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-xs text-status-danger">
                {errMessage}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => this.setState({ isGitHubModalOpen: true })}
                className="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <Bug className="h-3.5 w-3.5 text-status-danger" />
                <span>{i18n.t('error_boundary.report_button', 'Report Crash on GitHub')}</span>
              </button>

              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-[6px] bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-hover transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{i18n.t('error_boundary.reload_button', 'Reload Application')}</span>
              </button>
            </div>
          </div>

          <GitHubIssueModal
            isOpen={this.state.isGitHubModalOpen}
            onClose={() => this.setState({ isGitHubModalOpen: false })}
            initialCategory="bug"
            initialTitle={`[Crash] Uncaught React Error: ${this.state.error?.message || ''}`}
            initialDescription={`Uncaught Error in React Component Tree:\n\n\`\`\`text\n${errMessage}\n\`\`\``}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
