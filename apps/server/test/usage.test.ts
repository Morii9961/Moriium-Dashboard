import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PriceCatalog, UsageSnapshot } from '@moriium-dashboard/protocol/usage';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { openAuthDatabase } from '../src/auth/store.ts';
import { createBackup } from '../src/backup.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll } from '../src/export.ts';
import { buildRestoredDatabase } from '../src/restore/build.ts';
import { calculateWeek, createBill, readBill } from '../src/usage/bills.ts';
import { nano, priceUsageRow, validateCatalog, validateFx } from '../src/usage/pricing.ts';
import {
  currentUsageDays,
  importUsage,
  previewUsage,
  savePricing,
  selectUsage,
  usageDatasets,
  usageHash,
} from '../src/usage/store.ts';
import { createZip, readZip } from '../src/zip.ts';
export const usageFixture = () =>
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/protocol/usage/fixtures/valid-week.json'), 'utf8'),
  ) as UsageSnapshot;
export function syntheticCatalog(id = 'synthetic-v1'): PriceCatalog {
  const catalog = JSON.parse(
    readFileSync(join(REPO_ROOT, 'fixtures/usage/catalog.synthetic.json'), 'utf8'),
  ) as PriceCatalog;
  return { ...catalog, id };
}

function fixtureRow(s: UsageSnapshot, index: number) {
  const row = s.rows[index];
  if (!row) throw new Error('fixture row missing');
  return row;
}
function fixtureRule(c: PriceCatalog, index: number) {
  const rule = c.rules[index];
  if (!rule) throw new Error('fixture rule missing');
  return rule;
}
const now = new Date('2026-11-03T01:00:00.000Z'),
  dataset = usageFixture().dataset_id;
const fx = {
  id: 'synthetic-fx',
  base: 'USD',
  quote: 'CNY',
  rate: '7.123456789',
  as_of: '2026-11-01',
  source: 'manual',
  source_url: null,
  kind: 'manual_assumption',
};
let db: Database;
const load = (s = usageFixture(), replace = false) =>
  importUsage(db, s, previewUsage(db, s).expected_state, replace, now);
const week = (catalog: string | null = 'synthetic-v1') =>
  calculateWeek(db, dataset, '2026-10-26', catalog, 'synthetic-fx', 'classified');
beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
  savePricing(db, 'catalog', syntheticCatalog());
  savePricing(db, 'fx', fx);
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});
it('a week without observations stays unknown; explicitly complete zero days stay zero', () => {
  const s = usageFixture();
  load(s);
  expect(
    calculateWeek(db, dataset, '2026-11-02', null, null, 'classified').totals.measured_tokens,
  ).toBeNull();
  s.revision = '2';
  s.rows = [];
  load(s, true);
  expect(week().totals.measured_tokens).toBe('0');
  s.revision = '3';
  s.days = s.days.map((d, i) => (i === 0 ? { ...d, state: 'partial' } : d));
  load(s, true);
  expect(week().days[0]?.tokens).toBeNull();
});
it('explicit repricing retains old source selections despite newer usage', () => {
  load();
  const first = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v1',
    'synthetic-fx',
    'classified',
    null,
    now,
  );
  const s = usageFixture();
  s.revision = '2';
  (s.rows[0] as NonNullable<(typeof s.rows)[0]>).counts.output_total = '999';
  load(s, true);
  const repriced = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v1',
    'synthetic-fx',
    'standard_short',
    first.id,
    now,
  );
  expect(repriced.bill.source_snapshot_hashes).toEqual(first.bill.source_snapshot_hashes);
  expect(repriced.bill.totals.measured_tokens).toEqual(first.bill.totals.measured_tokens);
});
it('online backup and reopening a synthetic disk database preserve Usage and frozen bills', async () => {
  load();
  const first = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v1',
    'synthetic-fx',
    'classified',
    null,
    now,
  );
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-usage-backup-'));
  try {
    const backup = await createBackup(db, dir, 'daily', now);
    const reopened = openDatabase(backup);
    try {
      expect(readBill(reopened, first.id)).toEqual(first);
      expect(usageDatasets(reopened)).toEqual(usageDatasets(db));
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
it('fast and regional requests require their own explicit rules, without inferred multipliers', () => {
  const row = structuredClone(usageFixture().rows[0]) as NonNullable<UsageSnapshot['rows'][0]>;
  row.service_tier = 'fast';
  const catalog = syntheticCatalog();
  expect(priceUsageRow(row, catalog, 'classified').reason).toBe('rule_missing');
  catalog.rules.push(
    ...catalog.rules
      .filter((r) => r.provider === 'openai' && r.context_class === 'short')
      .map((r) => ({ ...r, tier: 'fast' as const, usd_per_million: '3.123456789' })),
  );
  expect(
    priceUsageRow(row, validateCatalog(catalog), 'classified').items.every((i) => i.rate === '3.123456789'),
  ).toBe(true);
  row.region = 'us-east-1';
  expect(priceUsageRow(row, catalog, 'classified').reason).toBe('rule_missing');
});

it('preview writes nothing; importing repeated hash changes absolutely no receipt or selection', () => {
  const s = usageFixture(),
    p = previewUsage(db, s);
  expect(p.rows).toBe(8);
  expect(usageDatasets(db)).toEqual([]);
  load(s);
  const before = db.prepare('SELECT total_changes() AS n').get()?.n;
  expect(importUsage(db, s, 'stale', true, now).outcome).toBe('duplicate');
  expect(db.prepare('SELECT total_changes() AS n').get()?.n).toBe(before);
  expect(db.prepare('SELECT COUNT(*) AS n FROM status_snapshots').get()?.n).toBe(0);
});
it('overlap requires explicit review and optimistic state; smaller late revisions never add together', () => {
  const a = usageFixture();
  load(a);
  const old = week();
  const b = structuredClone(a);
  b.revision = '3';
  fixtureRow(b, 0).counts.output_total = '200';
  const p = previewUsage(db, b);
  expect(() => importUsage(db, b, p.expected_state, false, now)).toThrow('usage_review_required');
  expect(() => importUsage(db, b, 'changed', true, now)).toThrow('usage_changed');
  load(b, true);
  expect(BigInt(week().totals.measured_tokens as string) - BigInt(old.totals.measured_tokens as string)).toBe(
    100n,
  );
  const late = structuredClone(a);
  late.revision = '2';
  load(late, true);
  expect(week().totals).toEqual(old.totals);
  expect(db.prepare('SELECT COUNT(*) AS n FROM usage_imports').get()?.n).toBe(3);
});
it('same revision collision and dataset source changes are rejected', () => {
  const s = usageFixture();
  load(s);
  fixtureRow(s, 0).counts.output_total = '200';
  expect(() => load(s, true)).toThrow('usage_revision_conflict');
  s.revision = '2';
  s.source = 'codex_local';
  s.rows.forEach((r) => {
    r.provider = 'openai';
  });
  expect(() => load(s, true)).toThrow('usage_source_conflict');
});
it('undo is atomic, old selection restoration is audited, duplicate hash cannot reactivate an undone import', () => {
  const a = load(),
    s = usageFixture();
  s.revision = '2';
  fixtureRow(s, 0).counts.output_total = '200';
  const b = load(s, true);
  selectUsage(db, b.hash, usageHash(currentUsageDays(db, dataset)), true, now);
  expect(currentUsageDays(db, dataset).every((d) => d.import_hash === a.hash)).toBe(true);
  load(s, true);
  expect(currentUsageDays(db, dataset).every((d) => d.import_hash === a.hash)).toBe(true);
  selectUsage(db, b.hash, usageHash(currentUsageDays(db, dataset)), false, now);
  expect(currentUsageDays(db, dataset).every((d) => d.import_hash === b.hash)).toBe(true);
});
it('frozen bills survive late usage, new price/fx and explicit repricing produces a linked revision', () => {
  load();
  const first = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v1',
    'synthetic-fx',
    'classified',
    null,
    now,
  );
  const catalog = syntheticCatalog('synthetic-v2');
  catalog.rules.forEach((r) => {
    r.usd_per_million = '99.123456789';
  });
  savePricing(db, 'catalog', catalog);
  savePricing(db, 'fx', { ...fx, id: 'synthetic-fx2', rate: '8' });
  const next = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v2',
    'synthetic-fx2',
    'classified',
    first.id,
    now,
  );
  expect(next.revision).toBe(2);
  expect(next.previous_id).toBe(first.id);
  expect(next.bill.totals.usd).not.toBe(first.bill.totals.usd);
  expect(readBill(db, first.id)).toEqual(first);
  expect(() => savePricing(db, 'catalog', { ...catalog, id: 'synthetic-v1' })).toThrow('usage_immutable');
});
it('cache reads are exclusive and reasoning is never charged twice, effort does not multiply prices', () => {
  const r = fixtureRow(usageFixture(), 0),
    catalog = syntheticCatalog();
  const p = priceUsageRow(r, catalog, 'classified');
  expect(p.usd_numerator).toBe('1480000000000');
  expect(p.items.map((i) => i.category)).toEqual(['input_uncached', 'input_cache_read', 'output_total']);
  r.effort = 'xhigh';
  r.counts.output_reasoning_subset = '99';
  expect(priceUsageRow(r, catalog, 'classified')).toEqual(p);
});
it('5m/1h/30m cache writes use independent rules; unknown write duration never inherits one', () => {
  const r = fixtureRow(usageFixture(), 7),
    p = priceUsageRow(r, syntheticCatalog(), 'classified');
  expect(p.items.find((i) => i.category === 'input_cache_write_5m')?.usd).toBe('0.000500000000000');
  expect(p.items.find((i) => i.category === 'input_cache_write_1h')?.usd).toBe('0.001600000000000');
  r.counts.input_cache_write_30m = '1';
  r.counts.input_total = '1301';
  expect(
    priceUsageRow(r, syntheticCatalog(), 'classified').items.find(
      (i) => i.category === 'input_cache_write_30m',
    )?.rate,
  ).toBe('2');
  const cat = syntheticCatalog();
  cat.rules = cat.rules.filter((rule) => rule.category !== 'input_cache_write_unknown');
  r.counts.input_cache_write_unknown = '1';
  r.counts.input_total = '1302';
  expect(priceUsageRow(r, cat, 'classified').reason).toBe('rule_missing');
});
it('long context is request classified; total week volume never determines context prices', () => {
  const row = fixtureRow(usageFixture(), 2),
    cat = syntheticCatalog();
  const p = priceUsageRow(row, cat, 'classified');
  expect(p.items.find((i) => i.category === 'input_uncached')?.rate).toBe('4');
  row.context_class = 'short';
  expect(priceUsageRow(row, cat, 'classified').items.find((i) => i.category === 'input_uncached')?.rate).toBe(
    '2',
  );
});
it('unknown conditions require opt-in assumptions, unknown counts/model remain unpriced rather than zero', () => {
  const s = usageFixture(),
    cat = syntheticCatalog();
  expect(priceUsageRow(fixtureRow(s, 3), cat, 'classified').reason).toBe('conditions_unknown');
  expect(priceUsageRow(fixtureRow(s, 3), cat, 'standard_short').assumptions).toEqual([
    'assumed_standard_short',
  ]);
  expect(priceUsageRow(fixtureRow(s, 5), cat, 'standard_short').usd_numerator).toBeNull();
  expect(priceUsageRow(fixtureRow(s, 6), cat, 'classified').reason).toBe('rule_missing');
  load();
  expect(week(null).totals.usd).toBeNull();
  expect(calculateWeek(db, dataset, '2026-10-26', 'synthetic-v1', null, 'classified').totals.cny).toBeNull();
});
it('rates are exact to nano USD/M and extreme integer strings never cross Number', () => {
  const r = fixtureRow(usageFixture(), 4),
    cat = syntheticCatalog();
  const p = priceUsageRow(r, cat, 'classified');
  expect(p.usd_numerator).toBe(
    (9007199254741199n * 2000000000n + 800n * 100000000n + 100n * 10000000000n).toString(),
  );
  load();
  const b = week();
  const usd = BigInt((b.totals.usd as string).replace('.', ''));
  expect(b.totals.cny).toBe(
    `${(usd * nano(fx.rate)).toString().padStart(25, '0').slice(0, -24)}.${(usd * nano(fx.rate)).toString().padStart(25, '0').slice(-24)}`,
  );
});
it.each(['-1', '1e3', '0.1234567891', '01', 'NaN'])('rejects invalid rate %s', (rate) =>
  expect(() => validateFx({ ...fx, rate })).toThrow(),
);
it('rejects currency mismatch, invalid dates, ambiguous rules and nonofficial pricing URLs', () => {
  expect(() => validateFx({ ...fx, base: 'EUR' })).toThrow();
  expect(() => validateFx({ ...fx, as_of: '2026-02-30' })).toThrow();
  const c = syntheticCatalog();
  c.rules.push(fixtureRule(c, 0));
  expect(() => validateCatalog(c)).toThrow('usage_ambiguous_price');
  c.rules.pop();
  fixtureRule(c, 0).official_source = 'https://example.com/pricing';
  expect(() => validateCatalog(c)).toThrow();
});
it('Shanghai Monday boundary includes a cross-month week and excludes next Monday', () => {
  load();
  expect(week().days.map((d) => d.date)).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  expect(calculateWeek(db, dataset, '2026-11-02', null, null, 'classified').rows).toEqual([]);
  expect(() => calculateWeek(db, dataset, '2026-11-01', null, null, 'classified')).toThrow('usage_week');
});
it('different observation sources are separate datasets; unprojectable account days never enter Shanghai totals', () => {
  load();
  const s = usageFixture();
  s.dataset_id = 'f7a1064a-bdb0-4ea2-9f1d-346d810ab16c';
  s.source = 'account_daily';
  s.source_timezone = 'provider_defined';
  s.rows.forEach((r) => {
    r.time_basis = 'provider_day';
  });
  load(s);
  const b = calculateWeek(db, s.dataset_id, '2026-10-26', 'synthetic-v1', null, 'classified');
  expect(b.totals.measured_tokens).toBeNull();
  expect(b.totals.has_unknown_totals).toBe(true);
  expect(b.rows.every((r) => r.reason === 'time_not_projectable')).toBe(true);
  expect(usageDatasets(db)).toHaveLength(2);
});
it('interrupted SQLite import rolls back receipt, daily rows and all selections; retry recovers', () => {
  db.exec(
    "CREATE TRIGGER synthetic_interrupt BEFORE INSERT ON usage_selections BEGIN SELECT RAISE(ABORT,'synthetic interruption'); END",
  );
  expect(() => load()).toThrow('synthetic interruption');
  expect(usageDatasets(db)).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) AS n FROM usage_daily_rows').get()?.n).toBe(0);
  db.exec('DROP TRIGGER synthetic_interrupt');
  expect(load().outcome).toBe('imported');
});
it('full export/restore retains frozen bills, pricing, imports and selection history, rejects tampered bill', async () => {
  const a = load();
  const first = createBill(
    db,
    dataset,
    '2026-10-26',
    'synthetic-v1',
    'synthetic-fx',
    'classified',
    null,
    now,
  );
  const s = usageFixture();
  s.revision = '2';
  fixtureRow(s, 0).counts.output_total = '200';
  load(s, true);
  selectUsage(db, a.hash, usageHash(currentUsageDays(db, dataset)), false, now);
  const bytes = exportAll(db, now, 'synthetic');
  const restored = await buildRestoredDatabase(bytes, now);
  try {
    expect(readBill(restored.db, first.id)).toEqual(first);
    expect(currentUsageDays(restored.db, dataset)).toEqual(currentUsageDays(db, dataset));
    expect(week().totals).toEqual(
      calculateWeek(restored.db, dataset, '2026-10-26', 'synthetic-v1', 'synthetic-fx', 'classified').totals,
    );
  } finally {
    restored.db.close();
  }
  const tampered = createZip(
    readZip(bytes).map((e) => {
      if (e.name !== 'usage.json') return e;
      const v = JSON.parse(Buffer.from(e.data).toString());
      const b = JSON.parse(v.bills[0].snapshot);
      b.totals.usd = '0';
      v.bills[0].snapshot = JSON.stringify(b);
      return { ...e, data: Buffer.from(JSON.stringify(v)) };
    }),
    now,
  );
  await expect(buildRestoredDatabase(tampered, now)).rejects.toThrow();
});
it('restores format 1 as an empty Usage domain and rejects future export versions', async () => {
  const entries = readZip(exportAll(db, now, 'synthetic'))
    .filter((e) => e.name !== 'usage.json')
    .map((e) => {
      if (e.name !== 'manifest.json') return e;
      const v = JSON.parse(Buffer.from(e.data).toString());
      v.exportFormat = 1;
      delete v.counts.usageImports;
      delete v.counts.usageBills;
      return { ...e, data: Buffer.from(JSON.stringify(v)) };
    });
  const legacy = await buildRestoredDatabase(createZip(entries, now), now);
  expect(usageDatasets(legacy.db)).toEqual([]);
  legacy.db.close();
  const future = createZip(
    entries.map((e) =>
      e.name === 'manifest.json'
        ? {
            ...e,
            data: Buffer.from(
              Buffer.from(e.data).toString().replace('"exportFormat":1', '"exportFormat":99'),
            ),
          }
        : e,
    ),
    now,
  );
  await expect(buildRestoredDatabase(future, now)).rejects.toThrow('export_version');
});

