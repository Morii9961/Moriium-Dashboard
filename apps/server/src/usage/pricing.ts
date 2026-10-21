import {
  type FxSnapshot,
  type PriceCatalog,
  type PriceRule,
  USAGE_BILLING_KEYS,
  type UsageRow,
  validUsageDate,
} from '@moriium-dashboard/protocol/usage';
export class UsageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export function requireUsage(condition: unknown, code = 'usage_invalid'): asserts condition {
  if (!condition) throw new UsageError(code);
}
const decimal = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,9})?$/;
export function nano(value: string): bigint {
  requireUsage(typeof value === 'string' && decimal.test(value));
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole as string) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
}
export function fixed(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
const identifier = (v: unknown) => typeof v === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(v);
export function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireUsage(!!value && typeof value === 'object' && !Array.isArray(value));
  requireUsage(Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)));
}
function officialUrl(value: unknown, provider: string) {
  requireUsage(typeof value === 'string' && value.length <= 300);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError('usage_invalid');
  }
  const domains =
    provider === 'openai'
      ? ['developers.openai.com', 'openai.com']
      : provider === 'anthropic'
        ? ['platform.claude.com', 'docs.anthropic.com', 'www.anthropic.com']
        : [];
  requireUsage(
    url.protocol === 'https:' &&
      domains.includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      /^[a-z0-9/_.-]*$/i.test(url.pathname),
  );
}
export function validateCatalog(value: unknown): PriceCatalog {
  exactKeys(value, ['id', 'version', 'checked_at', 'rules']);
  requireUsage(
    identifier(value.id) &&
      identifier(value.version) &&
      typeof value.checked_at === 'string' &&
      validUsageDate(value.checked_at),
  );
  requireUsage(Array.isArray(value.rules) && value.rules.length > 0 && value.rules.length <= 500);
  const rules = value.rules as unknown[];
  for (const candidate of rules) {
    exactKeys(candidate, [
      'provider',
      'model',
      'effective_from',
      'effective_to',
      'tier',
      'context_class',
      'region',
      'category',
      'usd_per_million',
      'official_source',
    ]);
    const r = candidate as unknown as PriceRule;
    requireUsage(['openai', 'anthropic'].includes(r.provider) && identifier(r.model));
    requireUsage(
      typeof r.effective_from === 'string' &&
        typeof r.effective_to === 'string' &&
        validUsageDate(r.effective_from) &&
        validUsageDate(r.effective_to) &&
        r.effective_from < r.effective_to,
    );
    requireUsage(
      ['standard', 'fast', 'ultrafast', 'flex', 'batch'].includes(r.tier) &&
        ['short', 'long', 'not_applicable'].includes(r.context_class) &&
        typeof r.region === 'string' &&
        /^(global|[a-z]{2}(?:-[a-z0-9]+){0,3})$/.test(r.region) &&
        r.region.length <= 40 &&
        USAGE_BILLING_KEYS.includes(r.category),
    );
    nano(r.usd_per_million);
    officialUrl(r.official_source, r.provider);
  }
  const typed = rules as PriceRule[];
  for (let i = 0; i < typed.length; i++)
    for (let j = 0; j < i; j++) {
      const a = typed[i] as PriceRule,
        b = typed[j] as PriceRule;
      const key = (r: PriceRule) =>
        JSON.stringify([r.provider, r.model, r.tier, r.context_class, r.region, r.category]);
      requireUsage(
        key(a) !== key(b) || a.effective_from >= b.effective_to || b.effective_from >= a.effective_to,
        'usage_ambiguous_price',
      );
    }
  return value as unknown as PriceCatalog;
}
export function validateFx(value: unknown): FxSnapshot {
  exactKeys(value, ['id', 'base', 'quote', 'rate', 'as_of', 'source', 'source_url', 'kind']);
  requireUsage(
    identifier(value.id) &&
      value.base === 'USD' &&
      value.quote === 'CNY' &&
      typeof value.as_of === 'string' &&
      validUsageDate(value.as_of),
  );
  requireUsage(
    ['manual', 'ecb', 'pbc'].includes(value.source as string) &&
      ['manual_assumption', 'reference_rate'].includes(value.kind as string),
  );
  requireUsage(value.source !== 'manual' || value.kind === 'manual_assumption');
  if (value.source === 'manual') requireUsage(value.source_url === null);
  else {
    requireUsage(typeof value.source_url === 'string' && value.source_url.length <= 300);
    let url: URL;
    try {
      url = new URL(value.source_url);
    } catch {
      throw new UsageError('usage_invalid');
    }
    const hosts = value.source === 'ecb' ? ['www.ecb.europa.eu', 'data.ecb.europa.eu'] : ['www.pbc.gov.cn'];
    requireUsage(
      url.protocol === 'https:' &&
        hosts.includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        !url.port &&
        /^[a-z0-9/_.-]*$/i.test(url.pathname),
    );
  }
  requireUsage(nano(value.rate as string) > 0n);
  return value as unknown as FxSnapshot;
}
export type PricingMode = 'classified' | 'standard_short';
export function priceUsageRow(row: UsageRow, catalog: PriceCatalog | null, mode: PricingMode) {
  const assumptions: string[] = [];
  const unpriced = (reason: string) => ({ usd_numerator: null, reason, assumptions, items: [] });
  if (row.time_basis === 'provider_day') return unpriced('time_not_projectable');
  if (!catalog) return unpriced('price_missing');
  if (USAGE_BILLING_KEYS.some((k) => row.counts[k] === null) || row.cache_detail !== 'complete')
    return unpriced('counts_missing');
  if (row.classification !== 'request_classified' && mode === 'classified')
    return unpriced('conditions_unknown');
  let tier = row.service_tier,
    context = row.context_class,
    region = row.region;
  if (row.classification !== 'request_classified') {
    assumptions.push('assumed_standard_short');
    // Never override any actually known non-standard condition.
    if (tier === 'unknown') tier = 'standard';
    if (context === 'unknown') context = 'short';
    if (region === 'unknown') region = 'global';
  }
  let total = 0n;
  const items: { category: string; tokens: string; usd: string; rate: string; source: string }[] = [];
  for (const category of USAGE_BILLING_KEYS) {
    const tokens = row.counts[category] as string;
    if (tokens === '0') continue;
    const rule = catalog.rules.find(
      (r) =>
        r.provider === row.provider &&
        r.model === row.model &&
        r.tier === tier &&
        r.context_class === context &&
        r.region === region &&
        r.category === category &&
        r.effective_from <= row.date &&
        row.date < r.effective_to,
    );
    if (!rule) return unpriced('rule_missing');
    const amount = BigInt(tokens) * nano(rule.usd_per_million);
    total += amount;
    items.push({
      category,
      tokens,
      usd: fixed(amount, 15),
      rate: rule.usd_per_million,
      source: rule.official_source,
    });
  }
  return { usd_numerator: total.toString(), reason: null, assumptions, items };
}
