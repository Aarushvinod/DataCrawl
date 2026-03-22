import { Database, FolderOpen, Radar, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectRecord } from '../../services/normalizers';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';

interface ProjectCardProps {
  project: ProjectRecord;
  isCaptured?: boolean;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'badge badge--running';
    case 'completed':
      return 'badge badge--completed';
    case 'failed':
      return 'badge badge--failed';
    default:
      return 'badge badge--pending';
  }
}

export default function ProjectCard({ project, isCaptured = false }: ProjectCardProps) {
  const navigate = useNavigate();
  const budgetPct = project.budget > 0
    ? Math.min((project.budget_spent / project.budget) * 100, 100)
    : 0;

  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-primary)';

  return (
    <div
      className={`card dc-project-card${isCaptured ? ' is-captured' : ''}`}
      onClick={() => navigate(`/projects/${project.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/projects/${project.id}`);
        }
      }}
    >
      <ConsoleAmbientDigits variant="card" tone={project.status === 'running' ? 'primary' : 'mixed'} className="dc-project-card__ambient" />
      {isCaptured && <ActionSpiderAccent variant="capture" className="dc-project-card__spider" />}

      <div className="dc-project-card__top">
        <div>
          <h3 className="dc-project-card__title">{project.name}</h3>
          <div className="dc-run-mode" style={{ marginTop: 6 }}>Workspace #{project.id.slice(0, 8)}</div>
        </div>
        <span className={statusBadgeClass(project.status)}>{project.status}</span>
      </div>

      <div className="dc-project-card__body">
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          {project.description || 'Use this project to track crawl runs, synthetic generation, and dataset revisions over time.'}
        </p>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            <span>Budget in motion</span>
            <span className="mono">{`$${project.budget_spent.toFixed(2)} / $${project.budget.toFixed(2)}`}</span>
          </div>
          <div className="budget-meter">
            <div
              className="budget-meter__fill"
              style={{
                width: `${budgetPct}%`,
                backgroundColor: budgetColor,
              }}
            />
          </div>
        </div>

        <div className="dc-project-card__signal-grid">
          <div className="dc-project-card__signal">
            <span className="dc-project-card__signal-label">Search status</span>
            <strong>{project.status}</strong>
          </div>
          <div className="dc-project-card__signal">
            <span className="dc-project-card__signal-label">Saved outputs</span>
            <strong>{project.dataset_count}</strong>
          </div>
          <div className="dc-project-card__signal">
            <span className="dc-project-card__signal-label">Budget used</span>
            <strong>{budgetPct.toFixed(0)}%</strong>
          </div>
        </div>
      </div>

      <div className="dc-project-card__footer">
        <span className="dc-tag"><Database size={14} /> {project.dataset_count} capture{project.dataset_count === 1 ? '' : 's'}</span>
        <span className="dc-tag"><Wallet size={14} /> {budgetPct.toFixed(0)}% budget used</span>
        <span className="dc-tag"><Radar size={14} /> Search room ready</span>
        <span className="dc-tag"><FolderOpen size={14} /> Open project</span>
      </div>
    </div>
  );
}
