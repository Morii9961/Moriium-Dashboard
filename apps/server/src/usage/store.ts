import { createHash } from 'node:crypto';
import { canonicalize, scanSecrets } from '@moriium-dashboard/protocol';
import { checkUsage, type UsageSnapshot } from '@moriium-dashboard/protocol/usage';
import { type Database, transaction } from '../db.ts';
import { requireUsage, validateCatalog, validateFx } from './pricing.ts';
export const usageHash = (v: unknown) => createHash('sha256').update(canonicalize(v)).digest('hex');
export function safeSnapshot(value: unknown): UsageSnapshot {
  const result = checkUsage(value);
  requireUsage(result.ok, 'usage_schema');
  requireUsage(scanSecrets(JSON.stringify(value)).length === 0, 'usage_schema');
  return result.snapshot;
}
export interface ImportRecord {
  hash: string;
  dataset_id: string;
  revision: string;
  source: string;
  snapshot: string;
  imported_at: string;
}
export interface DaySelection {
  id: number;
  dataset_id: string;
  date: string;
  import_hash: string | null;
  previous_hash: string | null;
  action: string;
  at: string;
}
export function currentUsageDays(db: Database, dataset: string): DaySelection[] {
  return db
    .prepare('SELECT * FROM usage_resolved_days WHERE dataset_id=? ORDER BY date')
    .all(dataset) as unknown as DaySelection[];
}
export function getUsageImport(db: Database, hash: string): ImportRecord {
  const r = db.prepare('SELECT * FROM usage_imports WHERE hash=?').get(hash) as unknown as
    | ImportRecord
    | undefined;
  requireUsage(r, 'usage_not_found');
  return r;
}
export function previewUsage(db: Database, value: unknown) {
  const s = safeSnapshot(value),
    hash = usageHash(s),
    days = currentUsageDays(db, s.dataset_id);
  const duplicate = db.prepare('SELECT 1 FROM usage_imports WHERE hash=?').get(hash) !== undefined;
  const collision = db
    .prepare('SELECT hash FROM usage_imports WHERE dataset_id=? AND revision=?')
    .get(s.dataset_id, s.revision);
  requireUsage(!collision || collision.hash === hash, 'usage_revision_conflict');
  const other = db.prepare('SELECT source FROM usage_imports WHERE dataset_id=? LIMIT 1').get(s.dataset_id);
  requireUsage(!other || other.source === s.source, 'usage_source_conflict');
  const overlaps = days.filter(
    (d) => d.import_hash && d.date >= s.range.start && d.date < s.range.end_exclusive,
  );
  const totalFor = (snapshot: UsageSnapshot, date: string): string | null => {
    if (snapshot.days.find((d) => d.date === date)?.state !== 'complete') return null;
    let total = 0n;
    for (const row of snapshot.rows.filter((r) => r.date === date)) {
      if (
        row.time_basis === 'provider_day' ||
        row.counts.input_total === null ||
        row.counts.output_total === null
      )
        return null;
      total += BigInt(row.counts.input_total) + BigInt(row.counts.output_total);
    }
    return total.toString();
  };
  const daily_totals = s.days.map((d) => {
    const old = overlaps.find((o) => o.date === d.date);
    return {
      date: d.date,
      new_tokens: totalFor(s, d.date),
      previous_tokens: old?.import_hash
        ? totalFor(JSON.parse(getUsageImport(db, old.import_hash).snapshot) as UsageSnapshot, d.date)
        : null,
    };
  });
  return {
    daily_totals,
    hash,
    duplicate,
    expected_state: usageHash(days),
    conflicts: overlaps.map((d) => ({ date: d.date, hash: d.import_hash })),
    range: s.range,
    source: s.source,
    rows: s.rows.length,
    days: s.days,
  };
}
export function importUsage(db: Database, value: unknown, expected: unknown, replace: unknown, now: Date) {
  return transaction(db, () => {
    const p = previewUsage(db, value);
    // A repeated hash never changes selections, history or receipts, even following undo.
    if (p.duplicate) return { ...p, outcome: 'duplicate' };
    requireUsage(expected === p.expected_state, 'usage_changed');
    requireUsage(!p.conflicts.length || replace === true, 'usage_review_required');
    const s = safeSnapshot(value);
    db.prepare('INSERT INTO usage_imports VALUES(?,?,?,?,?,?)').run(
      p.hash,
      s.dataset_id,
      s.revision,
      s.source,
      JSON.stringify(s),
      now.toISOString(),
    );
    const insert = db.prepare('INSERT INTO usage_daily_rows VALUES(?,?,?,?)');
    s.rows.forEach((r, i) => {
      insert.run(p.hash, i, r.date, JSON.stringify(r));
    });
    const old = new Map(currentUsageDays(db, s.dataset_id).map((d) => [d.date, d.import_hash]));
    const select = db.prepare(
      'INSERT INTO usage_selections(dataset_id,date,import_hash,previous_hash,action,at) VALUES(?,?,?,?,?,?)',
    );
    for (const d of s.days)
      select.run(s.dataset_id, d.date, p.hash, old.get(d.date) ?? null, 'import', now.toISOString());
    return { ...p, outcome: 'imported' };
  });
}
/** Selecting an old revision is an explicit new audit event, never a mutation of imported facts. */
export function selectUsage(db: Database, hash: string, expected: unknown, undo: boolean, now: Date) {
  return transaction(db, () => {
    const record = getUsageImport(db, hash),
      s = JSON.parse(record.snapshot) as UsageSnapshot;
    const current = currentUsageDays(db, s.dataset_id);
    requireUsage(expected === usageHash(current), 'usage_changed');
    const insert = db.prepare(
      'INSERT INTO usage_selections(dataset_id,date,import_hash,previous_hash,action,at) VALUES(?,?,?,?,?,?)',
    );
    if (undo) {
      const changes = db
        .prepare("SELECT * FROM usage_selections WHERE import_hash=? AND action='import' ORDER BY id")
        .all(hash) as unknown as DaySelection[];
      requireUsage(
        changes.length > 0 && changes.every((d) => current.find((c) => c.date === d.date)?.id === d.id),
        'usage_changed',
      );
      for (const d of changes)
        insert.run(s.dataset_id, d.date, d.previous_hash, hash, 'undo', now.toISOString());
    } else
      for (const d of s.days)
        insert.run(
          s.dataset_id,
          d.date,
          hash,
          current.find((c) => c.date === d.date)?.import_hash ?? null,
          'select',
          now.toISOString(),
        );
    return { expected_state: usageHash(currentUsageDays(db, s.dataset_id)) };
  });
}
export function usageDatasets(db: Database) {
  const imports = db
    .prepare(
      "SELECT hash,dataset_id,revision,source,imported_at,json_extract(snapshot,'$.range') AS range_json FROM usage_imports ORDER BY imported_at DESC,hash",
    )
    .all() as unknown as (Omit<ImportRecord, 'snapshot'> & { range_json: string })[];
  return [...new Set(imports.map((i) => i.dataset_id))].map((id) => ({
    id,
    source: imports.find((i) => i.dataset_id === id)?.source,
    expected_state: usageHash(currentUsageDays(db, id)),
    imports: imports
      .filter((i) => i.dataset_id === id)
      .map(({ range_json, ...r }) => ({ ...r, range: JSON.parse(range_json) as UsageSnapshot['range'] })),
    selections: currentUsageDays(db, id),
    recent_selections: db
      .prepare('SELECT * FROM usage_selections WHERE dataset_id=? ORDER BY id DESC LIMIT 50')
      .all(id),
  }));
}
export function savePricing(db: Database, kind: 'catalog' | 'fx', value: unknown) {
  const validated = kind === 'catalog' ? validateCatalog(value) : validateFx(value),
    hash = usageHash(validated);
  requireUsage(scanSecrets(JSON.stringify(validated)).length === 0, 'usage_invalid');
  const table = kind === 'catalog' ? 'price_catalog_versions' : 'fx_snapshots';
  const existing = db.prepare(`SELECT hash FROM ${table} WHERE id=?`).get(validated.id);
  if (existing) {
    requireUsage(existing.hash === hash, 'usage_immutable');
    return { id: validated.id, duplicate: true };
  }
  db.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(validated.id, hash, JSON.stringify(validated));
  return { id: validated.id, duplicate: false };
}
export function usagePricing(db: Database) {
  return {
    catalogs: db
      .prepare('SELECT catalog FROM price_catalog_versions ORDER BY id')
      .all()
      .map((r) => JSON.parse(r.catalog as string)),
    fx: db
      .prepare('SELECT snapshot FROM fx_snapshots ORDER BY id')
      .all()
      .map((r) => JSON.parse(r.snapshot as string)),
  };
}
