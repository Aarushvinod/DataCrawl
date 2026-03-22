import { ArrowLeft, Database, Download, GitBranch, Radar, Rows3, Scale } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

interface DatasetDetail {
  id: string;
  name: string;
  row_count: number;
  columns: string[];
  preview_rows?: Record<string, unknown>[];
  format: string;
  size_bytes: number;
  created_at: string;
  lineage: Record<string, unknown>;
  source_type: string;
  version?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const unit = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(unit));
  return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(1))} ${sizes[index]}`;
}

export default function DatasetViewer() {
  const { projectId, datasetId } = useParams<{ projectId: string; datasetId: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLineage, setShowLineage] = useState(false);

  const fetchDataset = useCallback(async () => {
    if (!projectId || !datasetId) {
      return;
    }

    try {
      setLoading(true);
      const response = await api.get<DatasetDetail>(`/api/projects/${projectId}/datasets/${datasetId}`);
      setDataset(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dataset');
    } finally {
      setLoading(false);
    }
  }, [datasetId, projectId]);

  useEffect(() => {
    void fetchDataset();
  }, [fetchDataset]);

  const previewRows = useMemo(() => dataset?.preview_rows || [], [dataset?.preview_rows]);
  const visibleColumns = useMemo(() => {
    if (dataset?.columns?.length) {
      return dataset.columns;
    }
    return previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
  }, [dataset?.columns, previewRows]);

  const lineageEntries = useMemo(
    () => Object.entries(dataset?.lineage || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''),
    [dataset?.lineage],
  );

  async function handleDownload() {
    if (!projectId || !datasetId) {
      return;
    }
    const data = await api.get<{ download_url: string }>(`/api/projects/${projectId}/datasets/${datasetId}/download`);
    const anchor = document.createElement('a');
    anchor.href = data.download_url;
    anchor.download = `${dataset?.name || 'dataset'}.csv`;
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }

  if (loading) {
    return <div className="dc-empty-state"><div className="dc-empty-state__spider" /><div>Loading dataset...</div></div>;
  }

  if (error || !dataset) {
    return <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>{error || 'Dataset not found.'}</div>;
  }

  const datasetSignals = [
    {
      label: 'Rows',
      value: dataset.row_count.toLocaleString(),
      note: 'captured records',
      icon: <Rows3 size={12} />,
      tone: 'success' as const,
    },
    {
      label: 'Columns',
      value: visibleColumns.length.toLocaleString(),
      note: 'structured fields',
      icon: <Database size={12} />,
      tone: 'secondary' as const,
    },
    {
      label: 'Capture size',
      value: formatBytes(dataset.size_bytes),
      note: dataset.format.toUpperCase(),
      icon: <Scale size={12} />,
      tone: 'warning' as const,
    },
    {
      label: 'Source mode',
      value: dataset.source_type === 'synthetic' ? 'Synthetic' : 'Collected',
      note: 'finance-ready output',
      icon: <Radar size={12} />,
      tone: dataset.source_type === 'synthetic' ? 'secondary' as const : 'primary' as const,
    },
  ];

  return (
    <div className="dc-page-stack">
      <button className="btn btn--ghost" onClick={() => navigate(`/projects/${projectId}`)} style={{ width: 'fit-content' }}>
        <ArrowLeft size={16} />
        Back to project
      </button>

      <section className="dc-page-header">
        <ConsoleAmbientDigits variant="header" tone="mixed" className="dc-page-header__ambient" />
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Dataset preview</p>
          <h1 className="dc-page-header__title">{dataset.name}</h1>
          <SignalStrip items={datasetSignals} className="dc-page-header__signals" compact />
          <div className="dc-header-meta">
            <span className="dc-tag mono">{dataset.row_count.toLocaleString()} rows</span>
            <span className="dc-tag mono">{visibleColumns.length} columns</span>
            <span className="dc-tag">{formatBytes(dataset.size_bytes)}</span>
            <span className="dc-tag">{dataset.source_type === 'synthetic' ? 'Synthetic output' : 'Collected output'}</span>
            {dataset.version !== undefined && <span className="dc-tag">{`Version ${dataset.version}`}</span>}
          </div>
        </div>

        <div className="dc-header-actions">
          <button className="btn btn--secondary" onClick={() => setShowLineage((current) => !current)}>
            <GitBranch size={16} />
            {showLineage ? 'Hide capture record' : 'Show capture record'}
          </button>
          <button className="btn btn--primary" onClick={handleDownload}>
            <Download size={16} />
            Download dataset
          </button>
        </div>
      </section>

      {showLineage && lineageEntries.length > 0 && (
        <section className="card dc-section-card">
          <div className="dc-page-header__copy">
            <p className="dc-section__eyebrow">Capture record</p>
            <h2 className="dc-section__title">Where this dataset came from</h2>
          </div>
          <div className="dc-trace-grid">
            {lineageEntries.map(([key, value]) => (
              <div key={key} className="dc-trace-item">
                <span className="dc-trace-item__label">{key.replace(/_/g, ' ')}</span>
                <div style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card dc-section-card">
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Preview</p>
          <h2 className="dc-section__title">Structured output, ready to inspect</h2>
          <p className="dc-section__copy">
            Previewing the first {Math.min(previewRows.length, 100)} rows. Download the full dataset if you need the complete file.
          </p>
        </div>

        <div className="dc-data-table-wrap dc-data-table-wrap--settle">
          <table className="dc-data-table">
            <thead>
              <tr>
                <th>#</th>
                {visibleColumns.map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {previewRows.slice(0, 100).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="mono">{rowIndex + 1}</td>
                  {visibleColumns.map((column) => (
                    <td key={column} className="mono" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row[column] !== null && row[column] !== undefined ? String(row[column]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {previewRows.length === 0 && (
            <div className="dc-empty-state" style={{ minHeight: 180 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Preview unavailable</div>
                <div style={{ color: 'var(--text-secondary)' }}>Download the file to inspect the full contents.</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
