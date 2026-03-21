import { Component, type ErrorInfo, type ReactNode } from 'react';

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
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: '100%',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
              Something went wrong
            </h1>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              The page hit an unexpected frontend error. Reload the app to recover.
            </p>
            <button className="btn btn--primary" onClick={this.handleReset}>
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
