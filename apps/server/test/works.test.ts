import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { validateCover } from '../src/covers.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll } from '../src/export.ts';
import { overview } from '../src/overview.ts';
import { getWork, saveCover, saveWork, trashWork, workCover } from '../src/works.ts';
import { readZip } from '../src/zip.ts';

let db: Database;
const now = new Date('2026-10-14T00:00:00Z');
const raw = readFileSync(join(REPO_ROOT, 'fixtures/media/demo-cover.webp'));
const fields = {
  title: '演示成果',
  lang: 'zh-Hans',
  kind: 'photos',
  date: '2026-10-14',
  note: '虚构素材的色彩很好',
  link: 'https://example.com/demo',
  treasured: true,
};
beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
});
afterEach(() => db.close());
it('accepts a real browser-encoded image and rejects metadata, aliases, truncation and trailing data', () => {
  expect(validateCover(raw)).toBe(true);
  for (const tag of ['EXIF', 'XMP ', 'ANIM', 'ICCP', 'DEMO']) {
    const added = Buffer.concat([raw, Buffer.from(tag), Buffer.from([2, 0, 0, 0, 1, 2])]);
    added.writeUInt32LE(added.length - 8, 4);
    expect(validateCover(added)).toBe(false);
  }
  const alias = Buffer.from(raw);
  alias[0] = (alias[0] ?? 0) | 128;
  expect(validateCover(alias)).toBe(false);
  expect(validateCover(raw.subarray(0, raw.length - 1))).toBe(false);
  expect(validateCover(Buffer.concat([raw, Buffer.from([0, 0])]))).toBe(false);
  const size = Buffer.from(raw);
  size.writeUInt32LE(0xffffffff, 16);
  expect(validateCover(size)).toBe(false);
});
it('rejects oversized dimensions and bodies before saving a cover', () => {
  const oversized = Buffer.from(raw);
  const at = oversized.indexOf('VP8 ');
  expect(at).toBeGreaterThan(0);
  oversized.writeUInt16LE(801, at + 8 + 6);
  expect(validateCover(oversized)).toBe(false);
  expect(validateCover(new Uint8Array(5 * 1024 * 1024 + 1))).toBe(false);
  const w = saveWork(db, null, fields, now);
  expect(() => saveCover(db, w.id, w.revision, oversized, now)).toThrow('invalid_cover');
  expect(getWork(db, w.id)?.hasCover).toBe(false);
});
it('validates dates, links, languages, secret text and optimistic updates without losing a saved record', () => {
  const w = saveWork(db, null, fields, now);
  const next = saveWork(db, w.id, { revision: w.revision, note: '更新后的说明' }, now);
  expect(() => saveWork(db, w.id, { revision: w.revision, note: '旧窗口' }, now)).toThrow('work_changed');
  for (const patch of [
    { date: '2026-02-30' },
    { link: 'http://example.com' },
    { link: 'https://demo:demo@example.com' },
    { lang: 'xx' },
    { treasured: null },
    { title: ' ' },
    { title: ['ghp_', 'a'.repeat(40)].join('') },
  ])
    expect(() => saveWork(db, w.id, { revision: next.revision, ...patch }, now)).toThrow();
  expect(getWork(db, w.id)?.note).toBe('更新后的说明');
});
it('stores covers in the same backup and export transaction and preserves them through soft delete', async () => {
  const w = saveWork(db, null, fields, now);
  saveCover(db, w.id, w.revision, raw, now);
  const revision = getWork(db, w.id)?.revision;
  expect(() => saveCover(db, w.id, w.revision, raw, now)).toThrow('work_changed');
  trashWork(db, w.id, revision, now);
  expect(overview(db, now).recentWorks).toHaveLength(0);
  trashWork(db, w.id, getWork(db, w.id)?.revision, now, true);
  expect(overview(db, now).recentWorks).toHaveLength(1);
  const archive = readZip(exportAll(db, now, 'test'));
  expect(archive.find((e) => e.name === `media/${w.id}.webp`)?.data).toEqual(new Uint8Array(raw));
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-cover-test-'));
  try {
    const file = join(dir, 'copy.sqlite');
    await backup(db, file);
    const restored = openDatabase(file);
    try {
      expect(workCover(restored, w.id)).toEqual(new Uint8Array(raw));
      expect(getWork(restored, w.id)?.treasured).toBe(true);
    } finally {
      restored.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
it('excludes future and old works from recent delivery without discarding the records', () => {
  saveWork(db, null, { ...fields, date: '2026-10-01' }, now);
  saveWork(db, null, { ...fields, date: '2026-09-30' }, now);
  saveWork(db, null, { ...fields, date: '2026-10-15' }, now);
  expect(overview(db, now).recentWorks).toHaveLength(1);
});
it('guards cover HTTP uploads, size, content type and deleted records', async () => {
  const host = '127.0.0.1:5180',
    origin = `http://${host}`;
  const app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: '.' },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
  const w = saveWork(db, null, fields, now);
  const path = `/api/works/${w.id}/cover?revision=${w.revision}`;
  expect(
    (await app.request(path, { method: 'PUT', headers: { host, 'content-type': 'image/webp' }, body: raw }))
      .status,
  ).toBe(403);
  const headers = { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'image/webp' };
  expect(
    (
      await app.request(path, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'text/html' },
        body: raw,
      })
    ).status,
  ).toBe(400);
  expect(
    (await app.request(path, { method: 'PUT', headers, body: new Uint8Array(5 * 1024 * 1024 + 1) })).status,
  ).toBe(413);
  expect((await app.request(path, { method: 'PUT', headers, body: raw })).status).toBe(200);
  const cover = await app.request(`/api/works/${w.id}/cover`, { headers: { host } });
  expect(cover.headers.get('content-type')).toBe('image/webp');
  expect(cover.headers.get('x-content-type-options')).toBe('nosniff');
  trashWork(db, w.id, getWork(db, w.id)?.revision, now);
  expect((await app.request(`/api/works/${w.id}/cover`, { headers: { host } })).status).toBe(404);
});
