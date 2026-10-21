import type { UsageSnapshot } from '@moriium-dashboard/protocol/usage';
import type { Database } from '../db.ts';
import { calculateWeek, type WeeklyBill } from './bills.ts';
import { calculateWeekV1 } from './calculator-v1.ts';
import { exactKeys, requireUsage } from './pricing.ts';
import { type DaySelection, safeSnapshot, savePricing, usageHash } from './store.ts';
export function exportUsage(db: Database) {
  const records = (table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  return {
    version: 1,
    imports: records('usage_imports'),
    selections: records('usage_selections'),
    catalogs: records('price_catalog_versions'),
    fx: records('fx_snapshots'),
    bills: records('usage_bills'),
  };
}
const records = (v: unknown) => {
  requireUsage(Array.isArray(v) && v.length <= 100000);
  return v;
};
const stamp = (v: unknown) =>
  requireUsage(
    typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString() === v,
  );
const positiveId = (v: unknown) => requireUsage(Number.isSafeInteger(v) && Number(v) > 0);
/** Rebuild derived rows, replay audited selections and recompute every frozen bill against its own inputs. */
export function restoreUsage(db: Database, value: unknown) {
  exactKeys(value, ['version', 'imports', 'selections', 'catalogs', 'fx', 'bills']);
  requireUsage(value.version === 1);
  for (const [key, kind, field] of [
    ['catalogs', 'catalog', 'catalog'],
    ['fx', 'fx', 'snapshot'],
  ] as const) {
    for (const r of records(value[key])) {
      exactKeys(r, ['id', 'hash', field]);
      requireUsage(typeof r[field] === 'string');
      const parsed = JSON.parse(r[field] as string);
      requireUsage(parsed.id === r.id && usageHash(parsed) === r.hash);
      const result = savePricing(db, kind, parsed);
      requireUsage(!result.duplicate);
    }
  }
  const snapshots = new Map<string, UsageSnapshot>();
  for (const r of records(value.imports)) {
    exactKeys(r, ['hash', 'dataset_id', 'revision', 'source', 'snapshot', 'imported_at']);
    stamp(r.imported_at);
    requireUsage(typeof r.snapshot === 'string');
    const s = safeSnapshot(JSON.parse(r.snapshot));
    requireUsage(
      usageHash(s) === r.hash &&
        s.dataset_id === r.dataset_id &&
        s.revision === r.revision &&
        s.source === r.source &&
        !snapshots.has(r.hash as string),
    );
    requireUsage(
      [...snapshots.values()].every(
        (other) => other.dataset_id !== s.dataset_id || other.source === s.source,
      ),
    );
    db.prepare('INSERT INTO usage_imports VALUES(?,?,?,?,?,?)').run(
      r.hash as string,
      s.dataset_id,
      s.revision,
      s.source,
      JSON.stringify(s),
      r.imported_at as string,
    );
    const insert = db.prepare('INSERT INTO usage_daily_rows VALUES(?,?,?,?)');
    s.rows.forEach((row, i) => {
      insert.run(r.hash as string, i, row.date, JSON.stringify(row));
    });
    snapshots.set(r.hash as string, s);
  }
  const current = new Map<string, DaySelection>(),
    byId = new Map<number, DaySelection>();
  const importedDays = new Set<string>();
  let lastId = 0;
  for (const entry of records(value.selections)) {
    exactKeys(entry, ['id', 'dataset_id', 'date', 'import_hash', 'previous_hash', 'action', 'at']);
    const r = entry as unknown as DaySelection;
    positiveId(r.id);
    stamp(r.at);
    requireUsage(r.id > lastId && ['import', 'select', 'undo'].includes(r.action));
    lastId = r.id;
    const key = `${r.dataset_id}/${r.date}`,
      old = current.get(key);
    requireUsage(r.previous_hash === (old?.import_hash ?? null));
    if (r.action === 'undo') requireUsage(old?.action === 'import' && r.import_hash === old.previous_hash);
    if (r.action === 'import') {
      const key = `${r.import_hash}/${r.date}`;
      requireUsage(
        !importedDays.has(key) &&
          db.prepare('SELECT imported_at FROM usage_imports WHERE hash=?').get(r.import_hash)?.imported_at ===
            r.at,
      );
      importedDays.add(key);
    }
    const s = r.import_hash ? snapshots.get(r.import_hash) : null;
    requireUsage(
      (r.import_hash === null && r.action === 'undo') ||
        (s && s.dataset_id === r.dataset_id && s.days.some((d) => d.date === r.date)),
    );
    db.prepare('INSERT INTO usage_selections VALUES(?,?,?,?,?,?,?)').run(
      r.id,
      r.dataset_id,
      r.date,
      r.import_hash,
      r.previous_hash,
      r.action,
      r.at,
    );
    current.set(key, r);
    byId.set(r.id, r);
  }
  for (const [hash, snapshot] of snapshots)
    for (const day of snapshot.days) requireUsage(importedDays.has(`${hash}/${day.date}`));
  const revisions = new Map<string, number>();
  for (const r of records(value.bills)) {
    exactKeys(r, [
      'id',
      'dataset_id',
      'week_start',
      'revision',
      'previous_id',
      'hash',
      'snapshot',
      'created_at',
    ]);
    positiveId(r.id);
    stamp(r.created_at);
    requireUsage(typeof r.snapshot === 'string');
    const b = JSON.parse(r.snapshot) as WeeklyBill;
    requireUsage(
      b.dataset_id === r.dataset_id && b.week_start === r.week_start && Array.isArray(b.selections),
    );
    for (const s of b.selections) requireUsage(usageHash(s) === usageHash(byId.get(s.id) ?? null));
    requireUsage(new Set(b.selections.map((s) => s.date)).size === b.selections.length);
    requireUsage(['usage-fixed-v1', 'usage-fixed-v2'].includes(b.calculator_version));
    const calculated =
      b.calculator_version === 'usage-fixed-v1'
        ? calculateWeekV1(
            db,
            b.dataset_id,
            b.week_start,
            b.catalog?.id ?? null,
            b.fx?.id ?? null,
            b.mode,
            b.selections,
          )
        : calculateWeek(
            db,
            b.dataset_id,
            b.week_start,
            b.catalog?.id ?? null,
            b.fx?.id ?? null,
            b.mode,
            b.selections,
            b.dataset_observations?.import_hash ?? null,
          );
    requireUsage(usageHash(calculated) === r.hash && usageHash(b) === r.hash, 'usage_bill_integrity');
    const key = `${r.dataset_id}/${r.week_start}`,
      revision = (revisions.get(key) ?? 0) + 1;
    requireUsage(r.revision === revision);
    revisions.set(key, revision);
    if (r.previous_id !== null)
      requireUsage(
        db
          .prepare('SELECT 1 FROM usage_bills WHERE id=? AND dataset_id=? AND week_start=?')
          .get(r.previous_id as number, r.dataset_id as string, r.week_start as string),
      );
    db.prepare('INSERT INTO usage_bills VALUES(?,?,?,?,?,?,?,?)').run(
      r.id as number,
      r.dataset_id as string,
      r.week_start as string,
      revision,
      r.previous_id as number | null,
      r.hash as string,
      r.snapshot,
      r.created_at as string,
    );
  }
  return { usageImports: snapshots.size, usageBills: records(value.bills).length };
}
