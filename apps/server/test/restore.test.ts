import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll, exportSnapshots } from '../src/export.ts';
import { readFocus, saveFocus } from '../src/focus.ts';
import { trashSnapshot } from '../src/history.ts';
import { commitImport, undoImport } from '../src/imports.ts';
import { saveItemState } from '../src/items.ts';
import { saveManual } from '../src/manual.ts';
import { createProject, getProject } from '../src/projects.ts';
import { buildRestoredDatabase } from '../src/restore/build.ts';
import { runRestore } from '../src/restore/command.ts';
import { saveAcceptance } from '../src/review.ts';
import { currentSnapshot } from '../src/snapshots.ts';
import { getTask, saveTask } from '../src/tasks.ts';
import { getWork, saveCover, saveWork, trashWork } from '../src/works.ts';
import { createZip, readZip, type ZipEntry } from '../src/zip.ts';

const now = new Date('2026-10-16T01:00:00.000Z');
let db: Database;
let dir: string;
const fixture = (file: string) => readFileSync(join(REPO_ROOT, 'fixtures/protocol/history', file));
const file = (name: string, extra = {}) => ({ name, base64: fixture(name).toString('base64'), ...extra });
const pack = () => exportAll(db, now, 'test');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const mutate = (zip: Uint8Array, name: string, change: (value: Record<string, unknown>) => void) =>
  createZip(
    readZip(zip).map((e) => {
      if (e.name !== name) return e;
      const value = JSON.parse(Buffer.from(e.data).toString());
      change(value);
      return { ...e, data: json(value) };
    }),
    now,
  );
