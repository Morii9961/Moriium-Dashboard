import type {
  CoverageState,
  FxSnapshot,
  PriceCatalog,
  UnallocatedUsageRow,
  UsageQuality,
  UsageRow,
  UsageSource,
} from './usage-types.ts';
export interface UsageDatasetObservations {
  import_hash: string | null;
  unallocated_state: 'reported' | 'not_reported';
  quality?: UsageQuality;
  unallocated: UnallocatedUsageRow[];
}
export interface UsageSelection {
  id: number;
  dataset_id: string;
  date: string;
  import_hash: string | null;
  previous_hash: string | null;
  action: string;
  at: string;
}
export interface UsageDataset {
  id: string;
  source: UsageSource;
  expected_state: string;
  imports: {
    hash: string;
    dataset_id: string;
    revision: string;
    source: string;
    imported_at: string;
    range: { start: string; end_exclusive: string };
  }[];
  selections: UsageSelection[];
  recent_selections: UsageSelection[];
}
export interface UsagePreview {
  schema_version?: '1.0' | '1.1';
  quality?: UsageQuality;
  unallocated?: UnallocatedUsageRow[];
  row_quality?: { date: string; model: string; effort: string; quality?: UsageQuality }[];
  daily_totals: { date: string; previous_tokens: string | null; new_tokens: string | null }[];
  hash: string;
  duplicate: boolean;
  expected_state: string;
  conflicts: { date: string; hash: string | null }[];
  range: { start: string; end_exclusive: string };
  source: UsageSource;
  rows: number;
  days: { date: string; state: CoverageState; quality?: UsageQuality }[];
}
export interface UsageWeek {
  dataset_observations?: UsageDatasetObservations;
  snapshot_quality?: { import_hash: string; quality?: UsageQuality }[];
  basis_bill_id?: number | null;
  calculator_version: string;
  dataset_id: string;
  week_start: string;
  end_exclusive: string;
  timezone: string;
  mode: 'classified' | 'standard_short';
  catalog: PriceCatalog | null;
  fx: FxSnapshot | null;
  source_snapshot_hashes: string[];
  selections: UsageSelection[];
  days: { date: string; state: string; tokens: string | null; quality?: UsageQuality }[];
  rows: {
    quality?: UsageQuality;
    date: string;
    source: string;
    model: string;
    effort: string;
    effort_evidence: string;
    tokens: string | null;
    counts: UsageRow['counts'];
    reason: string | null;
    assumptions: string[];
    usd: string | null;
    items: { category: string; tokens: string; usd: string; rate: string; source: string }[];
  }[];
  totals: {
    measured_tokens: string | null;
    has_unknown_totals: boolean;
    priced_tokens: string;
    unpriced_tokens: string;
    usd: string | null;
    cny: string | null;
    cache_read_percent: string | null;
    high_percent: string | null;
    xhigh_percent: string | null;
  };
  diagnostics: {
    partial_coverage: boolean;
    missing_fx: boolean;
    unpriced_rows: number;
    unknown_total_rows: number;
    effort_inferred: boolean;
    no_cross_source_sum: boolean;
  };
}
export interface UsageBillSummary {
  id: number;
  revision: number;
  previous_id: number | null;
  created_at: string;
  hash: string;
}
export interface UsageBill extends UsageBillSummary {
  bill: UsageWeek;
}
