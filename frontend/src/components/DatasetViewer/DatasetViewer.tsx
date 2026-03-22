import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, GitBranch } from 'lucide-react';
import api from '../../services/api';

interface DatasetDetail {
  id: string;
  name: string;
  row_count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  format: string;
  size_bytes: number;
  created_at: string;
  lineage: LineageNode[];
}

interface LineageNode {
  id: string;
  label: string;
  type: string;
  parent_id?: string;
}

export default function DatasetViewer() {
  const { projectId, datasetId } = useParams<{ projectId: string; datasetId: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLineage, setShowLineage] = useState(false);

  const fetchDataset = useCallback(async () => {
    if (!projectId || !datasetId) return;
    try {
      setLoading(true);
      const data = await api.get<DatasetDetail>(
        `/api/projects/${projectId}/datasets/${datasetId}`
      );
      setDataset(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }, [projectId, datasetId]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  async function handleDownload() {
    if (!projectId || !datasetId) return;
    try {
      const data = await api.get<{ download_url: string }>(
        `/api/projects/${projectId}/datasets/${datasetId}/download`
      );
      const a = document.createElement('a');
      a.href = data.download_url;
      a.download = `${dataset?.name || 'dataset'}.csv`;
      a.rel = 'noopener noreferrer';
      a.click();
    } catch {
      // Download failed
    }
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
        Loading dataset...
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div style={{ color: 'var(--color-error)', padding: '40px 0', textAlign: 'center' }}>
        {error || 'Dataset not found.'}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <button
        className="btn btn--ghost"
        onClick={() => navigate(`/projects/${projectId}`)}
        style={{ marginBottom: 16, padding: '4px 0' }}
      >
        <ArrowLeft size={16} />
        Back to Project
      </button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{dataset.name}</h1>
          <div
            style={{
              display: 'flex',
              gap: 16,
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            <span className="mono">{dataset.row_count.toLocaleString()} rows</span>
            <span className="mono">{dataset.columns.length} columns</span>
            <span>{dataset.format}</span>
            <span>{new Date(dataset.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn--secondary"
            onClick={() => setShowLineage(!showLineage)}
          >
            <GitBranch size={16} />
            {showLineage ? 'Hide Lineage' : 'Lineage'}
          </button>
          <button className="btn btn--primary" onClick={handleDownload}>
            <Download size={16} />
            Download
          </button>
        </div>
      </div>

      {/* Lineage panel */}
      {showLineage && dataset.lineage && dataset.lineage.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Data Lineage</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dataset.lineage.map((node, i) => (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: node.parent_id ? 24 : 0,
                }}
              >
                {i > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>&#8627;</span>
                )}
                <div
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{node.label}</span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {node.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data table */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'auto',
          maxHeight: 'calc(100vh - 280px)',
        }}
      >
        <table>
          <thead>
            <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 1 }}>
              <th
                style={{
                  width: 50,
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  padding: '10px 12px',
                }}
              >
                #
              </th>
              {dataset.columns.map((col) => (
                <th key={col} style={{ padding: '10px 12px' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.rows.slice(0, 100).map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td
                  className="mono"
                  style={{
                    width: 50,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                  }}
                >
                  {rowIdx + 1}
                </td>
                {dataset.columns.map((col) => (
                  <td
                    key={col}
                    className="mono"
                    style={{
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row[col] !== null && row[col] !== undefined
                      ? String(row[col])
                      : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {dataset.rows.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            This dataset has no rows.
          </div>
        )}
      </div>

      {dataset.row_count > 100 && (
        <div
          style={{
            textAlign: 'center',
            padding: '12px 0',
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          Showing first 100 of {dataset.row_count.toLocaleString()} rows. Download the full dataset for all data.
        </div>
      )}
    </div>
  );
}
