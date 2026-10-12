import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  applyRetention,
  backupName,
  createBackup,
  isDailyBackupDue,
  isoWeekKey,
  listBackups,
  parseBackupName,
  planRetention,
  runDailyBackupIfDue,
} from '../src/backup.ts';
import { ConfigError, defaultDataDir, isInSyncedFolder, REPO_ROOT, resolveConfig } from '../src/config.ts';
import {
  applyMigrations,
  currentSchemaVersion,
  type Database,
  loadMigrations,
  openDatabase,
  pendingMigrations,
  transaction,
} from '../src/db.ts';
import { CONTENT_SECURITY_POLICY } from '../src/security.ts';

const MIGRATIONS_DIR = join(REPO_ROOT, 'apps', 'server', 'migrations');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moriium-dashboard-test-'));
});
afterEach(() => {
  // Windows 上打开着的数据库文件删不掉；重试几次。
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('resolveConfig', () => {
  const base = { platform: 'win32' as const, homedir: 'C:\\Users\\demo', repoRoot: 'C:\\code\\dashboard' };

  it('defaults to the OS app data folder and port 5180', () => {
    const c = resolveConfig({ ...base, env: { LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' } });
    expect(c.dataDir).toMatch(/moriium-dashboard$/);
    expect(c.port).toBe(5180);
    expect(c.hostname).toBe('127.0.0.1');
    expect(c.allowedHosts).toEqual(['127.0.0.1:5180', 'localhost:5180']);
  });

  it('knows the default folder on each platform', () => {
    expect(defaultDataDir({ env: {}, platform: 'darwin', homedir: '/Users/demo' })).toContain(
      join('Library', 'Application Support', 'moriium-dashboard'),
    );
    expect(
      defaultDataDir({ env: { XDG_DATA_HOME: '/x/share' }, platform: 'linux', homedir: '/home/demo' }),
    ).toBe(join('/x/share', 'moriium-dashboard'));
  });

  it('refuses a data folder inside the repository', () => {
    expect(() =>
      resolveConfig({ ...base, env: { MORIIUM_DASHBOARD_DATA: join(base.repoRoot, 'data') } }),
    ).toThrow(ConfigError);
  });

  it('refuses a relative data folder', () => {
    expect(() => resolveConfig({ ...base, env: { MORIIUM_DASHBOARD_DATA: 'data' } })).toThrow(/绝对路径/);
  });

  it('refuses a synced folder unless explicitly allowed', () => {
    const env = { MORIIUM_DASHBOARD_DATA: join(base.homedir, 'OneDrive', 'dash') };
    expect(() => resolveConfig({ ...base, env })).toThrow(/同步盘/);
    expect(() =>
      resolveConfig({ ...base, env: { ...env, MORIIUM_DASHBOARD_ALLOW_SYNCED_DATA_DIR: '1' } }),
    ).not.toThrow();
  });

  it('detects synced folders by name and by the OneDrive environment variable', () => {
    expect(isInSyncedFolder(join(base.homedir, 'OneDrive - School', 'x'), {})).toBe(true);
    expect(isInSyncedFolder(join(base.homedir, 'Dropbox', 'x'), {})).toBe(true);
    expect(isInSyncedFolder(join('D:', 'Sync', 'x'), { OneDrive: join('D:', 'Sync') })).toBe(true);
    expect(isInSyncedFolder(join(base.homedir, 'AppData', 'Local', 'moriium-dashboard'), {})).toBe(false);
  });

  it('validates the port and dev origins', () => {
    expect(() => resolveConfig({ ...base, env: { MORIIUM_DASHBOARD_PORT: '80' } })).toThrow(/1024/);
    expect(() =>
      resolveConfig({ ...base, env: { MORIIUM_DASHBOARD_DEV_ORIGINS: 'https://evil.example' } }),
    ).toThrow(/本机地址/);
    const c = resolveConfig({ ...base, env: { MORIIUM_DASHBOARD_DEV_ORIGINS: 'http://localhost:5173' } });
    expect(c.allowedOrigins).toContain('http://localhost:5173');
  });
});

describe('migrations', () => {
  it('apply in order, record versions and are idempotent', () => {
    const db = openDatabase(join(dir, 'a.sqlite'));
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations[0]?.version).toBe(1);
    applyMigrations(db, pendingMigrations(db, migrations));
    expect(currentSchemaVersion(db)).toBe(migrations.length);
    expect(pendingMigrations(db, migrations)).toEqual([]);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['schema_migrations', 'settings', 'audit_log']));
    expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    db.close();
  });

  it('roll back a failing migration completely', () => {
    const db = openDatabase(join(dir, 'b.sqlite'));
    const bad = [
      { version: 1, name: 'ok', sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT;' },
      { version: 2, name: 'broken', sql: 'CREATE TABLE u (id INTEGER); INSERT INTO nope VALUES (1);' },
    ];
    try {
      expect(() => applyMigrations(db, bad)).toThrow();
      expect(currentSchemaVersion(db)).toBe(1);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'u'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('refuse a database newer than the program', () => {
    const db = openDatabase(join(dir, 'c.sqlite'));
    currentSchemaVersion(db);
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(99, 'future', new Date().toISOString());
    expect(() => pendingMigrations(db, loadMigrations(MIGRATIONS_DIR))).toThrow(/升级 Dashboard/);
    db.close();
  });

  it('reject gaps in migration numbering', () => {
    const m = join(dir, 'migrations');
    mkdirSync(m);
    writeFileSync(join(m, '0001_a.sql'), 'SELECT 1;');
    writeFileSync(join(m, '0003_c.sql'), 'SELECT 1;');
    expect(() => loadMigrations(m)).toThrow(/不连续/);
  });

  it('transaction() rolls back on error', () => {
    const db = openDatabase(join(dir, 'd.sqlite'));
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    expect(() =>
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM t').get()).toEqual({ n: 0 });
    db.close();
  });
});

describe('backups', () => {
  const at = (iso: string) => new Date(iso);

  it('names round-trip', () => {
    const name = backupName('pre-migration', at('2026-10-12T01:30:05Z'), 3);
    expect(name).toBe('pre-migration-v0003-20261012T013005Z.sqlite');
    expect(parseBackupName(name)).toEqual({ name, kind: 'pre-migration', at: at('2026-10-12T01:30:05Z') });
    expect(parseBackupName('daily-20261012T013005Z.sqlite.partial')).toBeNull();
    expect(parseBackupName('notes.txt')).toBeNull();
  });

  it('daily backup is due after 24 hours', () => {
    const files = [{ name: 'x', kind: 'daily' as const, at: at('2026-10-11T09:00:00Z') }];
    expect(isDailyBackupDue(files, at('2026-10-12T08:59:00Z'))).toBe(false);
    expect(isDailyBackupDue(files, at('2026-10-12T09:00:00Z'))).toBe(true);
    expect(isDailyBackupDue([], at('2026-10-12T09:00:00Z'))).toBe(true);
  });

  it('computes ISO weeks', () => {
    expect(isoWeekKey(at('2026-10-12T00:00:00Z'))).toBe('2026-W42');
    expect(isoWeekKey(at('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });

  it('keeps 14 daily, then one per week for 8 weeks, and 5 pre-migration backups', () => {
    const files = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(Date.UTC(2026, 9, 12) - i * 86_400_000);
      files.push({ name: backupName('daily', d), kind: 'daily' as const, at: d });
    }
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 8, 1 + i));
      files.push({ name: backupName('pre-migration', d, i), kind: 'pre-migration' as const, at: d });
    }
    const remove = new Set(planRetention(files));
    const kept = files.filter((f) => !remove.has(f.name));
    const keptDaily = kept.filter((f) => f.kind === 'daily');
    expect(keptDaily).toHaveLength(14 + 8);
    expect(new Set(keptDaily.slice(14).map((f) => isoWeekKey(f.at))).size).toBe(8);
    expect(kept.filter((f) => f.kind === 'pre-migration')).toHaveLength(5);
  });

  it('cleans up stale partial files left by a crash, but not fresh ones', () => {
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    writeFileSync(join(backups, 'daily-20261001T000000Z.sqlite.partial'), '');
    writeFileSync(join(backups, 'daily-20261012T000000Z.sqlite.partial'), '');
    const old = new Date('2026-10-01T00:00:00Z');
    utimesSync(join(backups, 'daily-20261001T000000Z.sqlite.partial'), old, old);
    const removed = applyRetention(backups, new Date('2026-10-12T00:30:00Z'));
    expect(removed).toEqual(['daily-20261001T000000Z.sqlite.partial']);
    expect(readdirSync(backups)).toEqual(['daily-20261012T000000Z.sqlite.partial']);
  });

  it('creates a usable backup atomically and runs the daily job once per day', async () => {
    const db = openDatabase(join(dir, 'live.sqlite'));
    db.exec("CREATE TABLE t (v TEXT) STRICT; INSERT INTO t VALUES ('hello')");
    const backups = join(dir, 'backups');
    const first = await runDailyBackupIfDue(db, backups, at('2026-10-12T09:00:00Z'));
    expect(first).not.toBeNull();
    expect(await runDailyBackupIfDue(db, backups, at('2026-10-12T12:00:00Z'))).toBeNull();
    expect(readdirSync(backups).filter((n) => n.endsWith('.partial'))).toEqual([]);
    const copy = openDatabase(first as string);
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'hello' });
    copy.close();
    await createBackup(db, backups, 'pre-migration', at('2026-10-12T13:00:00Z'), 1);
    expect(listBackups(backups).map((b) => b.kind)).toEqual(['pre-migration', 'daily']);
    db.close();
  });
});

describe('HTTP app', () => {
  let db: Database;
  let app: ReturnType<typeof createApp>;
  const origin = 'http://127.0.0.1:5180';
  const host = '127.0.0.1:5180';

  beforeEach(() => {
    db = openDatabase(join(dir, 'app.sqlite'));
    applyMigrations(db, loadMigrations(MIGRATIONS_DIR));
    app = createApp({
      db,
      config: {
        allowedHosts: [host, 'localhost:5180'],
        allowedOrigins: [origin],
        backupDir: join(dir, 'backups'),
      },
      startedAt: new Date(),
      version: '0.0.0',
    });
  });
  afterEach(() => db.close());

  const request = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(path, { ...init, headers: { host, ...init.headers } });

  it('serves /api/health without exposing paths', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', schemaVersion: 1, lastBackupAt: null });
    expect(JSON.stringify(body)).not.toMatch(/[\\/]/);
  });

  it('sets security headers on every response, including rejected ones', async () => {
    for (const res of [
      await request('/api/health'),
      await request('/api/health', { headers: { host: 'evil.example:5180' } }),
      await request('/api/nope'),
    ]) {
      expect(res.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    }
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it('rejects unexpected Host headers (DNS rebinding)', async () => {
    expect((await request('/api/health', { headers: { host: 'evil.example:5180' } })).status).toBe(421);
    expect((await request('/api/health', { headers: { host: '127.0.0.1:9999' } })).status).toBe(421);
    expect((await request('/api/health', { headers: { host: 'localhost:5180' } })).status).toBe(200);
  });

  it('requires an allowed Origin and the custom header for writes', async () => {
    expect((await request('/api/x', { method: 'POST' })).status).toBe(403);
    expect(
      (await request('/api/x', { method: 'POST', headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403);
    expect((await request('/api/x', { method: 'POST', headers: { origin } })).status).toBe(403);
    const ok = await request('/api/x', { method: 'POST', headers: { origin, 'x-moriium-dashboard': '1' } });
    expect(ok.status).toBe(404);
  });

  it('does not answer CORS preflight', async () => {
    const res = await request('/api/x', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reports a degraded database as 503', async () => {
    db.close();
    const res = await request('/api/health');
    expect(res.status).toBe(503);
    db = openDatabase(join(dir, 'app.sqlite'));
  });

  it('never leaves files behind in the repository', () => {
    expect(existsSync(join(REPO_ROOT, 'apps', 'server', 'dashboard.sqlite'))).toBe(false);
  });
});