beforeEach(async () => {
  db = openDatabase(':memory:');
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
  db.exec('DELETE FROM projects');
  createProject(db, { id: 'demo.beta', name: 'Demo Beta' }, now);
  createProject(db, { id: 'demo.manual', name: '虚构生活计划', tracking: 'manual' }, now);
  dir = mkdtempSync(join(tmpdir(), 'dashboard-restore-test-'));
  await commitImport(db, [file('t0-older.json'), file('t1-base.json'), file('t2-newer.json')], now);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

it('round trips projects, raw history, human records, tasks, focus, covers and trash with the same IDs', async () => {
  const current = currentSnapshot(db, 'demo.beta');
  if (!current) throw new Error('missing fixture');
  const task = saveTask(
    db,
    null,
    { projectId: 'demo.beta', sourceSnapshotId: current.id, actionIndex: 0 },
    now,
  );
  saveTask(db, task.id, { revision: task.revision, title: '人类编辑过的任务', status: 'doing' }, now);
  saveFocus(
    db,
    '2026-10-16',
    {
      revision: 0,
      energy: 'low',
      entries: [
        { id: 'linked', title: task.title, lang: task.lang, taskId: task.id, done: false },
        { id: 'manual', title: '休息与整理', lang: 'zh-Hans', done: true },
      ],
    },
    now,
  );
  saveAcceptance(
    db,
    'demo.beta',
    'core',
    { snapshotId: current.id, status: 'accepted', note: '虚构验收记录' },
    now,
  );
  saveItemState(
    db,
    'demo.beta',
    'needs_morii',
    'id:hero-images',
    { snapshotId: current.id, status: 'later', dueDate: '2026-10-20' },
    now,
  );
  saveManual(
    db,
    'demo.manual',
    {
      updatedAt: getProject(db, 'demo.manual')?.updatedAt,
      workingOn: '整理',
      nextStep: '完成',
      keyDate: '2026-10-20',
      keyDateLabel: '目标',
      lang: 'ja',
      milestones: [{ title: '架空の予定', status: 'done', targetDate: null }],
    },
    now,
  );
  const w = saveWork(
    db,
    null,
    {
      title: '虚构照片',
      lang: 'ja',
      kind: 'photos',
      date: '2026-10-16',
      projectId: 'demo.manual',
      link: 'https://example.com/demo',
    },
    now,
  );
  saveCover(db, w.id, w.revision, readFileSync(join(REPO_ROOT, 'fixtures/media/demo-cover.webp')), now);
  trashWork(db, w.id, getWork(db, w.id)?.revision, now);
  await commitImport(
    db,
    [file('t1-same-instant-different.json', { conflict: 'replace', reporter: 'claude' })],
    now,
  );
  const trashId = db.prepare('SELECT MIN(id) AS id FROM status_snapshots').get()?.id as number;
  trashSnapshot(db, trashId, now);
  const restored = await buildRestoredDatabase(pack(), now);
  try {
    for (const table of [
      'projects',
      'import_batches',
      'acceptance_records',
      'item_states',
      'manual_milestones',
      'tasks',
      'works',
      'work_covers',
      'status_snapshots',
    ]) {
      expect(restored.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).toEqual(
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
    }
    expect(readFocus(restored.db, now)).toEqual(readFocus(db, now));
    expect(getTask(restored.db, task.id)).toEqual(getTask(db, task.id));
    expect(restored.db.prepare('SELECT action FROM audit_log').all()).toEqual([{ action: 'data.restore' }]);
    const again = readZip(exportAll(restored.db, now, 'test'));
    expect(again).toEqual(readZip(pack()));
    const batch = restored.db.prepare('SELECT MAX(id) AS id FROM import_batches').get()?.id as number;
    expect(undoImport(restored.db, batch, now).removed).toBe(1);
  } finally {
    restored.db.close();
  }
});

it('reads earlier format-1 packages without the newly added batchId and reporter.note fields', async () => {
  const zip = mutate(pack(), 'data.json', (data) => {
    for (const s of data.snapshots as Record<string, unknown>[]) {
      delete s.batchId;
      delete (s.reporter as Record<string, unknown>).note;
    }
  });
  const restored = await buildRestoredDatabase(zip, now);
  try {
    expect(restored.db.prepare('SELECT batch_id,reporter_note FROM status_snapshots').all()).toEqual(
      db.prepare('SELECT batch_id,reporter_note FROM status_snapshots').all(),
    );
  } finally {
    restored.db.close();
  }
});

it('preserves BOM and explicitly extracted code-fence raw bytes, and keeps expired focus off today', async () => {
  for (const [index, encode] of [
    (s: string) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s)]),
    (s: string) => Buffer.from(`\`\`\`json\n${s}\n\`\`\``),
  ].entries()) {
    const value = JSON.parse(fixture('t1-base.json').toString()) as Record<string, unknown>;
    value.snapshot_at = `2026-10-${10 + index}T10:00:00+08:00`;
    await commitImport(
      db,
      [
        {
          name: `encoded-${index}.json`,
          base64: encode(JSON.stringify(value)).toString('base64'),
          codeFence: 'extract',
        },
      ],
      now,
    );
  }
  saveFocus(
    db,
    '2026-10-16',
    {
      revision: 0,
      energy: 'rest',
      entries: [{ id: 'rest', title: '虚构休息安排', lang: 'zh-Hans', done: false }],
    },
    now,
  );
  const tomorrow = new Date('2026-10-17T01:00:00.000Z');
  const restored = await buildRestoredDatabase(pack(), tomorrow);
  try {
    expect(restored.db.prepare('SELECT raw FROM status_snapshots ORDER BY id').all()).toEqual(
      db.prepare('SELECT raw FROM status_snapshots ORDER BY id').all(),
    );
    expect(readFocus(restored.db, tomorrow)).toMatchObject({
      date: '2026-10-17',
      entries: [],
      energy: null,
      revision: 0,
    });
  } finally {
    restored.db.close();
  }
});

