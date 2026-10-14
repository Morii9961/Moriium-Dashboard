import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll } from '../src/export.ts';
import { dayInShanghai, readFocus, saveFocus } from '../src/focus.ts';
import { readZip } from '../src/zip.ts';

let db: Database;
const now = new Date('2026-10-14T15:59:59Z');
const entry = { id: 'demo', title: '整理虚构素材', lang: 'zh-Hans', done: false };
beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
});
afterEach(() => db.close());
it('limits the list to three, preserves ordering and rejects stale saves without data loss', () => {
  const first = saveFocus(
    db,
    '2026-10-14',
    { revision: 0, energy: 'low', entries: [entry, { ...entry, id: 'second' }, { ...entry, id: 'third' }] },
    now,
  );
  expect(first.entries.map((e) => e.id)).toEqual(['demo', 'second', 'third']);
  expect(() => saveFocus(db, '2026-10-14', { ...first, revision: 0, entries: [] }, now)).toThrow(
    'focus_changed',
  );
  expect(() =>
    saveFocus(db, '2026-10-14', { ...first, entries: [...first.entries, { ...entry, id: 'fourth' }] }, now),
  ).toThrow('invalid_field');
  expect(readFocus(db, now)).toEqual(first);
});
it('resets at Shanghai midnight and retains no focus or energy history after the next save', () => {
  const first = saveFocus(db, dayInShanghai(now), { revision: 0, energy: 'rest', entries: [entry] }, now);
  const tomorrow = new Date('2026-10-14T16:00:00Z');
  expect(readFocus(db, tomorrow)).toEqual({ date: '2026-10-15', energy: null, entries: [], revision: 0 });
  expect(() => saveFocus(db, '2026-10-14', { ...first }, tomorrow)).toThrow('date_changed');
  saveFocus(db, '2026-10-15', { revision: 0, energy: null, entries: [] }, tomorrow);
  expect(db.prepare('SELECT COUNT(*) AS n FROM focus_day').get()).toMatchObject({ n: 1 });
  expect(db.prepare('SELECT date,energy,entries FROM focus_day').get()).toMatchObject({
    date: '2026-10-15',
    energy: null,
    entries: '[]',
  });
  const archive = readZip(exportAll(db, tomorrow, 'test'));
  const data = JSON.parse(new TextDecoder().decode(archive.find((f) => f.name === 'data.json')?.data));
  expect(data.focus.entries).toEqual([]);
});
it('rejects duplicate IDs, invalid languages, whitespace and suspected secrets without mutation', () => {
  for (const entries of [
    [entry, entry],
    [{ ...entry, lang: 'xx' }],
    [{ ...entry, title: ' ' }],
    [{ ...entry, title: ['ghp_', 'a'.repeat(40)].join('') }],
  ]) {
    expect(() => saveFocus(db, '2026-10-14', { revision: 0, energy: 'normal', entries }, now)).toThrow();
  }
  expect(readFocus(db, now).revision).toBe(0);
});
it('protects write requests and does not expose past dates', async () => {
  const host = '127.0.0.1:5180';
  const app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [`http://${host}`], backupDir: '.' },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
  const r = await app.request('/api/focus/2026-10-14', {
    method: 'PUT',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify({ revision: 0, energy: 'rest', entries: [] }),
  });
  expect(r.status).toBe(403);
  expect((await app.request('/api/focus/2026-10-13', { headers: { host } })).status).toBe(409);
});
