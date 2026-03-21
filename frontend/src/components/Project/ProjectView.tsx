import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import api from '../../services/api';
import {
  normalizeProject,
  normalizeRunSummary,
  type ApiProject,
  type ApiRunSummary,
  type ProjectRecord,
  type RunSummary,
} from '../../services/normalizers';
import RunList from './RunList';
import DatasetList from './DatasetList';

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
  format: string;
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
    if (!projectId) return;
    try {
      setLoading(true);
      const [proj, runList, datasetList] = await Promise.all([
        api.get<ApiProject>(`/api/projects/${projectId}`),
        api.get<ApiRunSummary[]>(`/api/projects/${projectId}/runs`),
        api.get<Dataset[]>(`/api/projects/${projectId}/datasets`),
      ]);
      setProject(normalizeProject(proj));
      setRuns(runList.map(normalizeRunSummary));
      setDatasets(datasetList);
    } catch {
      // Fetch error
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleNewRun() {
    if (!projectId || !project) return;

    setCreatingRun(true);
    try {
      const run = await api.post<ApiRunSummary>(`/api/projects/${projectId}/runs`, {
        initial_message: '',
      });
      navigate(`/projects/${projectId}/runs/${run.id}`);
    } catch {
      // Create run failed
    } finally {
      setCreatingRun(false);
    }
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ color: 'var(--color-error)', padding: '40px 0', textAlign: 'center' }}>
        Project not found.
      </div>
    );
  }

  const budgetPct = project.budget > 0
    ? Math.min((project.budget_spent / project.budget) * 100, 100)
    : 0;

  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-blue)';

  const tabStyle = (tab: Tab) => ({
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer' as const,
    transition: 'color 0.15s',
  });

  return (
    <div>
      {/* Back button */}
      <button
        className="btn btn--ghost"
        onClick={() => navigate('/')}
        style={{ marginBottom: 16, padding: '4px 0' }}
      >
        <ArrowLeft size={16} />
        Back to Projects
      </button>

      {/* Project header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{project.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
          {project.description}
        </p>

        {/* Budget */}
        <div style={{ maxWidth: 400 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            <span>Budget</span>
            <span className="mono">
              ${project.budget_spent.toFixed(2)} / ${project.budget.toFixed(2)}
            </span>
          </div>
          <div className="budget-meter" style={{ height: 8 }}>
            <div
              className="budget-meter__fill"
              style={{
                width: `${budgetPct}%`,
                backgroundColor: budgetColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabs + New Run */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex' }}>
          <button style={tabStyle('runs')} onClick={() => setActiveTab('runs')}>
            Runs ({runs.length})
          </button>
          <button style={tabStyle('datasets')} onClick={() => setActiveTab('datasets')}>
            Datasets ({datasets.length})
          </button>
        </div>

        {activeTab === 'runs' && (
          <button
            className="btn btn--primary"
            onClick={handleNewRun}
            disabled={creatingRun}
            style={{ marginBottom: 8 }}
          >
            <Plus size={16} />
            {creatingRun ? 'Starting...' : 'New Run'}
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'runs' && <RunList projectId={project.id} runs={runs} />}
      {activeTab === 'datasets' && (
        <DatasetList projectId={project.id} datasets={datasets} onDeleted={fetchData} />
      )}
    </div>
  );
}
