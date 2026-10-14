import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { agentReports } from '../src/agents.ts';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';

let db: Database;
const now = new Date('2026-10-14T00:00:00Z');
const host = '127.0.0.1:5180';
const headers = {
  host,
  origin: `http://${host}`,
  'x-moriium-dashboard': '1',
  'content-type': 'application/json',
};
const base = JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures/protocol/history/t1-base.json'), 'utf8'));
async function add(at: string, agent: string | null = 'codex') {
  const s = structuredClone(base);
  s.snapshot_at = at;
  s.schema_version = '1.1';
  s.source.branch = agent ? `${agent}/demo` : null;
  if (agent) s.reporter = { agent };
  else delete s.reporter;
  const app = createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [`http://${host}`], backupDir: '.' },
    startedAt: now,
    version: 'test',
    now: () => now,
  });
  const r = await app.request('/api/imports', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      files: [{ name: 'demo.json', base64: Buffer.from(JSON.stringify(s)).toString('base64') }],
    }),
  });
  expect(r.status).toBe(201);
  const data = (await r.json()) as { results: { snapshotId: number }[] };
  return data.results[0]?.snapshotId as number;
}
beforeEach(() => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
  db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES('demo.beta','Demo','x','x')").run();
});
afterEach(() => db.close());

it('keeps report chronology separate from import order and deduplicates current milestone counts', async () => {
  const newer = await add('2026-10-13T10:00:00+08:00');
  const older = await add('2026-10-12T10:00:00+08:00');
  const data = agentReports(db, now);
  expect(data.agents.find((a) => a.agent === 'codex')?.count30).toBe(2);
  expect(data.reports.find((r) => r.id === newer)?.previousId).toBe(older);
  expect(data.reports.find((r) => r.id === older)?.changes).toBeNull();
  const done = base.milestones.filter((m: { status: string }) => m.status === 'done').length;
  const evidence = data.agents[0]?.evidence;
  expect(
    (evidence?.repository ?? 0) +
      (evidence?.existingTest ?? 0) +
      (evidence?.self ?? 0) +
      (evidence?.unknown ?? 0),
  ).toBe(done);
});
it('does not treat a claimed acceptance as a manual acceptance and excludes archived reports', async () => {
  const id = await add('2026-10-13T10:00:00+08:00');
  expect(agentReports(db, now).agents[0]?.evidence.accepted).toBe(0);
  db.prepare('UPDATE status_snapshots SET deleted_at = ? WHERE id = ?').run(now.toISOString(), id);
  expect(agentReports(db, now).reports).toEqual([]);
  expect(agentReports(db, now).agents[0]?.latest).toBeNull();
});
it('keeps unknown sources distinct and compares across reporter changes', async () => {
  const older = await add('2026-10-12T10:00:00+08:00', null);
  const newer = await add('2026-10-13T10:00:00+08:00', 'claude');
  expect(agentReports(db, now).agents.find((a) => a.agent === null)?.count30).toBe(1);
  expect(agentReports(db, now).reports.find((r) => r.id === newer)?.previousId).toBe(older);
  db.prepare('UPDATE status_snapshots SET superseded_by = ? WHERE id = ?').run(newer, older);
  expect(agentReports(db, now).reports).toHaveLength(1);
  expect(agentReports(db, now).reports[0]?.previousId).toBeNull();
});
