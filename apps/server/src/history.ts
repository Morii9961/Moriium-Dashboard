/**
 * 历史（P3.4，04 第 10 节）：历史列表、任选两份对比、删除（移入回收站）与恢复。
 * 删除是软删除；删除最新一份时，当前状态自动回到上一份（当前状态按查询得出，不存冗余字段）。
 */
import { diffSnapshots, type SnapshotDiff } from '@moriium-dashboard/protocol';
import { audit } from './audit.ts';
import { type Database, transaction } from './db.ts';
import { getSnapshot, type Reporter, type SnapshotBrief } from './snapshots.ts';

export interface HistoryItem extends SnapshotBrief {
  stage: string;
  milestonesDone: number;
  milestonesTotal: number;
  /** 待确认：待决定 + 完成且待验收的里程碑。 */
  pending: number;
  reporter: Reporter;
  supersededBy: number | null;
  deletedAt: string | null;
  fileName: string;
}

export class HistoryError extends Error {
  readonly code: 'not_found' | 'conflict' | 'not_deleted' | 'invalid_request';
  constructor(code: HistoryError['code']) {
    super(code);
    this.code = code;
  }
}

interface Row {
  id: number;
  project_id: string;
  snapshot_at: string;
  snapshot_at_utc_ms: number;
  offset_minutes: number;
  imported_at: string;
  superseded_by: number | null;
  deleted_at: string | null;
  normalized: string;
  reporter_agent: Reporter['agent'];
  reporter_source: Reporter['source'];
  reporter_note: string | null;
  file_name: string;
}

/** 某个项目的全部快照，按 snapshot_at 从新到旧（同一时刻有效的在前）；包括被替换的和回收站里的（各自标出）。 */
export function projectHistory(db: Database, projectId: string): HistoryItem[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, snapshot_at, snapshot_at_utc_ms, offset_minutes, imported_at, superseded_by, deleted_at,
              normalized, reporter_agent, reporter_source, reporter_note, file_name
       FROM status_snapshots WHERE project_id = ?
       ORDER BY snapshot_at_utc_ms DESC, (superseded_by IS NULL) DESC, id DESC`,
    )
    .all(projectId) as unknown as Row[];
  return rows.map((r) => {
    const s = JSON.parse(r.normalized) as {
      stage: string;
      milestones: { status: string; human_acceptance: string }[];
      needs_morii: unknown[];
    };
    const done = s.milestones.filter((m) => m.status === 'done');
    return {
      id: r.id,
      projectId: r.project_id,
      snapshotAt: r.snapshot_at,
      utcMs: r.snapshot_at_utc_ms,
      offsetMinutes: r.offset_minutes,
      importedAt: r.imported_at,
      deleted: r.deleted_at !== null,
      superseded: r.superseded_by !== null,
      stage: s.stage,
      milestonesDone: done.length,
      milestonesTotal: s.milestones.length,
      pending: s.needs_morii.length + done.filter((m) => m.human_acceptance === 'pending').length,
      reporter: { agent: r.reporter_agent, source: r.reporter_source, note: r.reporter_note },
      supersededBy: r.superseded_by,
      deletedAt: r.deleted_at,
      fileName: r.file_name,
    };
  });
}

/** 对比两份快照：按 snapshot_at 先后排好，早的在前。 */
export function compareSnapshots(
  db: Database,
  aId: number,
  bId: number,
): { before: SnapshotBrief; after: SnapshotBrief; diff: SnapshotDiff } {
  const a = getSnapshot(db, aId);
  const b = getSnapshot(db, bId);
  if (!a || !b) throw new HistoryError('not_found');
  if (a.projectId !== b.projectId || a.id === b.id) throw new HistoryError('invalid_request');
  const [before, after] = a.utcMs <= b.utcMs ? [a, b] : [b, a];
  const brief = ({ snapshot: _s, warnings: _w, normalizations: _n, reporter: _r, ...rest }: typeof a) => rest;
  return { before: brief(before), after: brief(after), diff: diffSnapshots(before.snapshot, after.snapshot) };
}

/** 移入回收站。它替换过的同一时刻旧版恢复为有效（和撤销导入一致）。 */
export function trashSnapshot(db: Database, id: number, now: Date): void {
  transaction(db, () => {
    const row = db.prepare('SELECT id, project_id, deleted_at FROM status_snapshots WHERE id = ?').get(id) as
      | { id: number; project_id: string; deleted_at: string | null }
      | undefined;
    if (!row) throw new HistoryError('not_found');
    if (row.deleted_at) return;
    db.prepare('UPDATE status_snapshots SET superseded_by = NULL WHERE superseded_by = ?').run(id);
    db.prepare('UPDATE status_snapshots SET deleted_at = ? WHERE id = ?').run(now.toISOString(), id);
    audit(db, 'snapshot.delete', `${row.project_id}#${id}`, '快照移入回收站', now);
  });
}

/** 从回收站恢复。同一时刻已有另一份有效快照时拒绝（先删掉那份，或保留现状）。 */
export function restoreSnapshot(db: Database, id: number, now: Date): void {
  transaction(db, () => {
    const row = db
      .prepare('SELECT id, project_id, snapshot_at_utc_ms, deleted_at FROM status_snapshots WHERE id = ?')
      .get(id) as
      | { id: number; project_id: string; snapshot_at_utc_ms: number; deleted_at: string | null }
      | undefined;
    if (!row) throw new HistoryError('not_found');
    if (!row.deleted_at) throw new HistoryError('not_deleted');
    const clash = db
      .prepare(
        `SELECT id FROM status_snapshots WHERE project_id = ? AND snapshot_at_utc_ms = ? AND id <> ?
         AND deleted_at IS NULL AND superseded_by IS NULL`,
      )
      .get(row.project_id, row.snapshot_at_utc_ms, id);
    if (clash) throw new HistoryError('conflict');
    db.prepare('UPDATE status_snapshots SET deleted_at = NULL, superseded_by = NULL WHERE id = ?').run(id);
    audit(db, 'snapshot.restore', `${row.project_id}#${id}`, '快照从回收站恢复', now);
  });
}

export function rawSnapshot(db: Database, id: number): { raw: Uint8Array; fileName: string } | undefined {
  const row = db.prepare('SELECT raw, file_name FROM status_snapshots WHERE id = ?').get(id) as
    | { raw: Uint8Array; file_name: string }
    | undefined;
  return row ? { raw: row.raw, fileName: row.file_name } : undefined;
}
