/**
 * 导入（P3.3，04 第 3 到 8 节）：预览和写入用同一套代码。
 *
 * 预览不写数据库；写入时服务端把每个文件从头再检查一遍，不信任预览的结论。
 * 同一批里同一项目的多份按 snapshot_at 从早到晚依次定位，最晚的那份成为当前状态。
 * 每个文件在自己的事务里写入，一个失败不影响其他。只保存文件名，不保存路径。
 */
import {
  type Attribution,
  type CheckResult,
  checkSnapshot,
  diffSnapshots,
  formatFixPrompt,
  formatIssue,
  type Issue,
  type Normalization,
  orderForImport,
  placeSnapshot,
  type ReporterAgent,
  type Snapshot,
  type SnapshotDiff,
} from '@moriium-dashboard/protocol';
import { audit } from './audit.ts';
import { type Database, transaction } from './db.ts';
import { getProject, registry } from './projects.ts';
import {
  currentSnapshot,
  existingFor,
  getBrief,
  insertSnapshot,
  markSuperseded,
  type Reporter,
  reporterFrom,
  type SnapshotBrief,
} from './snapshots.ts';

export const MAX_FILES = 20;
const MAX_FILE_BYTES = 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export interface ImportFile {
  name: string;
  base64: string;
  /** 文件被 Markdown 代码块包着时，Morii 选了提取。 */
  codeFence?: 'extract';
  /** 从某个项目页导入时期望的项目。 */
  expectedProjectId?: string;
  /** Morii 改过的报告归属；none 表示「未注明」。 */
  reporter?: ReporterAgent | 'none';
  /** 同一时刻冲突时 Morii 选了替换。 */
  conflict?: 'replace';
}

/** 给界面显示的问题：协议包的中文说明加上 JSON Pointer。 */
export interface ShownIssue {
  code: string;
  severity: 'error' | 'warning';
  pointer: string;
  line?: number;
  location: string;
  problem: string;
  received?: string;
  fix?: string;
}

export type PlacementView =
  | { kind: 'latest'; replaces: SnapshotBrief | null }
  /** inBatch：比同一批里同一项目的另一份早（那份会成为最新）。 */
  | { kind: 'history'; currentLatest: SnapshotBrief | null; inBatch: boolean }
  | { kind: 'duplicate'; of: SnapshotBrief | null; deleted: boolean; inBatch: boolean }
  | { kind: 'conflict'; with: SnapshotBrief | null; inBatch: boolean };

export type FilePreview =
  | { status: 'needs_choice'; fileName: string; choice: 'code_fence' }
  | { status: 'rejected'; fileName: string; errors: ShownIssue[]; warnings: ShownIssue[]; fixPrompt: string }
  | {
      status: 'accepted';
      fileName: string;
      projectId: string;
      projectName: string;
      snapshotAt: string;
      utcMs: number;
      offsetMinutes: number;
      stage: Snapshot['stage'];
      attribution: Attribution;
      warnings: ShownIssue[];
      normalizationCount: number;
      placement: PlacementView;
      diff: SnapshotDiff | null;
    };

export type FileOutcome =
  | {
      fileName: string;
      outcome: 'imported';
      projectId: string;
      snapshotId: number;
      placement: 'latest' | 'history' | 'replaced';
    }
  | {
      fileName: string;
      outcome: 'skipped';
      projectId: string;
      reason: 'duplicate' | 'conflict';
      existingId: number | null;
    }
  | { fileName: string; outcome: 'rejected' | 'needs_choice' };

export class ImportError extends Error {
  readonly code: 'invalid_request' | 'too_many_files' | 'not_found' | 'already_undone';
  constructor(code: ImportError['code']) {
    super(code);
    this.code = code;
  }
}

/** 只留文件名：去掉任何目录部分和控制字符，限制长度。 */
export function safeFileName(name: unknown): string {
  const raw = typeof name === 'string' ? name : '';
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = [...base]
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= 0x20 && cp !== 0x7f && !(cp >= 0x202a && cp <= 0x202e) && !(cp >= 0x2066 && cp <= 0x2069);
    })
    .join('')
    .slice(0, 120)
    .trim();
  return cleaned || 'project-status.json';
}

