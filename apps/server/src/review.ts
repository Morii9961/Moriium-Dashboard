import { scanSecrets } from '@moriium-dashboard/protocol';
import type { Database } from './db.ts';
import { currentSnapshot, getSnapshot } from './snapshots.ts';

export interface AcceptanceRecord {
  projectId: string;
  milestoneId: string;
  status: 'accepted' | 'rejected';
  note: string;
  at: string;
  snapshotId: number;
}

export class ReviewError extends Error {
  readonly code: 'invalid_field' | 'not_found' | 'snapshot_changed' | 'suspected_secret' | 'project_changed';
  constructor(code: ReviewError['code']) {
    super(code);
    this.code = code;
  }
}

/** 人工文本也不能成为密钥进入数据或导出包的入口。拒绝时只回错误码。 */
export function reviewText(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) throw new ReviewError('invalid_field');
  if (scanSecrets(value).length) throw new ReviewError('suspected_secret');
  return value.trim();
}

export function acceptanceRecords(db: Database, projectId?: string): AcceptanceRecord[] {
  const columns =
    'project_id AS projectId, milestone_id AS milestoneId, status, note, at, snapshot_id AS snapshotId';
  return (projectId
    ? db.prepare(`SELECT ${columns} FROM acceptance_records WHERE project_id = ?`).all(projectId)
    : db.prepare(`SELECT ${columns} FROM acceptance_records`).all()) as unknown as AcceptanceRecord[];
}

export function saveAcceptance(
  db: Database,
  projectId: string,
  milestoneId: string,
  body: Record<string, unknown>,
  now: Date,
) {
  const current = currentSnapshot(db, projectId);
  if (!current) throw new ReviewError('not_found');
  if (body.snapshotId !== current.id) throw new ReviewError('snapshot_changed');
  const m = current.snapshot.milestones.find((m) => m.id === milestoneId);
  if (!m) throw new ReviewError('not_found');
  if (
    !['accepted', 'rejected'].includes(body.status as string) ||
    (body.status === 'accepted' && m.status !== 'done')
  )
    throw new ReviewError('invalid_field');
  const note = reviewText(body.note ?? '');
  const at = now.toISOString();
  db.prepare(`INSERT INTO acceptance_records(project_id,milestone_id,status,note,at,snapshot_id) VALUES(?,?,?,?,?,?)
    ON CONFLICT(project_id,milestone_id) DO UPDATE SET status=excluded.status,note=excluded.note,at=excluded.at,snapshot_id=excluded.snapshot_id`).run(
    projectId,
    milestoneId,
    body.status as string,
    note,
    at,
    current.id,
  );
  return {
    projectId,
    milestoneId,
    status: body.status as 'accepted' | 'rejected',
    note,
    at,
    snapshotId: current.id,
  };
}

/** 连续处于当前阶段的最早有效快照；忽略删除和替换，不能跳过中间的其它阶段。 */
export function stageEntry(db: Database, projectId: string) {
  const rows = db
    .prepare(
      'SELECT id FROM status_snapshots WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL ORDER BY snapshot_at_utc_ms DESC',
    )
    .all(projectId) as { id: number }[];
  const latest = rows[0] ? getSnapshot(db, rows[0].id) : undefined;
  if (!latest) return null;
  let entry = latest;
  for (const row of rows.slice(1)) {
    const s = getSnapshot(db, row.id);
    if (!s || s.snapshot.stage !== latest.snapshot.stage) break;
    entry = s;
  }
  return {
    snapshotAt: entry.snapshotAt,
    utcMs: entry.utcMs,
    offsetMinutes: entry.offsetMinutes,
    onlySnapshot: rows.length === 1,
  };
}
