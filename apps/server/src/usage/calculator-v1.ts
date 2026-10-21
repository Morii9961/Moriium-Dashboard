/** Historical calculator, retained verbatim for verification of frozen usage-fixed-v1 bills. */
import {
  type FxSnapshot,
  type PriceCatalog,
  type UsageRow,
  type UsageSnapshotV10,
  usageDays,
  validUsageDate,
} from '@moriium-dashboard/protocol/usage';
import type { Database } from '../db.ts';
import { fixed, nano, type PricingMode, priceUsageRow, requireUsage } from './pricing.ts';
import { currentUsageDays, type DaySelection, getUsageImport } from './store.ts';
export function weekEnd(start: string) {
  requireUsage(validUsageDate(start) && new Date(`${start}T00:00:00Z`).getUTCDay() === 1, 'usage_week');
  return new Date(Date.parse(start) + 7 * 86400000).toISOString().slice(0, 10);
}
export interface BillRow {
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
}
export function calculateWeekV1(
  db: Database,
  dataset: string,
  start: string,
  catalogId: string | null,
  fxId: string | null,
  mode: PricingMode,
  frozenSelections?: DaySelection[],
) {
  const end = weekEnd(start),
    dates = usageDays(start, end);
  requireUsage(mode === 'classified' || mode === 'standard_short');
  requireUsage(db.prepare('SELECT 1 FROM usage_imports WHERE dataset_id=?').get(dataset), 'usage_not_found');
  const selections = (frozenSelections ?? currentUsageDays(db, dataset)).filter((d) =>
    dates.includes(d.date),
  );
  const catalogRecord = catalogId
    ? db.prepare('SELECT catalog FROM price_catalog_versions WHERE id=?').get(catalogId)
    : null;
  const fxRecord = fxId ? db.prepare('SELECT snapshot FROM fx_snapshots WHERE id=?').get(fxId) : null;
  requireUsage(!catalogId || catalogRecord, 'usage_not_found');
  requireUsage(!fxId || fxRecord, 'usage_not_found');
  const catalog = catalogRecord ? (JSON.parse(catalogRecord.catalog as string) as PriceCatalog) : null;
  const fx = fxRecord ? (JSON.parse(fxRecord.snapshot as string) as FxSnapshot) : null;
  const imports = new Map(
    selections
      .filter((s) => s.import_hash)
      .map((s) => [
        s.import_hash as string,
        JSON.parse(getUsageImport(db, s.import_hash as string).snapshot) as UsageSnapshotV10,
      ]),
  );
  const rows: BillRow[] = [],
    days: { date: string; state: string; tokens: string | null }[] = [];
  let measured = 0n,
    pricedTokens = 0n,
    unpricedTokens = 0n,
    usd = 0n,
    input = 0n,
    cache = 0n,
    high = 0n,
    xhigh = 0n;
  let unknownTotals = false,
    unknownRatios = false,
    hasPrice = false;
  let hasMeasurement = false;
  for (const date of dates) {
    const selection = selections.find((s) => s.date === date),
      snapshot = selection?.import_hash ? imports.get(selection.import_hash) : undefined;
    const coverage = snapshot?.days.find((d) => d.date === date)?.state ?? 'not_collected';
    let total = 0n,
      unknown = coverage !== 'complete';
    const dateRows = snapshot?.rows.filter((r) => r.date === date) ?? [];
    if (
      coverage === 'complete' &&
      !dateRows.length &&
      snapshot?.source !== 'account_daily' &&
      snapshot?.source_timezone === 'Asia/Shanghai'
    )
      hasMeasurement = true;
    for (const row of snapshot?.rows.filter((r) => r.date === date) ?? []) {
      const p = priceUsageRow(row, catalog, mode),
        c = row.counts;
      const tokens =
        c.input_total !== null && c.output_total !== null && row.time_basis !== 'provider_day'
          ? BigInt(c.input_total) + BigInt(c.output_total)
          : null;
      if (tokens === null) {
        unknown = true;
        unknownTotals = true;
      } else {
        hasMeasurement = true;
        total += tokens;
        measured += tokens;
        if (row.effort === 'high') high += tokens;
        if (row.effort === 'xhigh') xhigh += tokens;
      }
      if (row.time_basis === 'provider_day' || c.input_total === null || c.input_cache_read === null)
        unknownRatios = true;
      else {
        input += BigInt(c.input_total);
        cache += BigInt(c.input_cache_read);
      }
      if (p.usd_numerator !== null) {
        usd += BigInt(p.usd_numerator);
        hasPrice = true;
        if (tokens !== null) pricedTokens += tokens;
      } else if (tokens !== null) unpricedTokens += tokens;
      rows.push({
        date,
        source: snapshot?.source ?? 'unknown',
        model: row.model,
        effort: row.effort,
        effort_evidence: row.effort_evidence,
        tokens: tokens?.toString() ?? null,
        counts: c,
        reason: p.reason,
        assumptions: p.assumptions,
        usd: p.usd_numerator !== null ? fixed(BigInt(p.usd_numerator), 15) : null,
        items: p.items,
      });
    }
    if (unknown) unknownTotals = true;
    days.push({ date, state: coverage, tokens: unknown ? null : total.toString() });
  }
  const ratio = (a: bigint, b: bigint) => (b === 0n ? null : fixed((a * 10000n) / b, 2));
  return {
    calculator_version: 'usage-fixed-v1',
    dataset_id: dataset,
    week_start: start,
    end_exclusive: end,
    timezone: 'Asia/Shanghai',
    mode,
    catalog,
    fx,
    source_snapshot_hashes: [...imports.keys()].sort(),
    selections,
    days,
    rows,
    totals: {
      measured_tokens: hasMeasurement ? measured.toString() : null,
      has_unknown_totals: unknownTotals,
      priced_tokens: pricedTokens.toString(),
      unpriced_tokens: unpricedTokens.toString(),
      usd: hasPrice ? fixed(usd, 15) : null,
      cny: hasPrice && fx ? fixed(usd * nano(fx.rate), 24) : null,
      cache_read_percent: unknownRatios ? null : ratio(cache, input),
      high_percent: ratio(high, measured),
      xhigh_percent: ratio(xhigh, measured),
    },
    diagnostics: {
      partial_coverage: days.some((d) => d.state !== 'complete'),
      missing_fx: fx === null,
      unpriced_rows: rows.filter((r) => r.usd === null).length,
      unknown_total_rows: rows.filter((r) => r.tokens === null).length,
      effort_inferred: rows.some((r) => r.effort_evidence === 'inferred'),
      no_cross_source_sum: true,
    },
  };
}