export function parseImportFiles(body: Record<string, unknown>): ImportFile[] {
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) throw new ImportError('invalid_request');
  if (files.length > MAX_FILES) throw new ImportError('too_many_files');
  return files.map((f) => {
    if (f === null || typeof f !== 'object') throw new ImportError('invalid_request');
    const o = f as Record<string, unknown>;
    if (
      typeof o.base64 !== 'string' ||
      !BASE64.test(o.base64) ||
      o.base64.length > ((MAX_FILE_BYTES + 3) / 3) * 4 + 4
    ) {
      throw new ImportError('invalid_request');
    }
    const file: ImportFile = { name: safeFileName(o.name), base64: o.base64 };
    if (o.codeFence === 'extract') file.codeFence = 'extract';
    if (typeof o.expectedProjectId === 'string' && o.expectedProjectId)
      file.expectedProjectId = o.expectedProjectId;
    if (
      o.reporter === 'claude' ||
      o.reporter === 'codex' ||
      o.reporter === 'other' ||
      o.reporter === 'none'
    ) {
      file.reporter = o.reporter;
    }
    if (o.conflict === 'replace') file.conflict = 'replace';
    return file;
  });
}

const pointer = (path: readonly (string | number)[]) =>
  path.length === 0
    ? ''
    : `/${path.map((p) => String(p).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;

function show(issue: Issue): ShownIssue {
  const f = formatIssue(issue);
  return {
    code: issue.code,
    severity: issue.severity,
    pointer: pointer(issue.path),
    ...(issue.line !== undefined ? { line: issue.line } : {}),
    location: f.location,
    problem: f.problem,
    ...(f.received !== undefined ? { received: f.received } : {}),
    ...(f.fix !== undefined ? { fix: f.fix } : {}),
  };
}

interface Checked {
  index: number;
  file: ImportFile;
  bytes: Uint8Array;
  result: CheckResult;
}

async function checkAll(db: Database, files: ImportFile[], now: Date): Promise<Checked[]> {
  const reg = registry(db);
  const out: Checked[] = [];
  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(Buffer.from(file.base64, 'base64'));
    const result = await checkSnapshot(bytes, {
      registry: reg,
      now,
      ...(file.expectedProjectId ? { expectedProjectId: file.expectedProjectId } : {}),
      ...(file.codeFence ? { codeFence: file.codeFence } : {}),
    });
    out.push({ index, file, bytes, result });
  }
  return out;
}

/** 通过检查的文件按项目分组、按时间排序：同一批里的多份依次定位。 */
function acceptedInOrder(checked: Checked[]) {
  const accepted = checked.flatMap((c) =>
    c.result.kind === 'accepted'
      ? [{ ...c, result: c.result, snapshotAtUtcMs: c.result.meta.snapshotAtUtcMs }]
      : [],
  );
  return orderForImport(accepted);
}

export async function previewImport(db: Database, files: ImportFile[], now: Date): Promise<FilePreview[]> {
  const checked = await checkAll(db, files, now);
  const previews: FilePreview[] = checked.map((c) => {
    if (c.result.kind === 'needs_choice')
      return { status: 'needs_choice', fileName: c.file.name, choice: 'code_fence' };
    if (c.result.kind === 'rejected') {
      return {
        status: 'rejected',
        fileName: c.file.name,
        errors: c.result.errors.map(show),
        warnings: c.result.warnings.map(show),
        fixPrompt: formatFixPrompt(c.result.errors, { schemaVersion: c.result.schemaVersion }),
      };
    }
    return null as unknown as FilePreview; // 下面按时间顺序补上
  });

  // 同一批里已经「排进去」的文件，当作虚拟的已有快照参与后面文件的定位。
  const virtual = new Map<
    string,
    { id: string; snapshotAtUtcMs: number; contentFingerprint: string; deleted: false; superseded: boolean }[]
  >();
  for (const c of acceptedInOrder(checked)) {
    const { snapshot, meta } = c.result;
    const pid = snapshot.project_id;
    const existing = existingFor(db, pid);
    const batch = virtual.get(pid) ?? [];
    const placement = placeSnapshot(
      { snapshotAtUtcMs: meta.snapshotAtUtcMs, contentFingerprint: meta.contentFingerprint },
      [...existing, ...batch],
    );
    const brief = (id: string | null): SnapshotBrief | null =>
      id === null || id.startsWith('batch:') ? null : (getBrief(db, Number(id)) ?? null);
    let view: PlacementView;
    switch (placement.kind) {
      case 'latest':
        view = { kind: 'latest', replaces: brief(placement.replaces) };
        break;
      case 'history':
        view = {
          kind: 'history',
          currentLatest: brief(placement.currentLatest),
          inBatch: placement.currentLatest.startsWith('batch:'),
        };
        break;
      case 'duplicate':
        view = {
          kind: 'duplicate',
          of: brief(placement.of),
          deleted: placement.deleted,
          inBatch: placement.of.startsWith('batch:'),
        };
        break;
      case 'conflict':
        view = {
          kind: 'conflict',
          with: brief(placement.with),
          inBatch: placement.with.startsWith('batch:'),
        };
        break;
    }
    if (
      placement.kind === 'latest' ||
      placement.kind === 'history' ||
      (placement.kind === 'conflict' && c.file.conflict === 'replace')
    ) {
      batch.push({
        id: `batch:${c.index}`,
        snapshotAtUtcMs: meta.snapshotAtUtcMs,
        contentFingerprint: meta.contentFingerprint,
        deleted: false,
        superseded: false,
      });
      virtual.set(pid, batch);
    }
    // 差异只和当前最新比（04 第 3 节第 8 步），重复的不比。
    const current = placement.kind === 'duplicate' ? undefined : currentSnapshot(db, pid);
    previews[c.index] = {
      status: 'accepted',
      fileName: c.file.name,
      projectId: pid,
      projectName: getProject(db, pid)?.name ?? snapshot.project_name,
      snapshotAt: snapshot.snapshot_at,
      utcMs: meta.snapshotAtUtcMs,
      offsetMinutes: meta.snapshotAtOffsetMinutes,
      stage: snapshot.stage,
      attribution: meta.attribution,
      warnings: c.result.warnings.map(show),
      normalizationCount: c.result.normalizations.length,
      placement: view,
      diff: current ? diffSnapshots(current.snapshot, snapshot) : null,
    };
  }
  // 同一批里同一项目有多份「成为最新」时，只有最晚的那份真正成为最新，其余只进历史；
  // 最晚那份要替换的是库里现在的最新（不是同一批里的虚拟条目）。
  const lastLatest = new Map<string, number>();
  for (const [i, pv] of previews.entries()) {
    if (pv?.status !== 'accepted' || pv.placement.kind !== 'latest') continue;
    const prev = lastLatest.get(pv.projectId);
    const prevPv = prev === undefined ? undefined : previews[prev];
    if (!prevPv || (prevPv.status === 'accepted' && pv.utcMs > prevPv.utcMs)) lastLatest.set(pv.projectId, i);
  }
  for (const [i, pv] of previews.entries()) {
    if (pv?.status !== 'accepted' || pv.placement.kind !== 'latest') continue;
    if (lastLatest.get(pv.projectId) !== i) {
      pv.placement = { kind: 'history', currentLatest: null, inBatch: true };
    } else {
      const cur = currentSnapshot(db, pv.projectId);
      pv.placement = { kind: 'latest', replaces: cur ? (getBrief(db, cur.id) ?? null) : null };
    }
  }
  return previews;
}

function chosenReporter(file: ImportFile, attribution: Attribution): Reporter {
  if (file.reporter === undefined) return reporterFrom(attribution);
  return { agent: file.reporter === 'none' ? null : file.reporter, source: 'chosen', note: attribution.note };
}

export async function commitImport(
  db: Database,
  files: ImportFile[],
  now: Date,
): Promise<{ batchId: number; results: FileOutcome[] }> {
  const checked = await checkAll(db, files, now);
  const at = now.toISOString();
  const results: FileOutcome[] = checked.map((c) =>
    c.result.kind === 'accepted'
      ? (null as unknown as FileOutcome)
      : { fileName: c.file.name, outcome: c.result.kind === 'needs_choice' ? 'needs_choice' : 'rejected' },
  );

  const batchId = Number(
    db
      .prepare(
        'INSERT INTO import_batches (at, file_count, imported_count, skipped_count, results) VALUES (?, ?, 0, 0, ?)',
      )
      .run(at, files.length, '[]').lastInsertRowid,
  );

  for (const c of acceptedInOrder(checked)) {
    const { snapshot, meta, warnings, normalizations } = c.result;
    const pid = snapshot.project_id;
    results[c.index] = transaction(db, (): FileOutcome => {
      const placement = placeSnapshot(
        { snapshotAtUtcMs: meta.snapshotAtUtcMs, contentFingerprint: meta.contentFingerprint },
        existingFor(db, pid),
      );
      if (placement.kind === 'duplicate') {
        return {
          fileName: c.file.name,
          outcome: 'skipped',
          projectId: pid,
          reason: 'duplicate',
          existingId: Number(placement.of),
        };
      }
      if (placement.kind === 'conflict' && c.file.conflict !== 'replace') {
        return {
          fileName: c.file.name,
          outcome: 'skipped',
          projectId: pid,
          reason: 'conflict',
          existingId: Number(placement.with),
        };
      }
      const id = insertSnapshot(db, {
        projectId: pid,
        snapshotAt: snapshot.snapshot_at,
        utcMs: meta.snapshotAtUtcMs,
        offsetMinutes: meta.snapshotAtOffsetMinutes,
        schemaVersion: meta.schemaVersion,
        validatedAs: meta.validatedAs,
        rulesVersion: meta.rulesVersion,
        contentFingerprint: meta.contentFingerprint,
        rawFingerprint: meta.rawFingerprint,
        raw: c.bytes,
        snapshot,
        warnings: warnings as Issue[],
        normalizations: normalizations as Normalization[],
        reporter: chosenReporter(c.file, meta.attribution),
        batchId,
        fileName: c.file.name,
        importedAt: at,
      });
      if (placement.kind === 'conflict') markSuperseded(db, Number(placement.with), id);
      return {
        fileName: c.file.name,
        outcome: 'imported',
        projectId: pid,
        snapshotId: id,
        placement: placement.kind === 'conflict' ? 'replaced' : placement.kind,
      };
    });
  }

  // 和预览一致：同一批里同一项目先后成为最新的几份，只有最晚的那份算「成为最新」。
  const lastLatestIdx = new Map<string, number>();
  const timeOf = (i: number) => {
    const c = checked[i]?.result;
    return c?.kind === 'accepted' ? c.meta.snapshotAtUtcMs : 0;
  };
  for (const [i, r] of results.entries()) {
    if (r.outcome !== 'imported' || r.placement !== 'latest') continue;
    const prev = lastLatestIdx.get(r.projectId);
    if (prev === undefined || timeOf(i) > timeOf(prev)) lastLatestIdx.set(r.projectId, i);
  }
  for (const [i, r] of results.entries()) {
    if (r.outcome === 'imported' && r.placement === 'latest' && lastLatestIdx.get(r.projectId) !== i) {
      results[i] = { ...r, placement: 'history' };
    }
  }

  const imported = results.filter((r) => r.outcome === 'imported').length;
  transaction(db, () => {
    db.prepare(
      'UPDATE import_batches SET imported_count = ?, skipped_count = ?, results = ? WHERE id = ?',
    ).run(imported, results.length - imported, JSON.stringify(results), batchId);
    const skipped = results
      .filter((r) => r.outcome !== 'imported')
      .map((r) => `${r.fileName}（${r.outcome === 'skipped' ? r.reason : r.outcome}）`);
    audit(
      db,
      'import',
      String(batchId),
      `导入 ${imported} 份快照${skipped.length ? `；跳过 ${skipped.join('、')}` : ''}`,
      now,
    );
  });
  return { batchId, results };
}

/** 撤销一次导入：本批快照移入回收站，被它们替换的版本恢复，当前状态随之回退（04 第 8 节）。 */
export function undoImport(db: Database, batchId: number, now: Date): { removed: number } {
  return transaction(db, () => {
    const batch = db.prepare('SELECT id, undone_at FROM import_batches WHERE id = ?').get(batchId) as
      | { id: number; undone_at: string | null }
      | undefined;
    if (!batch) throw new ImportError('not_found');
    if (batch.undone_at) throw new ImportError('already_undone');
    const at = now.toISOString();
    const ids = (
      db
        .prepare('SELECT id FROM status_snapshots WHERE batch_id = ? AND deleted_at IS NULL')
        .all(batchId) as { id: number }[]
    ).map((r) => r.id);
    for (const id of ids) {
      db.prepare('UPDATE status_snapshots SET superseded_by = NULL WHERE superseded_by = ?').run(id);
      db.prepare('UPDATE status_snapshots SET deleted_at = ? WHERE id = ?').run(at, id);
    }
    db.prepare('UPDATE import_batches SET undone_at = ? WHERE id = ?').run(at, batchId);
    audit(db, 'import.undo', String(batchId), `撤销导入，${ids.length} 份快照移入回收站`, now);
    return { removed: ids.length };
  });
}

export interface BatchView {
  id: number;
  at: string;
  fileCount: number;
  importedCount: number;
  skippedCount: number;
  undoneAt: string | null;
  results: FileOutcome[];
}

export function listBatches(db: Database, limit = 100): BatchView[] {
  const rows = db.prepare('SELECT * FROM import_batches ORDER BY id DESC LIMIT ?').all(limit) as {
    id: number;
    at: string;
    file_count: number;
    imported_count: number;
    skipped_count: number;
    undone_at: string | null;
    results: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    fileCount: r.file_count,
    importedCount: r.imported_count,
    skippedCount: r.skipped_count,
    undoneAt: r.undone_at,
    results: JSON.parse(r.results) as FileOutcome[],
  }));
}
