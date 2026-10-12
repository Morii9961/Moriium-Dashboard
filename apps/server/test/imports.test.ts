/**
 * 导入的端到端测试（P3 交付标准）：重复、冲突、旧快照、非法文件、带 BOM、UTF-16、代码块包裹、
 * 疑似密钥、未登记 ID、在错误的项目页导入、同一批多份、撤销。全部用虚构的 demo.* 样本。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { safeFileName } from '../src/imports.ts';
import { readZip } from '../src/zip.ts';

const FIXTURES = join(REPO_ROOT, 'fixtures', 'protocol');
const fixture = (path: string) => readFileSync(join(FIXTURES, path));
const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64');

const host = '127.0.0.1:5180';
const origin = `http://${host}`;
const now = new Date('2026-10-12T10:00:00Z');

let dir: string;
let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'moriium-dashboard-import-'));
  db = openDatabase(join(dir, 'import.sqlite'));
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  db.prepare(
    "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('demo.beta', 'Demo Beta', 'x', 'x'), ('demo.alpha', 'Demo Alpha', 'x', 'x')",
  ).run();
  app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'backups') },
    startedAt: now,
    version: '0.0.0',
    now: () => now,
  });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

type FileReq = { name: string; base64: string; [k: string]: unknown };
const file = (path: string, extra: Record<string, unknown> = {}): FileReq => ({
  name: path.split('/').pop() as string,
  base64: b64(fixture(path)),
  ...extra,
});

async function post(path: string, files: FileReq[]) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { files?: Preview[] } };
}
type Preview = Record<string, unknown> & { status: string; placement?: { kind: string } };
const check = async (files: FileReq[]) => (await post('/api/imports/check', files)).body.files as Preview[];
const commit = async (files: FileReq[]) =>
  (await post('/api/imports', files)).body as { batchId: number; results: Record<string, unknown>[] };

const current = (projectId: string) =>
  db
    .prepare(
      'SELECT snapshot_at FROM status_snapshots WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL ORDER BY snapshot_at_utc_ms DESC LIMIT 1',
    )
    .get(projectId) as { snapshot_at: string } | undefined;

describe('import preview', () => {
  it('previews a first snapshot as the new latest, with attribution from the file', async () => {
    const [p] = await check([file('history/t1-base.json')]);
    expect(p).toMatchObject({
      status: 'accepted',
      projectId: 'demo.beta',
      projectName: 'Demo Beta',
      placement: { kind: 'latest', replaces: null },
      attribution: { agent: 'codex', source: 'file' },
      diff: null,
    });
  });

  it('explains rejected files and offers a fix prompt, without blocking the others', async () => {
    const files = await check([
      file('syntax/trailing-comma.json'),
      file('encoding/utf16le-bom.json'),
      file('structure/project-id-unregistered.json'),
      file('history/t1-base.json'),
    ]);
    expect(files.map((f) => f.status)).toEqual(['rejected', 'rejected', 'rejected', 'accepted']);
    expect(files[0]).toMatchObject({ errors: [expect.objectContaining({ code: 'json_syntax' })] });
    expect(String(files[0]?.fixPrompt)).toContain('请修正');
    expect(files[1]).toMatchObject({ errors: [expect.objectContaining({ code: 'encoding_utf16' })] });
  });

  it('asks before extracting a code-fenced file, then checks the extracted JSON', async () => {
    const [ask] = await check([file('syntax/code-fence.json')]);
    expect(ask).toEqual({ status: 'needs_choice', fileName: 'code-fence.json', choice: 'code_fence' });
    const [extracted] = await check([file('syntax/code-fence.json', { codeFence: 'extract' })]);
    expect(extracted?.status).not.toBe('needs_choice');
  });

  it('rejects a file imported from the wrong project page', async () => {
    const [p] = await check([file('history/t1-base.json', { expectedProjectId: 'demo.alpha' })]);
    expect(p).toMatchObject({
      status: 'rejected',
      errors: [expect.objectContaining({ code: 'project_mismatch' })],
    });
  });

  it('places files of one batch in time order: oldest first, newest becomes latest', async () => {
    const files = await check([
      file('history/t2-newer.json'),
      file('history/t0-older.json'),
      file('history/t1-base.json'),
    ]);
    // 只有最晚的 t2 成为最新，另外两份标为「比同一批里的另一份早」。
    expect(files.map((f) => f.placement?.kind)).toEqual(['latest', 'history', 'history']);
    expect(files[1]?.placement).toMatchObject({ inBatch: true });
    // 第二次（库里已有 t2）时，更早的两份只进历史。
    await commit([file('history/t2-newer.json')]);
    const again = await check([file('history/t0-older.json'), file('history/t1-base.json')]);
    expect(again.map((f) => f.placement?.kind)).toEqual(['history', 'history']);
  });

  it('recognises the same content in another layout as a duplicate, also within one batch', async () => {
    await commit([file('history/t1-base.json')]);
    const [p] = await check([file('history/t1-base-reformatted.json')]);
    expect(p?.placement).toMatchObject({ kind: 'duplicate', deleted: false, inBatch: false });
    const both = await check([file('history/t2-newer.json'), file('history/t2-newer.json')]);
    expect(both[1]?.placement).toMatchObject({ kind: 'duplicate', inBatch: true });
  });

  it('reports a same-instant conflict (+08:00 vs Z) and a diff against the current snapshot', async () => {
    await commit([file('history/t1-base.json')]);
    const [p] = await check([file('history/t1-same-instant-different.json')]);
    expect(p?.placement).toMatchObject({ kind: 'conflict', inBatch: false });
    const [newer] = await check([file('history/t2-newer.json')]);
    expect(newer?.diff).not.toBeNull();
  });

  it('refuses suspected secrets without echoing them', async () => {
    const raw = fixture('history/t1-base.json').toString('utf8');
    const token = ['ghp', '_', 'A'.repeat(36)].join('');
    const withSecret = raw.replace('虚构的演示项目', `虚构的演示项目 ${token}`);
    const res = await post('/api/imports/check', [{ name: 'secret.json', base64: b64(withSecret) }]);
    expect(res.body.files?.[0]?.status).toBe('rejected');
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});

describe('import commit and undo', () => {
  it('writes snapshots, keeps the raw bytes, and logs the batch', async () => {
    const r = await commit([file('history/t1-base.json'), file('syntax/empty.json')]);
    expect(r.results).toEqual([
      expect.objectContaining({ outcome: 'imported', projectId: 'demo.beta', placement: 'latest' }),
      expect.objectContaining({ outcome: 'rejected' }),
    ]);
    const row = db
      .prepare('SELECT raw, file_name, reporter_agent, reporter_source FROM status_snapshots')
      .get() as {
      raw: Uint8Array;
      file_name: string;
      reporter_agent: string;
      reporter_source: string;
    };
    expect(Buffer.from(row.raw).equals(fixture('history/t1-base.json'))).toBe(true);
    expect(row).toMatchObject({
      file_name: 't1-base.json',
      reporter_agent: 'codex',
      reporter_source: 'file',
    });
    const batches = (await (await app.request('/api/imports', { headers: { host } })).json()) as {
      batches: { importedCount: number; skippedCount: number }[];
    };
    expect(batches.batches[0]).toMatchObject({ importedCount: 1, skippedCount: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'import'").get()).toEqual({ n: 1 });
  });

  it('reports only the newest file of a project in one batch as the new latest', async () => {
    const r = await commit([
      file('history/t0-older.json'),
      file('history/t2-newer.json'),
      file('history/t1-base.json'),
    ]);
    expect(r.results.map((o) => o.placement)).toEqual(['history', 'latest', 'history']);
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-09T10:00:00+08:00');
  });

  it('keeps an older snapshot in history without changing the current state', async () => {
    await commit([file('history/t2-newer.json')]);
    const r = await commit([file('history/t0-older.json')]);
    expect(r.results[0]).toMatchObject({ outcome: 'imported', placement: 'history' });
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-09T10:00:00+08:00');
  });

  it('skips duplicates and unreplaced conflicts; replacing marks the old version superseded', async () => {
    await commit([file('history/t1-base.json')]);
    const dup = await commit([file('history/t1-base-reformatted.json')]);
    expect(dup.results[0]).toMatchObject({ outcome: 'skipped', reason: 'duplicate' });
    const skipped = await commit([file('history/t1-same-instant-different.json')]);
    expect(skipped.results[0]).toMatchObject({ outcome: 'skipped', reason: 'conflict' });
    const replaced = await commit([file('history/t1-same-instant-different.json', { conflict: 'replace' })]);
    expect(replaced.results[0]).toMatchObject({ outcome: 'imported', placement: 'replaced' });
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-05T02:00:00Z');
    const superseded = db
      .prepare('SELECT COUNT(*) AS n FROM status_snapshots WHERE superseded_by IS NOT NULL')
      .get();
    expect(superseded).toEqual({ n: 1 });
  });

  it('lets Morii override the reporter', async () => {
    await commit([file('history/t1-base.json', { reporter: 'claude' })]);
    expect(db.prepare('SELECT reporter_agent, reporter_source FROM status_snapshots').get()).toEqual({
      reporter_agent: 'claude',
      reporter_source: 'chosen',
    });
  });

  it('undoes a batch: snapshots go to the trash, replaced versions come back, current state rolls back', async () => {
    await commit([file('history/t1-base.json')]);
    const r = await commit([
      file('history/t1-same-instant-different.json', { conflict: 'replace' }),
      file('history/t2-newer.json'),
    ]);
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-09T10:00:00+08:00');
    const undo = await app.request(`/api/imports/${r.batchId}`, {
      method: 'DELETE',
      headers: { host, origin, 'x-moriium-dashboard': '1' },
    });
    expect(await undo.json()).toEqual({ removed: 2 });
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-05T10:00:00+08:00');
    const again = await app.request(`/api/imports/${r.batchId}`, {
      method: 'DELETE',
      headers: { host, origin, 'x-moriium-dashboard': '1' },
    });
    expect(again.status).toBe(409);
    // 撤销后的内容在回收站里：再次导入同样的内容被认出是回收站里的那份。
    const [p] = await check([file('history/t2-newer.json')]);
    expect(p?.placement).toMatchObject({ kind: 'duplicate', deleted: true });
  });

  it('returns each project with its current snapshot', async () => {
    await commit([file('history/t0-older.json'), file('history/t2-newer.json')]);
    const { projects } = (await (await app.request('/api/projects', { headers: { host } })).json()) as {
      projects: { id: string; snapshotCount: number; current: { snapshotAt: string } | null }[];
    };
    const beta = projects.find((p) => p.id === 'demo.beta');
    expect(beta).toMatchObject({ snapshotCount: 2, current: { snapshotAt: '2026-10-09T10:00:00+08:00' } });
    expect(projects.find((p) => p.id === 'demo.alpha')?.current).toBeNull();
  });
});

describe('import requests', () => {
  it('rejects malformed requests and too many files', async () => {
    expect((await post('/api/imports/check', [])).status).toBe(400);
    expect((await post('/api/imports/check', [{ name: 'x', base64: '***' }])).status).toBe(400);
    const many = Array.from({ length: 21 }, () => file('history/t1-base.json'));
    expect((await post('/api/imports/check', many)).status).toBe(400);
  });

  it('keeps only the file name, without directories or control characters', () => {
    // 路径拼出来，不在仓库里写字面的本机路径（公开树审计会拦）。
    const windowsPath = ['C:', 'Users', 'someone', 'repo', 'project-status.json'].join(
      String.fromCodePoint(0x5c),
    );
    expect(safeFileName(windowsPath)).toBe('project-status.json');
    expect(safeFileName(['', 'home', 'x', 'a.json'].join('/'))).toBe('a.json');
    expect(safeFileName(`a${String.fromCodePoint(0x202e)}b.json`)).toBe('ab.json');
    expect(safeFileName('')).toBe('project-status.json');
  });
});

describe('history', () => {
  const del = (path: string) =>
    app.request(path, { method: 'DELETE', headers: { host, origin, 'x-moriium-dashboard': '1' } });
  const restore = (id: number) =>
    app.request(`/api/snapshots/${id}/restore`, {
      method: 'POST',
      headers: { host, origin, 'x-moriium-dashboard': '1' },
    });
  const history = async () =>
    (
      (await (await app.request('/api/projects/demo.beta/snapshots', { headers: { host } })).json()) as {
        snapshots: { id: number; snapshotAt: string; deleted: boolean; superseded: boolean; stage: string }[];
      }
    ).snapshots;

  it('lists snapshots newest first, including replaced ones, with stage and counts', async () => {
    await commit([
      file('history/t0-older.json'),
      file('history/t1-base.json'),
      file('history/t2-newer.json'),
    ]);
    await commit([file('history/t1-same-instant-different.json', { conflict: 'replace' })]);
    const list = await history();
    expect(list.map((s) => s.snapshotAt)).toEqual([
      '2026-10-09T10:00:00+08:00',
      '2026-10-05T02:00:00Z',
      '2026-10-05T10:00:00+08:00',
      '2026-10-01T10:00:00+08:00',
    ]);
    expect(list.filter((s) => s.superseded)).toHaveLength(1);
    expect(list[0]).toMatchObject({ stage: expect.any(String), deleted: false });
  });

  it('compares two snapshots in time order', async () => {
    await commit([file('history/t1-base.json'), file('history/t2-newer.json')]);
    const [newer, older] = await history();
    const res = await app.request(`/api/snapshots/compare?a=${newer?.id}&b=${older?.id}`, {
      headers: { host },
    });
    const body = (await res.json()) as { before: { id: number }; after: { id: number }; diff: unknown };
    expect(body.before.id).toBe(older?.id);
    expect(body.after.id).toBe(newer?.id);
    expect(body.diff).toBeTruthy();
    expect((await app.request('/api/snapshots/compare?a=1&b=1', { headers: { host } })).status).toBe(400);
  });

  it('deleting the latest rolls the current state back; restoring brings it back', async () => {
    await commit([file('history/t1-base.json'), file('history/t2-newer.json')]);
    const [latest] = await history();
    expect((await del(`/api/snapshots/${latest?.id}`)).status).toBe(200);
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-05T10:00:00+08:00');
    expect((await restore(latest?.id ?? 0)).status).toBe(200);
    expect(current('demo.beta')?.snapshot_at).toBe('2026-10-09T10:00:00+08:00');
    expect((await restore(latest?.id ?? 0)).status).toBe(409);
  });

  it('refuses to restore into a same-instant clash', async () => {
    await commit([file('history/t1-base.json')]);
    const [first] = await history();
    await del(`/api/snapshots/${first?.id}`);
    await commit([file('history/t1-same-instant-different.json')]);
    expect((await restore(first?.id ?? 0)).status).toBe(409);
  });

  it('serves the raw bytes as a download', async () => {
    await commit([file('history/t1-base.json')]);
    const [s] = await history();
    const res = await app.request(`/api/snapshots/${s?.id}/raw`, { headers: { host } });
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await res.arrayBuffer()).equals(fixture('history/t1-base.json'))).toBe(true);
  });
});

describe('export', () => {
  const download = async (path: string) => {
    const res = await app.request(path, { headers: { host } });
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="moriium-dashboard-.+\.zip"/,
    );
    return readZip(new Uint8Array(await res.arrayBuffer()));
  };

  it('exports everything: manifest, data, active raw files and an archive of trashed or replaced versions', async () => {
    await commit([
      file('history/t0-older.json'),
      file('history/t1-base.json'),
      file('history/t2-newer.json'),
    ]);
    await commit([file('history/t1-same-instant-different.json', { conflict: 'replace' })]);
    const zip = await download('/api/export');
    const names = zip.map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(['manifest.json', 'data.json']);
    const manifest = JSON.parse(new TextDecoder().decode(zip[0]?.data)) as Record<string, unknown>;
    expect(manifest).toMatchObject({ app: 'moriium-dashboard', exportFormat: 1, counts: { snapshots: 4 } });
    expect(names.filter((n) => n.startsWith('snapshots/demo.beta/'))).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('snapshots-archive/'))).toHaveLength(1);
    const t0 = zip.find((e) => e.name.startsWith('snapshots/demo.beta/2026-10-01T10-00-00+08-00_'));
    expect(t0 && Buffer.from(t0.data).equals(fixture('history/t0-older.json'))).toBe(true);
    // 不带任何路径：data.json 里只有文件名。
    expect(new TextDecoder().decode(zip[1]?.data)).not.toMatch(/[A-Za-z]:\|\/Users\/|\/home\//);
  });

  it('exports raw snapshots that a fresh Dashboard imports again unchanged', async () => {
    await commit([file('history/t0-older.json'), file('history/t2-newer.json')]);
    const zip = await download('/api/export/snapshots');
    expect(zip.map((e) => e.name.split('/')[0])).toEqual(['snapshots', 'snapshots']);

    const fresh = openDatabase(join(dir, 'fresh.sqlite'));
    applyMigrations(fresh, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
    fresh
      .prepare(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('demo.beta', 'Demo Beta', 'x', 'x')",
      )
      .run();
    const other = createApp({
      db: fresh,
      config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'b2') },
      startedAt: now,
      version: '0.0.0',
      now: () => now,
    });
    const res = await other.request('/api/imports', {
      method: 'POST',
      headers: { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ files: zip.map((e) => ({ name: e.name, base64: b64(e.data) })) }),
    });
    const body = (await res.json()) as { results: { outcome: string }[] };
    expect(body.results.map((r) => r.outcome)).toEqual(['imported', 'imported']);
    fresh.close();
  });
});
