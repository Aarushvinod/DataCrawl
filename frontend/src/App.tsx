import { useEffect } from 'react';
import { Auth0Provider, type AppState, useAuth0 } from '@auth0/auth0-react';
import { SolanaProvider } from '@solana/react-hooks';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AppErrorBoundary from './components/AppErrorBoundary';
import Layout from './components/Layout';
import LandingPage from './components/Landing/LandingPage';
import Dashboard from './components/Dashboard/Dashboard';
import ProjectView from './components/Project/ProjectView';
import AgentChat from './components/AgentChat/AgentChat';
import DatasetViewer from './components/DatasetViewer/DatasetViewer';
import Billing from './components/Billing/Billing';
import { setTokenGetter } from './services/api';
import { solanaClient } from './services/solana';

function LoadingScreen() {
  return (
    <div className="dc-loading-screen">
      <div className="dc-loading-screen__pulse" />
      <div className="dc-loading-screen__copy">Loading DataCrawl...</div>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const location = useLocation();

  useEffect(() => {
    setTokenGetter(() => getAccessTokenSilently());
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void loginWithRedirect({
        appState: {
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        },
      });
    }
  }, [isAuthenticated, isLoading, location.hash, location.pathname, location.search, loginWithRedirect]);

  if (isLoading || !isAuthenticated) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

function ProtectedLayout() {
  return (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/projects" element={<Dashboard />} />
        <Route path="/projects/:projectId" element={<ProjectView />} />
        <Route path="/projects/:projectId/runs/:runId" element={<AgentChat />} />
        <Route path="/projects/:projectId/datasets/:datasetId" element={<DatasetViewer />} />
        <Route path="/billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AuthProviderWithNavigate({ children }: { children: React.ReactNode }) {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || '';
  const navigate = useNavigate();

  const handleRedirect = (appState?: AppState) => {
    navigate(appState?.returnTo || '/projects', { replace: true });
  };

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience,
      }}
      onRedirectCallback={handleRedirect}
    >
      {children}
    </Auth0Provider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <SolanaProvider client={solanaClient}>
        <BrowserRouter>
          <AuthProviderWithNavigate>
            <AppRoutes />
          </AuthProviderWithNavigate>
        </BrowserRouter>
      </SolanaProvider>
    </AppErrorBoundary>
  );
}
