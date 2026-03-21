import { useNavigate } from 'react-router-dom';
import { Database, FolderOpen } from 'lucide-react';
import type { ProjectRecord } from '../../services/normalizers';

interface ProjectCardProps {
  project: ProjectRecord;
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

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const budgetPct = project.budget > 0
    ? Math.min((project.budget_spent / project.budget) * 100, 100)
    : 0;

  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-blue)';

  return (
    <div
      className="card"
      onClick={() => navigate(`/projects/${project.id}`)}
      style={{
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-blue)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {project.name}
        </h3>
        <span className={statusBadgeClass(project.status)}>{project.status}</span>
      </div>

      <p
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 16,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {project.description}
      </p>

      {/* Budget meter */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          <span>Budget</span>
          <span className="mono">
            ${project.budget_spent.toFixed(2)} / ${project.budget.toFixed(2)}
          </span>
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

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Database size={14} />
          {project.dataset_count} dataset{project.dataset_count !== 1 ? 's' : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FolderOpen size={14} />
          {project.id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
