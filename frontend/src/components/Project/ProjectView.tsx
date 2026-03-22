import { ArrowLeft, Database, Plus, Radar, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import {
  normalizeProject,
  normalizeRunSummary,
  type ApiProject,
  type ApiRunSummary,
  type ProjectRecord,
  type RunSummary,
} from '../../services/normalizers';
import DatasetList from './DatasetList';
import RunList from './RunList';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
  format: string;
  source_type?: string;
  version?: number;
}

type Tab = 'runs' | 'datasets';

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('runs');
  const [loading, setLoading] = useState(true);
  const [creatingRun, setCreatingRun] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      return;
    }

    try {
      setLoading(true);
      const [projectResponse, runList, datasetList] = await Promise.all([
        api.get<ApiProject>(`/api/projects/${projectId}`),
        api.get<ApiRunSummary[]>(`/api/projects/${projectId}/runs`),
        api.get<Dataset[]>(`/api/projects/${projectId}/datasets`),
      ]);
      setProject(normalizeProject(projectResponse));
      setRuns(runList.map(normalizeRunSummary));
      setDatasets(datasetList);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleNewRun(generationMode: 'real' | 'synthetic') {
    if (!projectId) {
      return;
    }

    setCreatingRun(true);
    try {
      const run = await api.post<ApiRunSummary>(`/api/projects/${projectId}/runs`, {
        initial_message: '',
        generation_mode: generationMode,
      });
      navigate(`/projects/${projectId}/runs/${run.id}`);
    } finally {
      setCreatingRun(false);
    }
  }

  if (loading) {
    return <div className="dc-empty-state"><div className="dc-empty-state__spider" /><div>Loading project...</div></div>;
  }

  if (!project) {
    return <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>Project not found.</div>;
  }

  const budgetPct = project.budget > 0
    ? Math.min((project.budget_spent / project.budget) * 100, 100)
    : 0;

  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-primary)';
  const projectSignals = [
    {
      label: 'Crawl history',
      value: runs.length.toLocaleString(),
      note: 'runs recorded',
      icon: <Radar size={12} />,
      tone: 'primary' as const,
    },
    {
      label: 'Captured outputs',
      value: datasets.length.toLocaleString(),
      note: 'datasets saved',
      icon: <Database size={12} />,
      tone: 'success' as const,
    },
    {
      label: 'Budget used',
      value: `${budgetPct.toFixed(0)}%`,
      note: `$${project.budget_spent.toFixed(2)} spent`,
      icon: <Wallet size={12} />,
      tone: budgetPct > 70 ? 'warning' as const : 'secondary' as const,
    },
  ];

  return (
    <div className="dc-page-stack">
      <button className="btn btn--ghost" onClick={() => navigate('/projects')} style={{ width: 'fit-content' }}>
        <ArrowLeft size={16} />
        Back to projects
      </button>

      <section className="dc-page-header dc-project-view__summary">
        <ConsoleAmbientDigits variant="header" tone="mixed" className="dc-page-header__ambient" />
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Project overview</p>
          <h1 className="dc-page-header__title">{project.name}</h1>
          <p className="dc-page-header__subtitle">
            {project.description || 'Use this project to manage live financial crawls, synthetic scenario runs, and every revised dataset that comes out of them.'}
          </p>
          <SignalStrip items={projectSignals} className="dc-page-header__signals" compact />
          <div className="dc-header-meta">
            <span className="dc-tag">{runs.length} run{runs.length === 1 ? '' : 's'}</span>
            <span className="dc-tag">{datasets.length} dataset{datasets.length === 1 ? '' : 's'}</span>
            <span className="dc-tag">Status: {project.status}</span>
          </div>
        </div>

        <div className="card dc-budget-card" style={{ minWidth: 300 }}>
          <ConsoleAmbientDigits variant="card" tone="secondary" className="dc-budget-card__ambient" />
          <div className="dc-metric-card__label">Budget monitor</div>
          <div className="dc-metric-card__value mono">{`$${project.budget_spent.toFixed(2)} / $${project.budget.toFixed(2)}`}</div>
          <div className="dc-metric-card__subtext">{budgetPct.toFixed(0)}% of this finance research budget has been used.</div>
          <div className="budget-meter" style={{ marginTop: 14 }}>
            <div className="budget-meter__fill" style={{ width: `${budgetPct}%`, backgroundColor: budgetColor }} />
          </div>
        </div>
      </section>

      <section className="dc-tab-bar">
        <div className="dc-tab-buttons">
          <button className={`dc-tab-button${activeTab === 'runs' ? ' is-active' : ''}`} onClick={() => setActiveTab('runs')}>
            Crawl history ({runs.length})
          </button>
          <button className={`dc-tab-button${activeTab === 'datasets' ? ' is-active' : ''}`} onClick={() => setActiveTab('datasets')}>
            Captured outputs ({datasets.length})
          </button>
        </div>

        {activeTab === 'runs' && (
          <div className="dc-run-actions">
            <button className="btn btn--primary" onClick={() => handleNewRun('real')} disabled={creatingRun}>
              <Plus size={16} />
              {creatingRun ? 'Starting...' : 'New market crawl'}
            </button>
            <button className="btn btn--secondary" onClick={() => handleNewRun('synthetic')} disabled={creatingRun}>
              <Plus size={16} />
              {creatingRun ? 'Starting...' : 'New synthetic build'}
            </button>
          </div>
        )}
      </section>

      <section className="card dc-section-card">
        {activeTab === 'runs' ? (
          <RunList projectId={project.id} runs={runs} onDeleted={() => void fetchData()} />
        ) : (
          <DatasetList projectId={project.id} datasets={datasets} onDeleted={() => void fetchData()} />
        )}
      </section>
    </div>
  );
}
