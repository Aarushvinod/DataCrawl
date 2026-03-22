const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'Planning assistant',
  compliance: 'Source review',
  script_writer: 'Data collection',
  web_crawler: 'Website helper',
  synthetic_generator: 'Synthetic data',
  normalizer: 'Data cleanup',
  validator: 'Quality check',
};

const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning',
  awaiting_approval: 'Waiting for your review',
  approved: 'Approved',
  running: 'Running',
  awaiting_user_input: 'Waiting for your input',
  awaiting_paid_approval: 'Waiting for payment approval',
  completed: 'Completed',
  failed: 'Needs attention',
  pending: 'Getting ready',
  idle: 'Idle',
  killed: 'Stopped',
};

const ACTION_LABELS: Record<string, string> = {
  reason: 'Planning the next step',
  compliance_check: 'Reviewing a source',
  generate_script: 'Preparing a data collection script',
  normalize: 'Cleaning up the dataset',
  validate: 'Checking the results',
  generate_data: 'Creating synthetic data',
  crawl: 'Working through a website',
  crawl_fallback: 'Preparing a website fallback',
  plan_revision_requested: 'Updating the plan',
  plan_approved: 'Starting the plan',
  finish: 'Wrapping up',
};

const GENERATION_MODE_LABELS: Record<string, string> = {
  real: 'Real data',
  synthetic: 'Synthetic data',
};

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAgentLabel(value?: string): string {
  if (!value) {
    return '';
  }
  return AGENT_LABELS[value] || toTitleCase(value);
}

export function formatPhaseLabel(value?: string): string {
  if (!value) {
    return '';
  }
  return PHASE_LABELS[value] || toTitleCase(value);
}

export function formatStatusLabel(value?: string): string {
  return formatPhaseLabel(value);
}

export function formatActionLabel(value?: string): string {
  if (!value) {
    return '';
  }
  return ACTION_LABELS[value] || toTitleCase(value);
}

export function formatGenerationModeLabel(value?: string): string {
  if (!value) {
    return '';
  }
  return GENERATION_MODE_LABELS[value] || toTitleCase(value);
}
