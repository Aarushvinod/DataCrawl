import { Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

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

interface DatasetListProps {
  projectId: string;
  datasets: Dataset[];
  onDeleted: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const unit = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(unit));
  return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(1))} ${sizes[index]}`;
}

export default function DatasetList({ projectId, datasets, onDeleted }: DatasetListProps) {
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDownload(event: React.MouseEvent, datasetId: string) {
    event.stopPropagation();
    const data = await api.get<{ download_url: string }>(`/api/projects/${projectId}/datasets/${datasetId}/download`);
    const anchor = document.createElement('a');
    anchor.href = data.download_url;
    anchor.download = `dataset-${datasetId}.csv`;
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }

  async function handleDelete(event: React.MouseEvent, datasetId: string) {
    event.stopPropagation();
    if (!confirm('Delete this dataset? This cannot be undone.')) {
      return;
    }

    setDeletingId(datasetId);
    try {
      await api.delete(`/api/projects/${projectId}/datasets/${datasetId}`);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (datasets.length === 0) {
    return (
      <div className="dc-empty-state">
        <div className="dc-empty-state__spider" />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No datasets yet</div>
          <div style={{ color: 'var(--text-secondary)' }}>Captured outputs appear here as soon as a run finishes and saves its dataset.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-data-table-wrap dc-data-table-wrap--datasets">
      <table className="dc-data-table">
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
          {datasets.map((dataset) => (
            <tr
              key={dataset.id}
              className="dc-dataset-row"
              onClick={() => navigate(`/projects/${projectId}/datasets/${dataset.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileSpreadsheet size={16} color="var(--accent-primary)" />
                  <div>
                    <div className="dc-dataset-title">{dataset.name}</div>
                    <div className="dc-run-mode" style={{ marginTop: 4 }}>
                      {dataset.source_type === 'synthetic' ? 'Synthetic finance dataset' : 'Captured market dataset'}
                      {dataset.version ? ` - v${dataset.version}` : ''}
                    </div>
                  </div>
                </div>
              </td>
              <td className="mono">{dataset.row_count.toLocaleString()}</td>
              <td className="mono">{formatBytes(dataset.size_bytes)}</td>
              <td>{dataset.format}</td>
              <td>{new Date(dataset.created_at).toLocaleDateString()}</td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn btn--ghost" onClick={(event) => void handleDownload(event, dataset.id)} style={{ paddingInline: 12 }}>
                    <Download size={14} />
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={(event) => void handleDelete(event, dataset.id)}
                    disabled={deletingId === dataset.id}
                    style={{ paddingInline: 12, color: 'var(--color-error)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
