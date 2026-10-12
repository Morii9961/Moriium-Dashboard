/**
 * 快照存储（P3.3）。快照只增不改；「当前状态」不存冗余字段，查询时取该项目
 * 未删除、未被替换的快照里 snapshot_at 最晚的一份（04 第 5 节，05 第 7 节）。
 */
import type {
  Attribution,
  ExistingSnapshot,
  Issue,
  Normalization,
  ReporterAgent,
  Snapshot,
} from '@moriium-dashboard/protocol';
import type { Database } from './db.ts';

export type ReporterSource = 'file' | 'branch' | 'chosen' | 'none';

export interface Reporter {
  agent: ReporterAgent | null;
  source: ReporterSource;
  note: string | null;
}

/** 快照的简要信息：预览里「已于某日导入」「比当前最新（某日）早」用。 */
export interface SnapshotBrief {
  id: number;
  projectId: string;
  snapshotAt: string;
  utcMs: number;
  offsetMinutes: number;
  importedAt: string;
  deleted: boolean;
  superseded: boolean;
}

export interface SnapshotRecord extends SnapshotBrief {
  schemaVersion: string;
  fileName: string;
  batchId: number | null;
  reporter: Reporter;
  warnings: Issue[];
  normalizations: Normalization[];
  snapshot: Snapshot;
}

interface Row {
  id: number;
  project_id: string;
  snapshot_at: string;
  snapshot_at_utc_ms: number;
  offset_minutes: number;
  schema_version: string;
  content_fingerprint: string;
  normalized: string;
  warnings: string;
  normalizations: string;
  reporter_agent: ReporterAgent | null;
  reporter_source: ReporterSource;
  reporter_note: string | null;
  batch_id: number | null;
  file_name: string;
  imported_at: string;
  superseded_by: number | null;
  deleted_at: string | null;
}

const BRIEF_COLUMNS =
  'id, project_id, snapshot_at, snapshot_at_utc_ms, offset_minutes, imported_at, content_fingerprint, superseded_by, deleted_at';

function toBrief(r: Pick<Row, keyof Row>): SnapshotBrief {
  return {
    id: r.id,
    projectId: r.project_id,
    snapshotAt: r.snapshot_at,
    utcMs: r.snapshot_at_utc_ms,
    offsetMinutes: r.offset_minutes,
    importedAt: r.imported_at,
    deleted: r.deleted_at !== null,
    superseded: r.superseded_by !== null,
  };
}

function toRecord(r: Row): SnapshotRecord {
  return {
    ...toBrief(r),
    schemaVersion: r.schema_version,
    fileName: r.file_name,
    batchId: r.batch_id,
    reporter: { agent: r.reporter_agent, source: r.reporter_source, note: r.reporter_note },
    warnings: JSON.parse(r.warnings) as Issue[],
    normalizations: JSON.parse(r.normalizations) as Normalization[],
    snapshot: JSON.parse(r.normalized) as Snapshot,
  };
}

/** 该项目已有的全部快照（包括回收站里的和被替换的），给 placeSnapshot 用。 */
export function existingFor(
  db: Database,
  projectId: string,
): (ExistingSnapshot & { brief: SnapshotBrief })[] {
  const rows = db
    .prepare(`SELECT ${BRIEF_COLUMNS} FROM status_snapshots WHERE project_id = ?`)
    .all(projectId) as unknown as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    snapshotAtUtcMs: r.snapshot_at_utc_ms,
    contentFingerprint: r.content_fingerprint,
    deleted: r.deleted_at !== null,
    superseded: r.superseded_by !== null,
    brief: toBrief(r),
  }));
}

export function getSnapshot(db: Database, id: number): SnapshotRecord | undefined {
  const row = db.prepare('SELECT * FROM status_snapshots WHERE id = ?').get(id) as unknown as Row | undefined;
  return row ? toRecord(row) : undefined;
}

export function getBrief(db: Database, id: number): SnapshotBrief | undefined {
  const row = db.prepare(`SELECT ${BRIEF_COLUMNS} FROM status_snapshots WHERE id = ?`).get(id) as unknown as
    | Row
    | undefined;
  return row ? toBrief(row) : undefined;
}

/** 每个项目的当前快照。 */
export function currentSnapshots(db: Database): Map<string, SnapshotRecord> {
  const rows = db
    .prepare(
      `SELECT s.* FROM status_snapshots s
       WHERE s.deleted_at IS NULL AND s.superseded_by IS NULL
         AND s.snapshot_at_utc_ms = (
           SELECT MAX(t.snapshot_at_utc_ms) FROM status_snapshots t
           WHERE t.project_id = s.project_id AND t.deleted_at IS NULL AND t.superseded_by IS NULL
         )`,
    )
    .all() as unknown as Row[];
  return new Map(rows.map((r) => [r.project_id, toRecord(r)]));
}

export function currentSnapshot(db: Database, projectId: string): SnapshotRecord | undefined {
  const row = db
    .prepare(
      `SELECT * FROM status_snapshots
       WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL
       ORDER BY snapshot_at_utc_ms DESC LIMIT 1`,
    )
    .get(projectId) as unknown as Row | undefined;
  return row ? toRecord(row) : undefined;
}

/** 每个项目的有效快照份数（不含回收站和被替换的）。 */
export function snapshotCounts(db: Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT project_id, COUNT(*) AS n FROM status_snapshots
       WHERE deleted_at IS NULL AND superseded_by IS NULL GROUP BY project_id`,
    )
    .all() as { project_id: string; n: number }[];
  return new Map(rows.map((r) => [r.project_id, r.n]));
}

export interface NewSnapshot {
  projectId: string;
  snapshotAt: string;
  utcMs: number;
  offsetMinutes: number;
  schemaVersion: string;
  validatedAs: string;
  rulesVersion: number;
  contentFingerprint: string;
  rawFingerprint: string;
  raw: Uint8Array;
  snapshot: Snapshot;
  warnings: Issue[];
  normalizations: Normalization[];
  reporter: Reporter;
  batchId: number;
  fileName: string;
  importedAt: string;
}

export function insertSnapshot(db: Database, s: NewSnapshot): number {
  const result = db
    .prepare(
      `INSERT INTO status_snapshots (
        project_id, snapshot_at, snapshot_at_utc_ms, offset_minutes, schema_version, validated_as, rules_version,
        content_fingerprint, raw_fingerprint, raw, normalized, warnings, normalizations,
        reporter_agent, reporter_source, reporter_note, batch_id, file_name, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.projectId,
      s.snapshotAt,
      s.utcMs,
      s.offsetMinutes,
      s.schemaVersion,
      s.validatedAs,
      s.rulesVersion,
      s.contentFingerprint,
      s.rawFingerprint,
      s.raw,
      JSON.stringify(s.snapshot),
      JSON.stringify(s.warnings),
      JSON.stringify(s.normalizations),
      s.reporter.agent,
      s.reporter.source,
      s.reporter.note,
      s.batchId,
      s.fileName,
      s.importedAt,
    );
  return Number(result.lastInsertRowid);
}

export function markSuperseded(db: Database, oldId: number, newId: number): void {
  db.prepare('UPDATE status_snapshots SET superseded_by = ? WHERE id = ?').run(newId, oldId);
}

/** 文件里的归属（v1.1 reporter 或分支推断）转换成存储形式。 */
export function reporterFrom(attribution: Attribution): Reporter {
  return { agent: attribution.agent, source: attribution.source, note: attribution.note };
}
