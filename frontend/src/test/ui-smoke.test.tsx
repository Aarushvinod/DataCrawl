import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes, RequireAuth } from '../App';
import AgentChat from '../components/AgentChat/AgentChat';
import LandingPage from '../components/Landing/LandingPage';
import Layout from '../components/Layout';

const authState = {
  isAuthenticated: false,
  isLoading: false,
  loginWithRedirect: vi.fn(),
  getAccessTokenSilently: vi.fn(async () => 'token'),
  logout: vi.fn(),
  user: {
    name: 'Test User',
    email: 'test@example.com',
    picture: '',
  },
};

vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children }: { children: ReactNode }) => children,
  useAuth0: () => authState,
}));

describe('frontend route smoke tests', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.loginWithRedirect.mockClear();
    authState.logout.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input.toString();
      if (path.includes('/api/projects')) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the public landing page and triggers login from the main CTA', async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /crawl the web for market signals/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /start crawling/i })[0]);

    await waitFor(() => {
      expect(authState.loginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: '/projects' },
      });
    });
  });

  it('redirects protected routes through auth and preserves the requested path', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/alpha']}>
        <Routes>
          <Route
            path="/projects/:projectId"
            element={(
              <RequireAuth>
                <div>Private content</div>
              </RequireAuth>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(authState.loginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: '/projects/alpha' },
      });
    });
  });

  it('sends the shell logo back to the projects home page', async () => {
    authState.isAuthenticated = true;

    render(
      <MemoryRouter initialEntries={['/billing']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/projects" element={<div>Projects home</div>} />
            <Route path="/billing" element={<div>Billing page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /datacrawl/i }));

    await waitFor(() => {
      expect(screen.getByText('Projects home')).toBeInTheDocument();
    });
  });

  it('renders the projects console on the protected /projects route', async () => {
    authState.isAuthenticated = true;

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /keep every market crawl, dataset revision, and finance project/i })).toBeInTheDocument();
    });
  });

  it('stops polling while a plan is waiting for review so scrolling stays stable', async () => {
    vi.useFakeTimers();

    const reviewRun = {
      id: 'run-1',
      status: 'awaiting_approval',
      generation_mode: 'synthetic',
      messages: [
        { role: 'user', content: 'Create a synthetic options dataset.' },
      ],
      agent_logs: [],
      budget_spent: 0,
      budget_total: 500,
      current_phase: 'awaiting_approval',
      current_agent: 'orchestrator',
      progress_percent: 45,
      total_steps: 2,
      completed_steps: 0,
      plan_version: 1,
      plan: {
        description: 'Review the proposed synthetic dataset plan.',
        steps: [
          {
            description: 'Shape the synthetic market dataset',
            agent: 'synthetic_generator',
            estimated_cost: 0,
          },
        ],
        output_contract: {
          format: 'csv',
          required_columns: ['ticker', 'price'],
        },
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input.toString();
      if (path.includes('/api/projects/proj-1/runs/run-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => reviewRun,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/runs/run-1']}>
        <Routes>
          <Route path="/projects/:projectId/runs/:runId" element={<AgentChat />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: /make sure this crawl path looks right/i })).toBeInTheDocument();

    const initialCalls = fetchMock.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(initialCalls);
  });

  it('keeps polling while planning is still in progress', async () => {
    vi.useFakeTimers();

    const planningRun = {
      id: 'run-2',
      status: 'planning',
      generation_mode: 'synthetic',
      messages: [
        { role: 'user', content: 'Build a synthetic yield-curve dataset.' },
      ],
      agent_logs: [],
      budget_spent: 0,
      budget_total: 500,
      current_phase: 'planning',
      current_agent: 'orchestrator',
      progress_percent: 20,
      total_steps: 0,
      completed_steps: 0,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input.toString();
      if (path.includes('/api/projects/proj-1/runs/run-2')) {
        return {
          ok: true,
          status: 200,
          json: async () => planningRun,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/runs/run-2']}>
        <Routes>
          <Route path="/projects/:projectId/runs/:runId" element={<AgentChat />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/build a synthetic yield-curve dataset/i)).toBeInTheDocument();

    const initialCalls = fetchMock.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
