import { parseSnapshotAt } from './datetime.ts';
import { canonicalize } from './fingerprint.ts';
import { validateUsage } from './generated/usage-validator.js';
import { scanSecrets } from './secrets.ts';
import { USAGE_INPUT_KEYS, type UsageSnapshot } from './usage-types.ts';

export type * from './usage-api-types.ts';
export * from './usage-types.ts';
export const USAGE_MAX_BYTES = 1024 * 1024;
export function validUsageDate(v: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    v >= '2000-01-01' &&
    v <= '2199-12-31' &&
    Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
  );
}
export function usageDays(start: string, end: string): string[] {
  if (!validUsageDate(start) || !validUsageDate(end) || end <= start) return [];
  const n = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (n > 366) return [];
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}
/** Fixed codes only: never expose input, unknown field names, JSON fragments or private filenames. */
export function checkUsage(
  value: unknown,
): { ok: true; snapshot: UsageSnapshot } | { ok: false; error: 'usage_schema' | 'usage_semantics' } {
  if (!validateUsage(value)) return { ok: false, error: 'usage_schema' };
  if (scanSecrets(JSON.stringify(value)).length) return { ok: false, error: 'usage_schema' };
  const s = value as UsageSnapshot;
  const fail = { ok: false, error: 'usage_semantics' } as const;
  const dates = usageDays(s.range.start, s.range.end_exclusive);
  if (!dates.length || dates.length !== s.days.length || dates.some((d, i) => s.days[i]?.date !== d))
    return fail;
  if (!parseSnapshotAt(s.generated_at) || !validUsageDate(s.generated_at.slice(0, 10))) return fail;
  if (BigInt(s.revision) === 0n) return fail;
  const keys = new Set<string>();
  for (const row of s.rows) {
    const day = s.days.find((d) => d.date === row.date);
    if (!day || day.state === 'missing' || day.state === 'not_collected') return fail;
    const c = row.counts;
    if (
      (s.source === 'codex_local' && !['openai', 'unknown'].includes(row.provider)) ||
      (s.source === 'claude_local' && !['anthropic', 'unknown'].includes(row.provider))
    )
      return fail;
    const known = USAGE_INPUT_KEYS.filter((k) => c[k] !== null);
    const sum = known.reduce((n, k) => n + BigInt(c[k] as string), 0n);
    if (
      c.input_total !== null &&
      (sum > BigInt(c.input_total) ||
        (known.length === USAGE_INPUT_KEYS.length && sum !== BigInt(c.input_total)))
    )
      return fail;
    if (row.cache_detail === 'complete' && known.length !== USAGE_INPUT_KEYS.length) return fail;
    if (
      c.output_total !== null &&
      c.output_reasoning_subset !== null &&
      BigInt(c.output_reasoning_subset) > BigInt(c.output_total)
    )
      return fail;
    if (
      row.classification === 'request_classified' &&
      (row.service_tier === 'unknown' || row.context_class === 'unknown' || row.region === 'unknown')
    )
      return fail;
    if (s.source === 'account_daily' && row.time_basis !== 'provider_day') return fail;
    if (row.time_basis !== 'provider_day' && s.source_timezone !== 'Asia/Shanghai') return fail;
    if (
      (row.effort === 'unknown') !== (row.effort_evidence === 'unknown') ||
      (row.effort === 'not_applicable') !== (row.effort_evidence === 'not_applicable')
    )
      return fail;
    const { counts: _counts, ...dimensions } = row;
    const key = canonicalize(dimensions);
    if (keys.has(key)) return fail;
    keys.add(key);
  }
  return { ok: true, snapshot: s };
}
export function parseUsage(text: string): ReturnType<typeof checkUsage> {
  if (new TextEncoder().encode(text).length > USAGE_MAX_BYTES) return { ok: false, error: 'usage_schema' };
  // Bound nesting before JSON.parse and Ajv. Quoted braces do not contribute.
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') {
      if (++depth > 32) return { ok: false, error: 'usage_schema' };
    } else if (c === '}' || c === ']') depth--;
  }
  try {
    return checkUsage(JSON.parse(text));
  } catch {
    return { ok: false, error: 'usage_schema' };
  }
}
