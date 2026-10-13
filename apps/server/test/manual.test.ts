import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { manualMilestones } from '../src/manual.ts';
import { getProject, registry } from '../src/projects.ts';
import { readZip } from '../src/zip.ts';

let dir: string;
let db: Database;
let app: ReturnType<typeof createApp>;
const host = '127.0.0.1:5180',
  origin = `http://${host}`,
  now = new Date('2026-10-13T00:00:00Z');
const headers = { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' };
const req = async (path: string, method: string, body: unknown) =>
  app.request(path, { method, headers, body: JSON.stringify(body) });
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-manual-'));
  db = openDatabase(join(dir, 'test.sqlite'));
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'backups') },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
  await req('/api/projects', 'POST', { id: 'demo.manual', name: 'Demo manual', tracking: 'manual' });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
const body = () => ({
  updatedAt: getProject(db, 'demo.manual')?.updatedAt,
  workingOn: '调色',
  nextStep: '导出样片',
  keyDate: '2027-01-10',
  keyDateLabel: '交付',
  lang: 'zh-Hans',
  milestones: [
    { title: '剪辑', status: 'done', targetDate: null },
    { title: '调色', status: 'in_progress', targetDate: '2026-10-20' },
  ],
});
it('keeps manual milestone IDs through edits, projects progress and exports', async () => {
  expect((await req('/api/projects/demo.manual/manual', 'PUT', body())).status).toBe(200);
  const first = manualMilestones(db, 'demo.manual');
  const edit = {
    ...body(),
    milestones: first.map((m) => ({ id: m.id, title: m.title, status: 'done', targetDate: m.targetDate })),
  };
  expect((await req('/api/projects/demo.manual/manual', 'PUT', edit)).status).toBe(200);
  expect(manualMilestones(db, 'demo.manual').map((m) => m.id)).toEqual(first.map((m) => m.id));
  expect(getProject(db, 'demo.manual')).toMatchObject({
    workingOn: '调色',
    nextStep: '导出样片',
    keyDate: '2027-01-10',
  });
  const zip = await app.request('/api/export', { headers: { host } });
  const data = JSON.parse(
    new TextDecoder().decode(
      readZip(new Uint8Array(await zip.arrayBuffer())).find((f) => f.name === 'data.json')?.data,
    ),
  );
  expect(data.manualMilestones).toHaveLength(2);
});
it('rejects stale edits, cross-project IDs, invalid dates and secrets without partial replacement', async () => {
  const original = body();
  await req('/api/projects/demo.manual/manual', 'PUT', original);
  const stored = manualMilestones(db, 'demo.manual');
  expect((await req('/api/projects/demo.manual/manual', 'PUT', original)).status).toBe(409);
  expect(
    (
      await req('/api/projects/demo.manual/manual', 'PUT', {
        ...body(),
        milestones: [{ id: 999, title: 'other', status: 'done' }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await req('/api/projects/demo.manual/manual', 'PUT', { ...body(), keyDate: '2026-02-30' })).status,
  ).toBe(400);
  const secret = ['ghp_', 'a'.repeat(40)].join('');
  const r = await req('/api/projects/demo.manual/manual', 'PUT', { ...body(), workingOn: secret });
  expect(r.status).toBe(400);
  expect(await r.text()).not.toContain(secret);
  expect(manualMilestones(db, 'demo.manual')).toEqual(stored);
});
it('does not admit protocol snapshots for manual projects or manual writes for protocol projects', async () => {
  expect(registry(db).some((p) => p.id === 'demo.manual')).toBe(false);
  const s = JSON.parse(
    readFileSync(join(REPO_ROOT, 'fixtures', 'protocol', 'history', 't1-base.json'), 'utf8'),
  );
  s.project_id = 'demo.manual';
  const r = await req('/api/imports', 'POST', {
    files: [{ name: 'demo.json', base64: Buffer.from(JSON.stringify(s)).toString('base64') }],
  });
  expect(((await r.json()) as { results: { outcome: string }[] }).results[0]?.outcome).toBe('rejected');
  expect((await req('/api/projects/morii.dashboard/manual', 'PUT', body())).status).toBe(400);
});
it('validates project metadata and retains core IDs independently of current reports', async () => {
  const patch = {
    nameJa: 'デモ',
    nameEn: 'Demo',
    category: 'creation',
    priority: 'focus',
    attention: 'waiting',
    repositoryUrl: 'https://example.org/repository',
    coreMilestones: ['missing'],
    agentAssignments: [{ agent: 'codex', scope: '前端' }],
  };
  expect((await req('/api/projects/demo.manual', 'PATCH', patch)).status).toBe(200);
  expect(getProject(db, 'demo.manual')).toMatchObject(patch);
  expect(
    (await req('/api/projects/demo.manual', 'PATCH', { attention: 'paused', attentionNote: '等待新的素材' }))
      .status,
  ).toBe(200);
  expect(getProject(db, 'demo.manual')).toMatchObject({ attention: 'paused', attentionNote: '等待新的素材' });
  expect(
    (await req('/api/projects/demo.manual', 'PATCH', { expectedUpdatedAt: 'stale', name: 'overwrite' }))
      .status,
  ).toBe(409);
  expect((await req('/api/projects/demo.manual', 'PATCH', { websiteUrl: 'http://example.org' })).status).toBe(
    400,
  );
  expect(
    (await req('/api/projects/demo.manual', 'PATCH', { websiteUrl: 'https://user:pass@example.org' })).status,
  ).toBe(400);
  expect((await req('/api/projects/demo.manual', 'PATCH', { category: 'other' })).status).toBe(400);
});
