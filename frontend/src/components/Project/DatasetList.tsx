import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Trash2, FileSpreadsheet } from 'lucide-react';
import api from '../../services/api';

interface Dataset {
  id: string;
  name: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
  format: string;
}

interface DatasetListProps {
  projectId: string;
  datasets: Dataset[];
  onDeleted: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DatasetList({ projectId, datasets, onDeleted }: DatasetListProps) {
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDownload(e: React.MouseEvent, datasetId: string) {
    e.stopPropagation();
    try {
      const data = await api.get<{ download_url: string }>(
        `/api/projects/${projectId}/datasets/${datasetId}/download`
      );
      const a = document.createElement('a');
      a.href = data.download_url;
      a.download = `dataset-${datasetId}.csv`;
      a.rel = 'noopener noreferrer';
      a.click();
    } catch {
      // Download failed silently
    }
  }

  async function handleDelete(e: React.MouseEvent, datasetId: string) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this dataset?')) return;

    setDeletingId(datasetId);
    try {
      await api.delete(`/api/projects/${projectId}/datasets/${datasetId}`);
      onDeleted();
    } catch {
      // Delete failed
    } finally {
      setDeletingId(null);
    }
  }

  if (datasets.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
        No datasets yet. Datasets are created when agent runs complete.
      </div>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Rows</th>
          <th>Size</th>
          <th>Format</th>
          <th>Created</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {datasets.map((ds) => (
          <tr
            key={ds.id}
            onClick={() => navigate(`/projects/${projectId}/datasets/${ds.id}`)}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--bg-elevated)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
            }}
          >
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={16} color="var(--accent-blue)" />
                <span style={{ fontWeight: 500 }}>{ds.name}</span>
              </div>
            </td>
            <td className="mono" style={{ color: 'var(--text-secondary)' }}>
              {ds.row_count.toLocaleString()}
            </td>
            <td className="mono" style={{ color: 'var(--text-secondary)' }}>
              {formatBytes(ds.size_bytes)}
            </td>
            <td style={{ color: 'var(--text-secondary)' }}>{ds.format}</td>
            <td style={{ color: 'var(--text-secondary)' }}>
              {new Date(ds.created_at).toLocaleDateString()}
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button
                  className="btn btn--ghost"
                  onClick={(e) => handleDownload(e, ds.id)}
                  title="Download"
                  style={{ padding: 6 }}
                >
                  <Download size={14} />
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={(e) => handleDelete(e, ds.id)}
                  disabled={deletingId === ds.id}
                  title="Delete"
                  style={{ padding: 6, color: 'var(--color-error)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
