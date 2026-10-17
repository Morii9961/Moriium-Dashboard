import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { findSnapshots, MAX_ROOTS, readRoots, ScanError, saveRoots } from '../src/localScan.ts';

const host = '127.0.0.1:5180';
const origin = `http://${host}`;
const write = { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' };
const now = new Date('2026-10-17T09:00:00Z');
const base = readFileSync(join(REPO_ROOT, 'fixtures', 'protocol', 'history', 't1-base.json'), 'utf8');

let dir: string;
let db: Database;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-local-scan-'));
  db = openDatabase(join(dir, 'test.sqlite'));
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES('demo.beta','Demo','x','x')").run();
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function repo(root: string, name: string, content: string) {
  const status = join(root, name, 'docs', 'status');
  mkdirSync(status, { recursive: true });
  writeFileSync(join(status, 'project-status.json'), content);
}

describe('scan folders', () => {
  it('keeps only existing absolute folders, removes duplicates, and survives a damaged file', () => {
    const file = join(dir, 'local-repositories.json');
    expect(readRoots(file)).toEqual([]);
    const a = join(dir, 'a');
    mkdirSync(a);
    expect(saveRoots(file, [a, `${a}/`, ` ${a} `])).toEqual([resolve(a)]);
    expect(readRoots(file)).toEqual([resolve(a)]);
    for (const bad of [['relative/path'], [join(dir, 'missing')], [file], [42], 'not-a-list']) {
      expect(() => saveRoots(file, bad), JSON.stringify(bad)).toThrow(ScanError);
    }
    const many = Array.from({ length: MAX_ROOTS + 1 }, (_, i) => {
      const d = join(dir, `r${i}`);
      mkdirSync(d);
      return d;
    });
    expect(() => saveRoots(file, many)).toThrow(/too_many_roots/);
    writeFileSync(file, '{ not json');
    expect(readRoots(file)).toEqual([]);
  });

  it('reads the fixed status file in a folder and its direct children only', () => {
    const root = join(dir, 'code');
    repo(root, 'one', base);
    repo(root, '.hidden', base);
    repo(join(root, 'nested'), 'deeper', base);
    repo(root, 'huge', 'x'.repeat(1024 * 1024 + 1));
    mkdirSync(join(root, 'docs', 'status'), { recursive: true });
    writeFileSync(join(root, 'docs', 'status', 'project-status.json'), base);
    mkdirSync(join(root, 'empty'));

    const found = findSnapshots([root, join(dir, 'missing')]);
    expect(found.files.map((f) => f.name).sort()).toEqual([
      'code · project-status.json',
      'one · project-status.json',
    ]);
    expect(Buffer.from(found.files[0]?.base64 ?? '', 'base64').toString('utf8')).toBe(base);
    expect(found.truncated).toBe(false);
  });
});

describe('/api/local-scan', () => {
  const makeApp = (withScan: boolean) =>
    createApp({
      db,
      config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'backups') },
      startedAt: now,
      version: 'test',
      now: () => now,
      ...(withScan ? { localScan: { file: join(dir, 'local-repositories.json') } } : {}),
    });

  it('lists only snapshots the Dashboard does not have yet, and skips unregistered projects', async () => {
    const app = makeApp(true);
    const root = join(dir, 'code');
    repo(root, 'beta', base);
    repo(root, 'other', base.replace('"demo.beta"', '"demo.unregistered"'));

    const save = await app.request('/api/local-scan/roots', {
      method: 'PUT',
      headers: write,
      body: JSON.stringify({ roots: [root] }),
    });
    expect(save.status).toBe(200);

    const first = (await (await app.request('/api/local-scan/snapshots', { headers: { host } })).json()) as {
      files: { name: string; base64: string }[];
      found: number;
      unregistered: number;
      duplicate: number;
    };
    expect(first).toMatchObject({ found: 2, unregistered: 1, duplicate: 0 });
    expect(first.files.map((f) => f.name)).toEqual(['beta · project-status.json']);

    const imported = await app.request('/api/imports', {
      method: 'POST',
      headers: write,
      body: JSON.stringify({ files: first.files }),
    });
    expect(imported.status).toBe(201);

    const second = (await (await app.request('/api/local-scan/snapshots', { headers: { host } })).json()) as {
      files: unknown[];
      duplicate: number;
    };
    expect(second).toMatchObject({ files: [], duplicate: 1 });
    // Scanning never writes snapshots by itself.
    expect(db.prepare('SELECT COUNT(*) AS n FROM status_snapshots').get()).toEqual({ n: 1 });
  });

  it('rejects bad folders with the failing index, and keeps the write guard', async () => {
    const app = makeApp(true);
    const res = await app.request('/api/local-scan/roots', {
      method: 'PUT',
      headers: write,
      body: JSON.stringify({ roots: [dir, 'relative'] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_root', field: '1' });
    const noHeader = await app.request('/api/local-scan/roots', {
      method: 'PUT',
      headers: { host, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ roots: [dir] }),
    });
    expect(noHeader.status).toBe(403);
    expect(existsSync(join(dir, 'local-repositories.json'))).toBe(false);
  });

  it('does not exist on an instance without local scanning (for example with login enabled)', async () => {
    const app = makeApp(false);
    expect((await app.request('/api/local-scan/roots', { headers: { host } })).status).toBe(404);
    expect((await app.request('/api/local-scan/snapshots', { headers: { host } })).status).toBe(404);
  });
});
