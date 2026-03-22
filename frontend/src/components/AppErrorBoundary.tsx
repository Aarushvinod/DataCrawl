import { Component, type ErrorInfo, type ReactNode } from 'react';
import BrandWordmark from './Brand/BrandWordmark';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App render failed', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.assign(window.location.origin);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="dc-loading-screen" style={{ padding: 24 }}>
          <div className="card" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
            <div style={{ marginBottom: 18 }}>
              <BrandWordmark size="section" />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              The page hit an unexpected frontend error. Reload the app to get back to the workspace.
            </p>
            <button className="btn btn--primary" onClick={this.handleReset}>Reload app</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
