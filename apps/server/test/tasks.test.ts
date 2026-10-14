import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll } from '../src/export.ts';
import { readFocus, saveFocus } from '../src/focus.ts';
import { getTask, saveTask, taskRecords } from '../src/tasks.ts';
import { readZip } from '../src/zip.ts';

let db: Database;
const now = new Date('2026-10-14T00:00:00Z');
const base = JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures/protocol/history/t1-base.json'), 'utf8'));
beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
  db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES('demo.beta','Demo','x','x')").run();
});
afterEach(() => db.close());
async function addSnapshot(s = base) {
  const host = '127.0.0.1:5180';
  const app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [`http://${host}`], backupDir: '.' },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
  const r = await app.request('/api/imports', {
    method: 'POST',
    headers: {
      host,
      origin: `http://${host}`,
      'x-moriium-dashboard': '1',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ name: 'demo.json', base64: Buffer.from(JSON.stringify(s)).toString('base64') }],
    }),
  });
  const data = (await r.json()) as { results: { snapshotId: number; outcome: string }[] };
  expect(data.results[0]?.outcome).toBe('imported');
  return data.results[0]?.snapshotId as number;
}
it('copies a source action on the server, deduplicates open tasks, and keeps source immutable', async () => {
  const snapshotId = await addSnapshot();
  const task = saveTask(
    db,
    null,
    { projectId: 'demo.beta', sourceSnapshotId: snapshotId, actionIndex: 0, title: 'spoofed' },
    now,
  )!;
  expect(task.title).toBe(base.next_actions[0].title);
  expect(task.sourceSnapshotId).toBe(snapshotId);
  expect(() =>
    saveTask(db, null, { projectId: 'demo.beta', sourceSnapshotId: snapshotId, actionIndex: 0 }, now),
  ).toThrow('exists');
  expect(() =>
    saveTask(db, task.id, { revision: task.revision, sourceSnapshotId: snapshotId + 1 }, now),
  ).toThrow('invalid_field');
  expect(() =>
    saveTask(db, null, { projectId: 'demo.beta', sourceSnapshotId: snapshotId + 1, actionIndex: 0 }, now),
  ).toThrow('snapshot_changed');
});
it('marks disappeared actions without automatically closing tasks', async () => {
  const snapshotId = await addSnapshot();
  const task = saveTask(
    db,
    null,
    { projectId: 'demo.beta', sourceSnapshotId: snapshotId, actionIndex: 0 },
    now,
  )!;
  const next = structuredClone(base);
  next.snapshot_at = '2026-10-13T10:00:00+08:00';
  next.next_actions = [];
  await addSnapshot(next);
  expect(getTask(db, task.id)).toMatchObject({ status: 'todo', sourceSnapshotId: snapshotId, gone: true });
});
it('keeps manual changes, stale write protection, valid dates and completion timestamps', () => {
  const task = saveTask(db, null, { title: '演示任务', lang: 'ja', dueDate: '2026-10-16' }, now);
  const done = saveTask(db, task.id, { revision: task.revision, status: 'done' }, now);
  expect(done.completedAt).toBe(now.toISOString());
  expect(() => saveTask(db, task.id, { revision: task.revision, title: '旧窗口' }, now)).toThrow(
    'task_changed',
  );
  expect(() => saveTask(db, task.id, { revision: done.revision, dueDate: '2026-02-30' }, now)).toThrow(
    'invalid_field',
  );
  expect(saveTask(db, task.id, { revision: done.revision, status: 'doing' }, now)?.completedAt).toBeNull();
  expect(() => saveTask(db, null, { title: ['ghp_', 'a'.repeat(40)].join(''), lang: 'en' }, now)).toThrow(
    'suspected_secret',
  );
});
it('focus references use current task title and completion, survive unrelated focus saves, and export', () => {
  const task = saveTask(db, null, { title: '演示任务', lang: 'en' }, now);
  const focus = saveFocus(
    db,
    '2026-10-14',
    {
      revision: 0,
      energy: 'normal',
      entries: [{ id: 'demo', title: 'fake', lang: 'ja', done: false, taskId: task.id }],
    },
    now,
  );
  expect(focus.entries[0]).toMatchObject({ title: '演示任务', lang: 'en', taskId: task.id });
  saveTask(db, task.id, { revision: task.revision, title: '演示任务二', status: 'done' }, now);
  expect(readFocus(db, now).entries[0]).toMatchObject({ title: '演示任务二', done: true });
  saveFocus(db, '2026-10-14', { ...focus, energy: 'low' }, now);
  expect(getTask(db, task.id)?.status).toBe('done');
  const data = JSON.parse(
    new TextDecoder().decode(readZip(exportAll(db, now, 'test')).find((f) => f.name === 'data.json')?.data),
  );
  expect(data.tasks[0]).toMatchObject({ title: '演示任务二', status: 'done' });
  expect(taskRecords(db)).toHaveLength(1);
});
it('keeps the stable action ID through wording changes and blocks duplicate open tasks', async () => {
  const first = structuredClone(base);
  first.schema_version = '1.1';
  first.next_actions[0].id = 'demo-action';
  const id = await addSnapshot(first);
  const task = saveTask(db, null, { projectId: 'demo.beta', sourceSnapshotId: id, actionIndex: 0 }, now);
  const next = structuredClone(first);
  next.snapshot_at = '2026-10-13T10:00:00+08:00';
  next.next_actions[0].title = '调整后的虚构行动';
  const newer = await addSnapshot(next);
  expect(getTask(db, task.id)?.gone).toBe(false);
  expect(() =>
    saveTask(db, null, { projectId: 'demo.beta', sourceSnapshotId: newer, actionIndex: 0 }, now),
  ).toThrow('exists');
});