it('rejects a corrupted cover even when its ZIP CRC has been recomputed', async () => {
  const w = saveWork(db, null, { title: '虚构封面', lang: 'en', kind: 'other', date: '2026-10-16' }, now);
  saveCover(db, w.id, w.revision, readFileSync(join(REPO_ROOT, 'fixtures/media/demo-cover.webp')), now);
  const bad = createZip(
    readZip(pack()).map((e) =>
      e.name.startsWith('media/') ? { ...e, data: Buffer.from('invalid image') } : e,
    ),
    now,
  );
  await expect(buildRestoredDatabase(bad, now)).rejects.toThrow('invalid_cover');
});

it('checks without touching disk and applies once into a new directory without starting a service', async () => {
  const zip = join(dir, 'export.zip');
  writeFileSync(zip, pack());
  const before = readdirSync(dir);
  const log: string[] = [];
  await runRestore(['--check', zip], (s) => log.push(s));
  expect(readdirSync(dir)).toEqual(before);
  const target = join(dir, 'new-instance');
  await runRestore(['--apply', zip, '--target', target], (s) => log.push(s));
  expect(readdirSync(target)).toEqual(['dashboard.sqlite']);
  const restored = openDatabase(join(target, 'dashboard.sqlite'));
  try {
    expect(restored.prepare('SELECT raw,raw_fingerprint FROM status_snapshots').all()).toEqual(
      db.prepare('SELECT raw,raw_fingerprint FROM status_snapshots').all(),
    );
  } finally {
    restored.close();
  }
  expect(JSON.parse(log.at(-1) ?? '{}')).toMatchObject({ status: 'restored', serviceStarted: false });
  const sentinel = readFileSync(join(target, 'dashboard.sqlite'));
  await expect(runRestore(['--apply', zip, '--target', target], () => {})).rejects.toThrow();
  expect(readFileSync(join(target, 'dashboard.sqlite'))).toEqual(sentinel);
  const empty = join(dir, 'empty');
  mkdirSync(empty);
  await expect(runRestore(['--apply', zip, '--target', empty], () => {})).rejects.toThrow();
  expect(readdirSync(empty)).toEqual([]);
});

// Keep each native process independently bounded; do not accumulate four cold starts
// under a single Vitest deadline. CI diagnostics contain fixed labels and numbers only.
it.each(['check', 'apply', 'invalid_archive', 'missing_target'] as const)(
  'documented restore CLI: %s returns stable codes without leaking package contents',
  (scenario) => {
    const zip = join(dir, 'export.zip');
    writeFileSync(zip, scenario === 'invalid_archive' ? 'private synthetic invalid package' : pack());
    const args =
      scenario === 'apply'
        ? ['--apply', zip, '--target', join(dir, 'cli-instance')]
        : scenario === 'missing_target'
          ? ['--apply', zip]
          : ['--check', zip];
    const started = performance.now();
    const result = spawnSync(process.execPath, ['apps/server/src/restore/command.ts', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    if (process.env.CI)
      console.info(
        JSON.stringify({
          check: 'synthetic_restore_cli',
          scenario,
          elapsed_ms: Math.round(performance.now() - started),
          status: result.status,
          error: (result.error as NodeJS.ErrnoException | undefined)?.code ?? null,
        }),
      );
    expect(result.error).toBeUndefined();
    if (scenario === 'check') {
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        status: 'checked',
        counts: { projects: 2, snapshots: 3 },
      });
    } else if (scenario === 'apply') {
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')).toMatchObject({
        status: 'restored',
        serviceStarted: false,
      });
    } else {
      expect(result.status).toBe(1);
      if (scenario === 'invalid_archive') {
        expect(result.stderr).toContain('zip_end');
        expect(result.stderr).not.toContain('private synthetic');
        expect(result.stderr).not.toContain(dir);
      }
    }
  },
  20_000,
);

