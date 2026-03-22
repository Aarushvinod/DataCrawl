import { Database, Plus, Radar, Search, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import {
  normalizeProject,
  type ApiProject,
  type ProjectRecord,
} from '../../services/normalizers';
import AnimatedNumber from '../Brand/AnimatedNumber';
import NewProjectModal from './NewProjectModal';
import ProjectCard from './ProjectCard';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [capturedProjectId, setCapturedProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async (highlightProjectId?: string) => {
    try {
      setLoading(true);
      const data = await api.get<ApiProject[]>('/api/projects');
      const normalized = data.map(normalizeProject);
      setProjects(normalized);
      setError(null);

      if (highlightProjectId && normalized.some((project) => project.id === highlightProjectId)) {
        setCapturedProjectId(highlightProjectId);
        window.setTimeout(() => setCapturedProjectId((current) => (
          current === highlightProjectId ? null : current
        )), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const totalBudget = useMemo(
    () => projects.reduce((sum, project) => sum + project.budget, 0),
    [projects],
  );
  const totalSpent = useMemo(
    () => projects.reduce((sum, project) => sum + project.budget_spent, 0),
    [projects],
  );
  const totalDatasets = useMemo(
    () => projects.reduce((sum, project) => sum + project.dataset_count, 0),
    [projects],
  );
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active' || project.status === 'running').length,
    [projects],
  );
  const projectSignals = [
    {
      label: 'Tracked workspaces',
      value: projects.length.toLocaleString(),
      note: 'finance research rooms',
      icon: <Search size={12} />,
      tone: 'secondary' as const,
    },
    {
      label: 'Live searches',
      value: activeProjects.toLocaleString(),
      note: 'routes in motion',
      icon: <Radar size={12} />,
      tone: 'primary' as const,
    },
    {
      label: 'Saved outputs',
      value: totalDatasets.toLocaleString(),
      note: 'captured datasets',
      icon: <Database size={12} />,
      tone: 'success' as const,
    },
    {
      label: 'Budget in play',
      value: `$${totalBudget.toFixed(2)}`,
      note: `$${totalSpent.toFixed(2)} spent so far`,
      icon: <Wallet size={12} />,
      tone: 'warning' as const,
    },
  ];

  return (
    <div className="dc-page-stack">
      <section className="dc-page-header">
        <ConsoleAmbientDigits variant="header" tone="mixed" className="dc-page-header__ambient" />
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Projects home</p>
          <h1 className="dc-page-header__title">Keep every market crawl, dataset revision, and finance project inside one control room.</h1>
          <p className="dc-page-header__subtitle">
            Projects hold the full story around your work: budgets, live crawl runs, synthetic scenario builds, and every follow-up change you make afterwards.
          </p>
          <SignalStrip items={projectSignals} className="dc-page-header__signals" />
        </div>
        <div className="dc-header-actions">
          <button className="btn btn--primary" onClick={() => setShowNewModal(true)}>
            <Plus size={16} />
            New project
          </button>
        </div>
      </section>

      <section className="dc-metric-grid">
        <div className="card dc-metric-card">
          <div className="dc-metric-card__label">Projects</div>
          <div className="dc-metric-card__value"><AnimatedNumber value={projects.length} /></div>
          <div className="dc-metric-card__subtext">Tracked workspaces for finance data collection and scenario runs.</div>
        </div>
        <div className="card dc-metric-card">
          <div className="dc-metric-card__label">Active projects</div>
          <div className="dc-metric-card__value"><AnimatedNumber value={activeProjects} /></div>
          <div className="dc-metric-card__subtext">Projects with budget or live run activity.</div>
        </div>
        <div className="card dc-metric-card">
          <div className="dc-metric-card__label">Datasets</div>
          <div className="dc-metric-card__value"><AnimatedNumber value={totalDatasets} /></div>
          <div className="dc-metric-card__subtext">Saved outputs across real market collection and synthetic finance work.</div>
        </div>
        <div className="card dc-metric-card">
          <div className="dc-metric-card__label">Budget in play</div>
          <div className="dc-metric-card__value"><AnimatedNumber value={totalBudget} prefix="$" decimals={2} /></div>
          <div className="dc-metric-card__subtext">{`$${totalSpent.toFixed(2)} spent so far across all projects.`}</div>
        </div>
      </section>

      <section className="card dc-section-card">
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Workspace</p>
          <h2 className="dc-section__title">Your search and capture ledger</h2>
          <p className="dc-section__copy">Open a project to follow active market searches, shape synthetic financial data, or revisit the captured outputs from earlier runs.</p>
        </div>

        {loading && (
          <div className="dc-empty-state">
            <div className="dc-empty-state__spider" />
            <div>Loading your project grid...</div>
          </div>
        )}

        {error && (
          <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="dc-empty-state">
            <div className="dc-empty-state__spider" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No projects yet</div>
              <div style={{ color: 'var(--text-secondary)' }}>Create your first project to start collecting market data or building finance-focused synthetic datasets.</div>
            </div>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="dc-grid dc-grid--projects">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isCaptured={capturedProjectId === project.id}
              />
            ))}
          </div>
        )}
      </section>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={(createdProject) => {
            setShowNewModal(false);
            void fetchProjects(createdProject.id);
          }}
        />
      )}
    </div>
  );
}
