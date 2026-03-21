import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { setTokenGetter } from './services/api';
import AppErrorBoundary from './components/AppErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import ProjectView from './components/Project/ProjectView';
import AgentChat from './components/AgentChat/AgentChat';
import DatasetViewer from './components/DatasetViewer/DatasetViewer';
import Billing from './components/Billing/Billing';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    setTokenGetter(() => getAccessTokenSilently());
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-primary)',
          fontSize: 15,
        }}
      >
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          <Route path="/projects/:projectId/runs/:runId" element={<AgentChat />} />
          <Route path="/projects/:projectId/datasets/:datasetId" element={<DatasetViewer />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}

export default function App() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || '';

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Auth0Provider
          domain={domain}
          clientId={clientId}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: audience,
          }}
        >
          <AppRoutes />
        </Auth0Provider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
