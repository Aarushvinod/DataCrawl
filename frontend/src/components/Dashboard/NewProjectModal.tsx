import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import api from '../../services/api';
import { normalizeProject, type ApiProject, type ProjectRecord } from '../../services/normalizers';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: (project: ProjectRecord) => void;
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdProject = await api.post<ApiProject>('/api/projects', {
        name: name.trim(),
        description: description.trim(),
        budget: parseFloat(budget) || 0,
      });
      onCreated(normalizeProject(createdProject));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <p className="dc-section__eyebrow" style={{ marginBottom: 8 }}>New project</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem', lineHeight: 1.05 }}>Give this crawl a home.</h2>
          </div>
          <button className="btn btn--ghost" onClick={onClose} style={{ paddingInline: 12 }}>
            <X size={16} />
          </button>
        </div>

        <form className="dc-form-grid" onSubmit={handleSubmit}>
          <label className="dc-form-grid">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Project name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Rate-sensitive market tracker"
              required
            />
          </label>

          <label className="dc-form-grid">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>What should this project focus on?</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the kind of data you want to keep collecting or revising here."
              rows={4}
            />
          </label>

          <label className="dc-form-grid">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Budget</span>
            <input
              type="number"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="50.00"
              min="0"
              step="0.01"
            />
          </label>

          {error && (
            <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating project…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
