/**
 * 导出（P3.5，04 第 12 节）。
 *
 * 导出全部数据：manifest.json、data.json、snapshots/（有效快照的原文，逐字节）、
 * snapshots-archive/（回收站里的和被替换的版本）。只导出快照原文：只有 snapshots/，可以直接再导入任何一个 Dashboard。
 * 不包含会话、口令、服务端配置和任何本机路径；快照只记文件名。
 */
import type { Database } from './db.ts';
import { readFocus } from './focus.ts';
import { listBatches } from './imports.ts';
import { itemStates } from './items.ts';
import { manualMilestones } from './manual.ts';
import { listProjects } from './projects.ts';
import { acceptanceRecords } from './review.ts';
import { taskRecords } from './tasks.ts';
import { exportUsage } from './usage/archive.ts';
import { workCover, workRecords } from './works.ts';
import { createZip, type ZipEntry } from './zip.ts';

export const EXPORT_FORMAT = 2;

interface SnapshotRow {
  id: number;
  project_id: string;
  snapshot_at: string;
  snapshot_at_utc_ms: number;
  schema_version: string;
  content_fingerprint: string;
  raw_fingerprint: string;
  raw: Uint8Array;
  reporter_agent: string | null;
  reporter_source: string;
  imported_at: string;
  file_name: string;
  batch_id: number | null;
  reporter_note: string | null;
  superseded_by: number | null;
  deleted_at: string | null;
}

/** 包里的文件名：<project_id>/<snapshot_at>_<指纹前 8 位>.json；冒号等在 Windows 上不能用的字符换成横线。 */
function snapshotPath(dir: string, r: SnapshotRow): string {
  const at = r.snapshot_at.replace(/[^0-9A-Za-z+.-]/g, '-');
  return `${dir}/${r.project_id}/${at}_${r.content_fingerprint.slice(0, 8)}.json`;
}

function snapshotRows(db: Database): SnapshotRow[] {
  return db
    .prepare(
      `SELECT id, project_id, snapshot_at, snapshot_at_utc_ms, schema_version, content_fingerprint, raw_fingerprint, raw,
              reporter_agent, reporter_source, reporter_note, batch_id, imported_at, file_name, superseded_by, deleted_at
       FROM status_snapshots ORDER BY project_id, snapshot_at_utc_ms, id`,
    )
    .all() as unknown as SnapshotRow[];
}

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

export function exportAll(db: Database, now: Date, appVersion: string): Uint8Array {
  const rows = snapshotRows(db);
  const projects = listProjects(db);
  const batches = listBatches(db, 100_000);
  const files: ZipEntry[] = [];
  const works = workRecords(db);
  const tasks = taskRecords(db);
  const usage = exportUsage(db);
  files.push({ name: 'usage.json', data: json(usage) });
  for (const w of works) {
    const cover = workCover(db, w.id);
    if (cover) files.push({ name: `media/${w.id}.webp`, data: new Uint8Array(cover) });
  }
  const snapshots = rows.map((r) => {
    const active = r.deleted_at === null && r.superseded_by === null;
    const path = snapshotPath(active ? 'snapshots' : 'snapshots-archive', r);
    files.push({ name: path, data: new Uint8Array(r.raw) });
    return {
      id: r.id,
      projectId: r.project_id,
      snapshotAt: r.snapshot_at,
      schemaVersion: r.schema_version,
      contentFingerprint: r.content_fingerprint,
      rawFingerprint: r.raw_fingerprint,
      reporter: { agent: r.reporter_agent, source: r.reporter_source, note: r.reporter_note },
      batchId: r.batch_id,
      importedAt: r.imported_at,
      fileName: r.file_name,
      supersededBy: r.superseded_by,
      deletedAt: r.deleted_at,
      path,
    };
  });
  const manifest = {
    app: 'moriium-dashboard',
    appVersion,
    exportFormat: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    counts: {
      projects: projects.length,
      snapshots: snapshots.length,
      importBatches: batches.length,
      acceptances: acceptanceRecords(db).length,
      itemStates: itemStates(db).length,
      manualMilestones: manualMilestones(db).length,
      tasks: tasks.length,
      works: works.length,
      usageImports: usage.imports.length,
      usageBills: usage.bills.length,
    },
  };
  return createZip(
    [
      { name: 'manifest.json', data: json(manifest) },
      {
        name: 'data.json',
        data: json({
          projects,
          focus: readFocus(db, now),
          tasks,
          works: works.map((w) => ({ ...w, coverFile: w.hasCover ? `media/${w.id}.webp` : null })),
          snapshots,
          importBatches: batches,
          acceptances: acceptanceRecords(db),
          itemStates: itemStates(db),
          manualMilestones: manualMilestones(db),
        }),
      },
      ...files,
    ],
    now,
  );
}

export function exportSnapshots(db: Database, now: Date): Uint8Array {
  const files = snapshotRows(db)
    .filter((r) => r.deleted_at === null && r.superseded_by === null)
    .map((r) => ({ name: snapshotPath('snapshots', r), data: new Uint8Array(r.raw) }));
  return createZip(files, now);
}
