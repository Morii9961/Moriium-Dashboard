import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Snapshot } from '@moriium-dashboard/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { itemStates, reviewItems, stateKey } from '../src/items.ts';
import type { AcceptanceRecord } from '../src/review.ts';
import { stageEntry } from '../src/review.ts';
import { readZip } from '../src/zip.ts';

let dir: string;
let db: Database;
let app: ReturnType<typeof createApp>;
const host = '127.0.0.1:5180';
const origin = `http://${host}`;
const headers = { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' };
const base = JSON.parse(
  readFileSync(join(REPO_ROOT, 'fixtures', 'protocol', 'history', 't1-base.json'), 'utf8'),
);
const now = new Date('2026-10-13T00:00:00Z');
const request = async (path: string, method: string, body?: unknown) => {
  const res = await app.request(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return {
    status: res.status,
    body: (await res.json()) as {
      results: { snapshotId: number }[];
      record: AcceptanceRecord;
      project: { acceptances: AcceptanceRecord[]; current: { snapshot: Snapshot } };
    },
  };
};
async function importSnapshot(s = base) {
  const r = await request('/api/imports', 'POST', {
    files: [{ name: 'demo.json', base64: Buffer.from(JSON.stringify(s)).toString('base64') }],
  });
  return r.body.results[0]?.snapshotId as number;
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-review-'));
  db = openDatabase(join(dir, 'test.sqlite'));
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES('demo.beta','Demo','x','x')").run();
  app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'backups') },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('acceptance records', () => {
  it('persists judgment separately, binds source, survives a contradictory new report and exports', async () => {
    const snapshotId = await importSnapshot();
    const r = await request('/api/acceptance/demo.beta/core', 'PUT', {
      snapshotId,
      status: 'rejected',
      note: '请补测试记录',
    });
    expect(r.status).toBe(200);
    expect(r.body.record).toMatchObject({ snapshotId, status: 'rejected', note: '请补测试记录' });
    const next = structuredClone(base);
    next.snapshot_at = '2026-10-12T10:00:00+08:00';
    next.milestones[0].human_acceptance = 'accepted';
    await importSnapshot(next);
    const p = (await request('/api/projects/demo.beta', 'GET')).body.project;
    expect(p.acceptances[0]).toMatchObject({ snapshotId, status: 'rejected' });
    expect(p.current.snapshot.milestones[0]?.human_acceptance).toBe('accepted');
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='acceptance.save'").get(),
    ).toMatchObject({ n: 1 });
    const zip = await app.request('/api/export', { headers: { host } });
    const data = JSON.parse(
      new TextDecoder().decode(
        readZip(new Uint8Array(await zip.arrayBuffer())).find((f) => f.name === 'data.json')?.data,
      ),
    );
    expect(data.acceptances[0]).toMatchObject({ status: 'rejected', snapshotId });
  });
  it('rejects stale snapshot, missing milestone, unfinished acceptance and suspected secrets without writes', async () => {
    const snapshotId = await importSnapshot();
    expect(
      (
        await request('/api/acceptance/demo.beta/core', 'PUT', {
          snapshotId: snapshotId + 1,
          status: 'accepted',
        })
      ).status,
    ).toBe(409);
    expect(
      (await request('/api/acceptance/demo.beta/missing', 'PUT', { snapshotId, status: 'accepted' })).status,
    ).toBe(404);
    expect(
      (await request('/api/acceptance/demo.beta/sync', 'PUT', { snapshotId, status: 'accepted' })).status,
    ).toBe(400);
    const secret = ['ghp_', 'a'.repeat(40)].join('');
    const r = await request('/api/acceptance/demo.beta/core', 'PUT', {
      snapshotId,
      status: 'accepted',
      note: secret,
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(secret);
    expect(db.prepare('SELECT COUNT(*) AS n FROM acceptance_records').get()).toMatchObject({ n: 0 });
  });
  it('keeps PUT protected by Origin and the custom write header', async () => {
    const snapshotId = await importSnapshot();
    const r = await app.request('/api/acceptance/demo.beta/core', {
      method: 'PUT',
      headers: { host, 'content-type': 'application/json' },
      body: JSON.stringify({ snapshotId, status: 'accepted' }),
    });
    expect(r.status).toBe(403);
  });
});

it('stage entry follows contiguous effective history and handles deleted snapshots', async () => {
  const first = await importSnapshot();
  const next = structuredClone(base);
  next.snapshot_at = '2026-10-06T10:00:00+08:00';
  next.stage = 'development';
  await importSnapshot(next);
  next.snapshot_at = '2026-10-07T10:00:00+08:00';
  next.stage = 'integration';
  const entry = await importSnapshot(next);
  next.snapshot_at = '2026-10-08T10:00:00+08:00';
  await importSnapshot(next);
  expect(stageEntry(db, 'demo.beta')?.snapshotAt).toBe('2026-10-07T10:00:00+08:00');
  db.prepare('UPDATE status_snapshots SET deleted_at=? WHERE id<>?').run('x', first);
  expect(stageEntry(db, 'demo.beta')?.onlySnapshot).toBe(true);
  expect(entry).toBeGreaterThan(first);
});

describe('cross-snapshot item states', () => {
  it('matches stable IDs despite changed wording, retains conclusions and groups vanished items', async () => {
    const snapshotId = await importSnapshot();
    const key = stateKey(base.needs_morii[0], base.needs_morii[0].decision);
    const path = `/api/items/demo.beta/needs_morii/${encodeURIComponent(key)}`;
    expect(
      (await request(path, 'PUT', { snapshotId, status: 'decided', conclusion: '选第一组' })).status,
    ).toBe(200);
    const next = structuredClone(base);
    next.snapshot_at = '2026-10-12T10:00:00+08:00';
    next.needs_morii[0].decision = '是否仍使用第一组图？';
    await importSnapshot(next);
    expect(reviewItems(db, 'demo.beta', now).find((i) => i.key === key)).toMatchObject({
      pending: false,
      repeated: true,
      text: '是否仍使用第一组图？',
      state: { conclusion: '选第一组' },
    });
    next.snapshot_at = '2026-10-13T00:00:00Z';
    next.needs_morii = [];
    await importSnapshot(next);
    expect(reviewItems(db, 'demo.beta', now).find((i) => i.key === key)).toMatchObject({
      gone: true,
      pending: false,
    });
    expect(itemStates(db)).toHaveLength(1);
  });
  it('hashes normalized ID-less text, while changed wording becomes a new item', async () => {
    const s = structuredClone(base);
    s.needs_morii = [{ decision: '  Ａ  素材？  ' }];
    const snapshotId = await importSnapshot(s);
    const key = stateKey({}, 'A 素材?');
    expect(key).toMatch(/^text:[a-f0-9]{64}$/);
    expect(
      (
        await request(`/api/items/demo.beta/needs_morii/${encodeURIComponent(key)}`, 'PUT', {
          snapshotId,
          status: 'not_applicable',
        })
      ).status,
    ).toBe(200);
    s.snapshot_at = '2026-10-12T10:00:00+08:00';
    s.needs_morii = [{ decision: 'A 素材?' }];
    await importSnapshot(s);
    expect(reviewItems(db, 'demo.beta', now).filter((i) => !i.gone)[0]).toMatchObject({ pending: false });
    s.snapshot_at = '2026-10-13T00:00:00Z';
    s.needs_morii = [{ decision: 'B 素材?' }];
    await importSnapshot(s);
    expect(reviewItems(db, 'demo.beta', now).filter((i) => !i.gone)[0]).toMatchObject({
      pending: true,
      state: null,
    });
  });
  it('makes later items pending on the Shanghai due date and validates transitions', async () => {
    const snapshotId = await importSnapshot();
    const key = stateKey(base.needs_morii[0], base.needs_morii[0].decision);
    const path = `/api/items/demo.beta/needs_morii/${encodeURIComponent(key)}`;
    expect((await request(path, 'PUT', { snapshotId, status: 'later', dueDate: '2026-02-30' })).status).toBe(
      400,
    );
    expect((await request(path, 'PUT', { snapshotId, status: 'decided', conclusion: '' })).status).toBe(400);
    expect((await request(path, 'PUT', { snapshotId, status: 'acknowledged' })).status).toBe(400);
    expect((await request(path, 'PUT', { snapshotId: snapshotId + 1, status: 'open' })).status).toBe(409);
    expect((await request(path, 'PUT', { snapshotId, status: 'later', dueDate: '2026-10-13' })).status).toBe(
      200,
    );
    expect(
      reviewItems(db, 'demo.beta', new Date('2026-10-12T15:59:59Z')).find((i) => i.key === key)?.pending,
    ).toBe(false);
    expect(
      reviewItems(db, 'demo.beta', new Date('2026-10-12T16:00:00Z')).find((i) => i.key === key)?.pending,
    ).toBe(true);
    const blocker = stateKey(base.blockers[0], base.blockers[0].title);
    expect(
      (
        await request(`/api/items/demo.beta/blockers/${encodeURIComponent(blocker)}`, 'PUT', {
          snapshotId,
          status: 'acknowledged',
        })
      ).status,
    ).toBe(200);
    expect(reviewItems(db, 'demo.beta', now).find((i) => i.kind === 'blockers')).toMatchObject({
      pending: false,
      state: { status: 'acknowledged' },
    });
  });
});
