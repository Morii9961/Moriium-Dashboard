/** UsageSnapshot is independent of Project Status Protocol. Counts never use JS numbers. */
export const USAGE_COUNT_KEYS = [
  'input_total',
  'input_uncached',
  'input_cache_read',
  'input_cache_write_5m',
  'input_cache_write_1h',
  'input_cache_write_30m',
  'input_cache_write_unknown',
  'output_total',
  'output_reasoning_subset',
] as const;
export const USAGE_INPUT_KEYS = [
  'input_uncached',
  'input_cache_read',
  'input_cache_write_5m',
  'input_cache_write_1h',
  'input_cache_write_30m',
  'input_cache_write_unknown',
] as const;
export const USAGE_BILLING_KEYS = [...USAGE_INPUT_KEYS, 'output_total'] as const;
export type CountKey = (typeof USAGE_COUNT_KEYS)[number];
export type BillingKey = (typeof USAGE_BILLING_KEYS)[number];
export type UsageSource = 'codex_local' | 'claude_local' | 'account_daily' | 'manual_aggregate';
export type UsageProvider = 'openai' | 'anthropic' | 'unknown';
export type UsageTier = 'standard' | 'fast' | 'ultrafast' | 'flex' | 'batch' | 'unknown';
export type UsageContext = 'short' | 'long' | 'not_applicable' | 'unknown';
export type CoverageState = 'complete' | 'partial' | 'missing' | 'not_collected';
export interface UsageRow {
  date: string;
  provider: UsageProvider;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'unknown' | 'not_applicable';
  effort_evidence: 'reported' | 'inferred' | 'unknown' | 'not_applicable';
  time_basis: 'request_start' | 'shanghai_day' | 'provider_day';
  service_tier: UsageTier;
  context_class: UsageContext;
  region: string;
  classification: 'request_classified' | 'unknown';
  cache_detail: 'complete' | 'missing';
  counts: Record<CountKey, string | null>;
}
export interface UsageSnapshotV10 {
  kind: 'ai_usage_snapshot';
  schema_version: '1.0';
  mode: 'range_replacement';
  dataset_id: string;
  revision: string;
  generated_at: string;
  timezone: 'Asia/Shanghai';
  source: UsageSource;
  source_timezone: 'Asia/Shanghai' | 'UTC' | 'provider_defined' | 'unknown';
  range: { start: string; end_exclusive: string };
  adapter_version: string;
  days: { date: string; state: CoverageState }[];
  rows: UsageRow[];
}
export const USAGE_QUALITY_CODES = [
  'counter_reset',
  'session_copy_conflict',
  'source_missing',
  'source_unreadable',
  'source_deleted',
  'retained_not_observed',
  'checkpoint_unallocated',
  'request_start_unavailable',
  'incomplete_tail',
  'parse_rejected',
  'unsupported_source',
  'model_unresolved',
  'effort_inferred',
  'counts_unreported',
  'pricing_conditions_unknown',
] as const;
export type UsageQualityCode = (typeof USAGE_QUALITY_CODES)[number];
export const USAGE_QUALITY_UNITS: Record<UsageQualityCode, string> = {
  counter_reset: 'checkpoints',
  session_copy_conflict: 'sessions',
  source_missing: 'files',
  source_unreadable: 'files',
  source_deleted: 'files',
  retained_not_observed: 'checkpoints',
  checkpoint_unallocated: 'checkpoints',
  request_start_unavailable: 'observations',
  incomplete_tail: 'files',
  parse_rejected: 'records',
  unsupported_source: 'records',
  model_unresolved: 'records',
  effort_inferred: 'records',
  counts_unreported: 'records',
  pricing_conditions_unknown: 'records',
};
export interface UsageQuality {
  state: 'reported' | 'not_reported';
  reasons: { code: UsageQualityCode; occurrences: string | null }[];
}
export interface UsageRowV11 extends UsageRow {
  quality?: UsageQuality;
}
export interface UnallocatedUsageRow extends Omit<UsageRow, 'date' | 'time_basis'> {
  observed_date: string | null;
  time_basis: 'usage_observation' | 'response_completion' | 'checkpoint_unknown';
  quality: UsageQuality;
}
export interface UsageSnapshotV11 extends Omit<UsageSnapshotV10, 'schema_version' | 'days' | 'rows'> {
  schema_version: '1.1';
  quality?: UsageQuality;
  days: (UsageSnapshotV10['days'][number] & { quality?: UsageQuality })[];
  rows: UsageRowV11[];
  unallocated?: UnallocatedUsageRow[];
}
export type UsageSnapshot = UsageSnapshotV10 | UsageSnapshotV11;
export interface PriceRule {
  provider: UsageProvider;
  model: string;
  effective_from: string;
  effective_to: string;
  tier: Exclude<UsageTier, 'unknown'>;
  context_class: Exclude<UsageContext, 'unknown'>;
  region: string;
  category: BillingKey;
  usd_per_million: string;
  official_source: string;
}
export interface PriceCatalog {
  id: string;
  version: string;
  checked_at: string;
  rules: PriceRule[];
}
export interface FxSnapshot {
  id: string;
  base: 'USD';
  quote: 'CNY';
  rate: string;
  as_of: string;
  source: string;
  source_url: string | null;
  kind: 'manual_assumption' | 'reference_rate';
}
