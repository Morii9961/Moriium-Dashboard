import {
  type FxSnapshot,
  type PriceCatalog,
  type UsageDatasetObservations,
  type UsageQuality,
  type UsageRow,
  type UsageRowV11,
  type UsageSnapshot,
  type UsageWeek,
  usageDays,
  validUsageDate,
} from '@moriium-dashboard/protocol/usage';
import { type Database, transaction } from '../db.ts';
import { fixed, nano, type PricingMode, priceUsageRow, requireUsage } from './pricing.ts';
import { currentUsageDays, type DaySelection, getUsageImport, usageHash } from './store.ts';
export function weekEnd(start: string) {
  requireUsage(validUsageDate(start) && new Date(`${start}T00:00:00Z`).getUTCDay() === 1, 'usage_week');
  return new Date(Date.parse(start) + 7 * 86400000).toISOString().slice(0, 10);
}
export interface BillRow {
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
}
export function calculateWeek(
  db: Database,
  dataset: string,
  start: string,
  catalogId: string | null,
  fxId: string | null,
  mode: PricingMode,
  frozenSelections?: DaySelection[],
  frozenObservationHash?: string | null,
) {
  const end = weekEnd(start),
    dates = usageDays(start, end);
  requireUsage(mode === 'classified' || mode === 'standard_short');
  requireUsage(db.prepare('SELECT 1 FROM usage_imports WHERE dataset_id=?').get(dataset), 'usage_not_found');
  const allSelections = frozenSelections ?? currentUsageDays(db, dataset);
  const selections = allSelections.filter((d) => dates.includes(d.date));
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
        JSON.parse(getUsageImport(db, s.import_hash as string).snapshot) as UsageSnapshot,
      ]),
  );
  const rows: BillRow[] = [],
    days: { date: string; state: string; tokens: string | null; quality?: UsageQuality }[] = [];
  const observationHash =
    frozenObservationHash === undefined
      ? ([...allSelections].filter((s) => s.import_hash).sort((a, b) => b.id - a.id)[0]?.import_hash ?? null)
      : frozenObservationHash;
  const observation = observationHash
    ? (JSON.parse(getUsageImport(db, observationHash).snapshot) as UsageSnapshot)
    : null;
  requireUsage(!observation || observation.dataset_id === dataset);
  const dataset_observations: UsageDatasetObservations = {
    import_hash: observationHash,
    unallocated_state:
      observation?.schema_version === '1.1' && observation.unallocated !== undefined
        ? 'reported'
        : 'not_reported',
    ...(observation?.schema_version === '1.1' && observation.quality ? { quality: observation.quality } : {}),
    unallocated: observation?.schema_version === '1.1' ? (observation.unallocated ?? []) : [],
  };
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
      unknown =
        coverage !== 'complete' ||
        snapshot?.source === 'account_daily' ||
        snapshot?.source_timezone !== 'Asia/Shanghai';
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
        ...(snapshot?.schema_version === '1.1' && (row as UsageRowV11).quality
          ? { quality: (row as UsageRowV11).quality }
          : {}),
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
    const dayQuality =
      snapshot?.schema_version === '1.1' ? snapshot.days.find((d) => d.date === date)?.quality : undefined;
    days.push({
      date,
      state: coverage,
      tokens: unknown ? null : total.toString(),
      ...(dayQuality ? { quality: dayQuality } : {}),
    });
  }
  const ratio = (a: bigint, b: bigint) => (b === 0n ? null : fixed((a * 10000n) / b, 2));
  return {
    calculator_version: 'usage-fixed-v2',
    dataset_observations,
    snapshot_quality: [...imports].map(([hash, s]) => ({
      import_hash: hash,
      ...(s.schema_version === '1.1' && s.quality ? { quality: s.quality } : {}),
    })),
    dataset_id: dataset,
    week_start: start,
    end_exclusive: end,
    timezone: 'Asia/Shanghai',
    mode,
    catalog,
    fx,
    source_snapshot_hashes: [
      ...new Set([...imports.keys(), ...(observationHash ? [observationHash] : [])]),
    ].sort(),
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
      partial_coverage: days.some((d) => d.state !== 'complete' || d.tokens === null),
      missing_fx: fx === null,
      unpriced_rows: rows.filter((r) => r.usd === null).length,
      unknown_total_rows: rows.filter((r) => r.tokens === null).length,
      effort_inferred: rows.some((r) => r.effort_evidence === 'inferred'),
      no_cross_source_sum: true,
    },
  };
}
export type WeeklyBill = UsageWeek;
export function createBill(
  db: Database,
  dataset: string,
  start: string,
  catalog: string | null,
  fx: string | null,
  mode: PricingMode,
  previous: number | null,
  now: Date,
) {
  return transaction(db, () => {
    if (previous !== null)
      requireUsage(
        db
          .prepare('SELECT 1 FROM usage_bills WHERE id=? AND dataset_id=? AND week_start=?')
          .get(previous, dataset, start),
        'usage_not_found',
      );
    const result = calculateWeek(
      db,
      dataset,
      start,
      catalog,
      fx,
      mode,
      previous === null ? undefined : readBill(db, previous).bill.selections,
      previous === null ? undefined : (readBill(db, previous).bill.dataset_observations?.import_hash ?? null),
    );
    const revision = Number(
      db
        .prepare(
          'SELECT COALESCE(MAX(revision),0)+1 AS n FROM usage_bills WHERE dataset_id=? AND week_start=?',
        )
        .get(dataset, start)?.n,
    );
    const r = db
      .prepare(
        'INSERT INTO usage_bills(dataset_id,week_start,revision,previous_id,hash,snapshot,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(dataset, start, revision, previous, usageHash(result), JSON.stringify(result), now.toISOString());
    return readBill(db, Number(r.lastInsertRowid));
  });
}
export function readBill(db: Database, id: number) {
  const r = db.prepare('SELECT * FROM usage_bills WHERE id=?').get(id);
  requireUsage(r, 'usage_not_found');
  return {
    id: Number(r.id),
    revision: Number(r.revision),
    previous_id: r.previous_id as number | null,
    created_at: r.created_at as string,
    hash: r.hash as string,
    bill: JSON.parse(r.snapshot as string) as WeeklyBill,
  };
}
export function listBills(db: Database, dataset: string, start: string) {
  weekEnd(start);
  return db
    .prepare(
      'SELECT id,revision,previous_id,created_at,hash FROM usage_bills WHERE dataset_id=? AND week_start=? ORDER BY revision DESC',
    )
    .all(dataset, start);
}
