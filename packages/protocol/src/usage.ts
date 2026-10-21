import { parseSnapshotAt } from './datetime.ts';
import { canonicalize } from './fingerprint.ts';
import { validateUsage11 } from './generated/usage-validator-v1-1.js';
import { scanSecrets } from './secrets.ts';
import type { UsageQuality, UsageSnapshot, UsageSnapshotV10, UsageSnapshotV11 } from './usage-types.ts';
import { checkUsage as checkUsageV10, USAGE_MAX_BYTES, usageDays, validUsageDate } from './usage-v1-0.ts';

export type * from './usage-api-types.ts';
export * from './usage-types.ts';
export { USAGE_MAX_BYTES, usageDays, validUsageDate } from './usage-v1-0.ts';

type Result =
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; error: 'usage_schema' | 'usage_semantics' };
const validQuality = (q: UsageQuality | undefined) =>
  !q || new Set(q.reasons.map((r) => r.code)).size === q.reasons.length;
const cannotDate = (q: UsageQuality | undefined) =>
  q?.reasons.some(
    (r) => ['request_start_unavailable', 'checkpoint_unallocated'].includes(r.code) && r.occurrences !== '0',
  );
export function checkUsage(value: unknown): Result {
  if (value && typeof value === 'object' && 'schema_version' in value && value.schema_version === '1.0')
    return checkUsageV10(value);
  if (!validateUsage11(value) || scanSecrets(JSON.stringify(value)).length)
    return { ok: false, error: 'usage_schema' };
  const s = value as UsageSnapshotV11;
  const fail = { ok: false, error: 'usage_semantics' } as const;
  const { quality, unallocated = [], ...base } = s;
  const rows = s.rows.map(({ quality: _quality, ...r }) => r);
  const days = s.days.map(({ quality: _quality, ...d }) => d);
  const projected: UsageSnapshotV10 = { ...base, schema_version: '1.0', rows, days };
  if (
    !checkUsageV10(projected).ok ||
    rows.length + unallocated.length > 2000 ||
    !validQuality(quality) ||
    s.days.some((d) => !validQuality(d.quality)) ||
    s.rows.some((r) => !validQuality(r.quality) || cannotDate(r.quality))
  )
    return fail;
  const keys = new Set<string>();
  const generated = parseSnapshotAt(s.generated_at);
  if (!generated) return fail;
  const generatedDay = new Date(generated.utcMs + 8 * 3600000).toISOString().slice(0, 10);
  for (const row of unallocated) {
    const { observed_date, time_basis, quality, counts, ...dimensions } = row;
    if (
      !validQuality(quality) ||
      quality.state !== 'reported' ||
      !quality.reasons.some(
        (r) =>
          ['request_start_unavailable', 'checkpoint_unallocated'].includes(r.code) && r.occurrences !== '0',
      )
    )
      return fail;
    if (time_basis === 'checkpoint_unknown' ? observed_date !== null : observed_date === null) return fail;
    if (observed_date !== null && (!validUsageDate(observed_date) || observed_date > generatedDay))
      return fail;
    const key = canonicalize({ observed_date, time_basis, ...dimensions });
    if (keys.has(key)) return fail;
    keys.add(key);
    const checked = checkUsageV10({
      ...projected,
      source_timezone: 'Asia/Shanghai',
      days: usageDays(s.range.start, s.range.end_exclusive).map((date) => ({ date, state: 'complete' })),
      rows: [
        {
          ...dimensions,
          counts,
          date: s.range.start,
          time_basis: s.source === 'account_daily' ? 'provider_day' : 'request_start',
        },
      ],
    });
    if (!checked.ok) return fail;
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