it('HTTP APIs inherit Host/Origin/CSRF/session security and reject private payloads without echo/logging', async () => {
  const config = {
    allowedHosts: ['127.0.0.1:5180'],
    allowedOrigins: ['http://127.0.0.1:5180'],
    backupDir: '.',
  };
  const app = createApp({ db, config, startedAt: now, version: 'test', now: () => now });
  const headers = {
    host: '127.0.0.1:5180',
    origin: 'http://127.0.0.1:5180',
    'x-moriium-dashboard': '1',
    'content-type': 'application/json',
  };
  expect((await app.request('/api/usage/datasets', { headers: { host: 'untrusted.example' } })).status).toBe(
    421,
  );
  expect(
    (
      await app.request('/api/usage/imports/preview', {
        method: 'POST',
        headers: { host: headers.host },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const snapshot of [
    { ...usageFixture(), private_content: 'synthetic-private-marker' },
    null,
    { ...usageFixture(), rows: [{ ...usageFixture().rows[0], model: `sk-${'A'.repeat(32)}` }] },
  ]) {
    const res = await app.request('/api/usage/imports/preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ snapshot }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('{"error":"usage_schema"}');
  }
  expect(errors).not.toHaveBeenCalled();
  const p = (await (
    await app.request('/api/usage/imports/preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ snapshot: usageFixture() }),
    })
  ).json()) as { expected_state: string };
  const res = await app.request('/api/usage/imports', {
    method: 'POST',
    headers,
    body: JSON.stringify({ snapshot: usageFixture(), expected_state: p.expected_state, replace: false }),
  });
  expect(res.status).toBe(200);
  expect(
    (await app.request(`/api/usage/weeks/2026-10-26?dataset=${dataset}`, { headers: { host: headers.host } }))
      .status,
  ).toBe(200);
  const authDb = openAuthDatabase(':memory:');
  try {
    const secured = createApp({
      db,
      config,
      startedAt: now,
      version: 'test',
      auth: { db: authDb, trustProxy: false },
    });
    for (const path of [
      '/api/usage/datasets',
      '/api/usage/pricing',
      '/api/usage/weeks/2026-10-26',
      '/api/usage/bills',
      '/api/usage/bills/1',
    ])
      expect((await secured.request(path, { headers: { host: headers.host } })).status).toBe(401);
    expect(
      (await secured.request('/api/usage/imports', { method: 'POST', headers, body: '{}' })).status,
    ).toBe(401);
  } finally {
    authDb.close();
  }
});
