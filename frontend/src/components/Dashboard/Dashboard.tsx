import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import api from '../../services/api';
import { normalizeProject, type ApiProject, type ProjectRecord } from '../../services/normalizers';
import ProjectCard from './ProjectCard';
import NewProjectModal from './NewProjectModal';

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<ApiProject[]>('/api/projects');
      setProjects(data.map(normalizeProject));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Projects</h1>
        <button className="btn btn--primary" onClick={() => setShowNewModal(true)}>
          <Plus size={16} />
          New Project
        </button>
      </div>

      {loading && (
        <div style={{ color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
          Loading projects...
        </div>
      )}

      {error && (
        <div
          style={{
            color: 'var(--color-error)',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 0',
            color: 'var(--text-secondary)',
          }}
        >
          <p style={{ fontSize: 16, marginBottom: 12 }}>No projects yet</p>
          <p style={{ fontSize: 13 }}>
            Create your first project to start collecting data.
          </p>
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={fetchProjects}
        />
      )}
    </div>
  );
}
