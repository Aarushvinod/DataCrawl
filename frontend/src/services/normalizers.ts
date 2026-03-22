export interface ApiProject {
  id: string;
  name?: string | null;
  description?: string | null;
  budget?: number | null;
  budget_total?: number | null;
  budget_spent?: number | null;
  status?: string | null;
  dataset_count?: number | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  budget: number;
  budget_spent: number;
  status: string;
  dataset_count: number;
}

export interface ApiRunSummary {
  id: string;
  name?: string | null;
  status?: string | null;
  generation_mode?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  duration_seconds?: number | null;
  total_cost?: number | null;
  cost?: number | null;
}

export interface RunSummary {
  id: string;
  name: string;
  status: string;
  generation_mode: string;
  created_at: string;
  duration_seconds?: number;
  cost?: number;
}

function toNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeProject(project: ApiProject): ProjectRecord {
  return {
    id: project.id,
    name: project.name || 'Untitled Project',
    description: project.description || '',
    budget: toNumber(project.budget_total ?? project.budget),
    budget_spent: toNumber(project.budget_spent),
    status: project.status || 'active',
    dataset_count: toNumber(project.dataset_count),
  };
}

export function normalizeRunSummary(run: ApiRunSummary): RunSummary {
  return {
    id: run.id,
    name: run.name || `Run ${run.id.slice(0, 8)}`,
    status: run.status || 'pending',
    generation_mode: run.generation_mode || 'real',
    created_at: run.created_at || run.started_at || '',
    duration_seconds: toOptionalNumber(run.duration_seconds),
    cost: toOptionalNumber(run.cost ?? run.total_cost),
  };
}