it('refuses invalid mode, relative, repository and sync-folder targets, and corrupt packages create no destination', async () => {
  const zip = join(dir, 'export.zip');
  writeFileSync(zip, pack());
  for (const args of [
    [],
    ['--apply', zip],
    ['--apply', zip, '--target', 'relative'],
    ['--apply', zip, '--target', join(REPO_ROOT, 'forbidden-data')],
  ])
    await expect(runRestore(args, () => {})).rejects.toThrow();
  const sync = join(dir, 'OneDrive');
  mkdirSync(sync);
  await expect(runRestore(['--apply', zip, '--target', join(sync, 'forbidden')], () => {})).rejects.toThrow();
  writeFileSync(zip, new Uint8Array(24));
  const target = join(dir, 'failed');
  await expect(runRestore(['--apply', zip, '--target', target], () => {})).rejects.toThrow();
  expect(existsSync(target)).toBe(false);
});

it('refuses existing directory links and resolves parent aliases before repository checks', async () => {
  const zip = join(dir, 'export.zip');
  writeFileSync(zip, pack());
  const owner = join(dir, 'owner');
  mkdirSync(owner);
  writeFileSync(join(owner, 'owner.txt'), 'preserve');
  const alias = join(dir, 'alias');
  symlinkSync(owner, alias, 'junction');
  await expect(runRestore(['--apply', zip, '--target', alias], () => {})).rejects.toThrow();
  expect(readdirSync(owner)).toEqual(['owner.txt']);
  const repoAlias = join(dir, 'repo-alias');
  symlinkSync(REPO_ROOT, repoAlias, 'junction');
  await expect(
    runRestore(['--apply', zip, '--target', join(repoAlias, 'forbidden-data')], () => {}),
  ).rejects.toThrow();
});

describe('untrusted exports', () => {
  it.each([
    ['manifest.json', 'exportFormat', 99],
    ['manifest.json', 'counts.snapshots', 4],
    ['data.json', 'snapshots.0.rawFingerprint', '0'.repeat(64)],
    ['data.json', 'snapshots.0.contentFingerprint', '0'.repeat(64)],
    ['data.json', 'snapshots.0.supersededBy', 999],
    ['data.json', 'snapshots.0.batchId', 999],
    ['data.json', 'projects.0.websiteUrl', 'javascript:alert(1)'],
    ['data.json', 'projects.0.freshnessDays', true],
    ['data.json', 'projects.0.name', `demo${String.fromCodePoint(0x202e)}`],
    ['data.json', 'tasks', {}],
    ['data.json', 'tasks', null],
    ['data.json', 'tasks', [{ id: 1 }]],
    ['data.json', 'focus.entries', [{ id: 'x', title: 'x', lang: 'en', done: false, taskId: 999 }]],
    ['data.json', 'importBatches.0.results.0.projectId', 'demo.manual'],
    ['data.json', 'projects.0.workingOn', ['ghp_', 'x'.repeat(40)].join('')],
  ] satisfies [string, string, unknown][])(
    'rejects malformed metadata case %#',
    async (name, path, value) => {
      const changed = mutate(pack(), name, (data) => {
        const parts = path.split('.');
        let parent: Record<string, unknown> = data;
        for (const part of parts.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
        parent[parts.at(-1) as string] = value;
      });
      await expect(buildRestoredDatabase(changed, now)).rejects.toThrow();
    },
  );
  it('rejects missing, extra, repeated, traversal, aliased and raw-only archive entries', async () => {
    const entries = readZip(pack());
    const first = entries[0] as ZipEntry;
    for (const changed of [
      entries.slice(1),
      [...entries, first],
      [...entries, { name: '../escape', data: json({}) }],
      [...entries, { name: 'MANIFEST.JSON', data: first.data }],
      [...entries, { name: 'extra', data: json({}) }],
    ])
      await expect(buildRestoredDatabase(createZip(changed, now), now)).rejects.toThrow();
    await expect(buildRestoredDatabase(exportSnapshots(db, now), now)).rejects.toThrow();
  });
});
