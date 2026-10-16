/** Build a new, isolated database. No caller-supplied database can be overwritten. */

import { join } from 'node:path';
import { canonicalize, checkSnapshot, extractCodeFence, type Snapshot } from '@moriium-dashboard/protocol';
import { audit } from '../audit.ts';
import { REPO_ROOT } from '../config.ts';
import { validateCover } from '../covers.ts';
import { applyMigrations, loadMigrations, openDatabase } from '../db.ts';
import { EXPORT_FORMAT } from '../export.ts';
import { dayInShanghai, saveFocus } from '../focus.ts';
import { safeFileName } from '../imports.ts';
import { stateKey } from '../items.ts';
import { registry } from '../projects.ts';
import { parseExportJson, RestoreError, readArchive, requireRestore } from './archive.ts';
import {
  array,
  type Collection,
  choice,
  insertRecords,
  integer,
  nullable,
  object,
  type RecordValue,
  text,
  timestamp,
} from './records.ts';

export async function buildRestoredDatabase(bytes: Uint8Array, now = new Date()) {
  const files = readArchive(bytes);
  const take = (name: string) => {
    const data = files.get(name);
    requireRestore(data, 'missing_file');
    files.delete(name);
    return data;
  };
  const manifest = object(parseExportJson(take('manifest.json')));
  requireRestore(
    Object.keys(manifest).every((k) =>
      ['app', 'appVersion', 'exportFormat', 'exportedAt', 'counts'].includes(k),
    ),
  );
  requireRestore(
    manifest.app === 'moriium-dashboard' && manifest.exportFormat === EXPORT_FORMAT,
    'export_version',
  );
  text(100, true)(manifest.appVersion);
  timestamp(manifest.exportedAt);
  const exportedAt = new Date(manifest.exportedAt as string);
  const data = object(parseExportJson(take('data.json')));
  const collections: Collection[] = [
    'projects',
    'importBatches',
    'tasks',
    'works',
    'acceptances',
    'itemStates',
    'manualMilestones',
  ];
  requireRestore(Object.keys(data).every((k) => [...collections, 'snapshots', 'focus'].includes(k)));
  const rows = Object.fromEntries(
    collections.map((key) => [
      key,
      array(data[key] === undefined && ['tasks', 'works'].includes(key) ? [] : data[key]).map(object),
    ]),
  ) as Record<Collection, RecordValue[]>;
  const snapshots = array(data.snapshots).map(object);
  const counts = object(manifest.counts);
  const expected: Record<Collection | 'snapshots', number> = {
    ...Object.fromEntries(collections.map((key) => [key, rows[key].length])),
    snapshots: snapshots.length,
  } as Record<Collection | 'snapshots', number>;
  requireRestore(Object.keys(counts).every((key) => Object.hasOwn(expected, key)));
  for (const key of [
    'projects',
    'snapshots',
    'importBatches',
    'acceptances',
    'itemStates',
    'manualMilestones',
  ])
    requireRestore(counts[key] === expected[key as keyof typeof expected], 'count_mismatch');
  for (const key of ['tasks', 'works'])
    if (key in counts) requireRestore(counts[key] === rows[key as Collection].length, 'count_mismatch');

  const db = openDatabase(':memory:');
  try {
    applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
    db.exec('BEGIN IMMEDIATE; DELETE FROM projects');
    insertRecords(db, 'projects', rows.projects);
    insertRecords(db, 'importBatches', rows.importBatches);
    const registered = registry(db);
    const batchBySnapshot = new Map<number, number>();
    for (const batch of rows.importBatches) {
      const results = array(batch.results, 20).map(object);
      requireRestore(
        results.length === batch.fileCount &&
          results.filter((r) => r.outcome === 'imported').length === batch.importedCount &&
          results.length - Number(batch.importedCount) === batch.skippedCount,
        'batch_counts',
      );
      for (const r of results) {
        const allowed =
          r.outcome === 'imported'
            ? ['fileName', 'outcome', 'projectId', 'snapshotId', 'placement']
            : r.outcome === 'skipped'
              ? ['fileName', 'outcome', 'projectId', 'reason', 'existingId']
              : ['fileName', 'outcome'];
        requireRestore(Object.keys(r).every((key) => allowed.includes(key)));
        text(120, true)(r.fileName);
        requireRestore(safeFileName(r.fileName) === r.fileName);
        choice('imported', 'skipped', 'rejected', 'needs_choice')(r.outcome);
        if (r.outcome === 'imported') {
          integer(1)(r.snapshotId);
          choice('latest', 'history', 'replaced')(r.placement);
          requireRestore(!batchBySnapshot.has(r.snapshotId as number), 'batch_reference');
          batchBySnapshot.set(r.snapshotId as number, batch.id as number);
        } else if (r.outcome === 'skipped') {
          choice('duplicate', 'conflict')(r.reason);
          nullable(integer(1))(r.existingId);
        }
      }
    }
    const checked = new Map<number, { row: RecordValue; snapshot: Snapshot; utcMs: number }>();
    const insert =
      db.prepare(`INSERT INTO status_snapshots(id,project_id,snapshot_at,snapshot_at_utc_ms,offset_minutes,
      schema_version,validated_as,rules_version,content_fingerprint,raw_fingerprint,raw,normalized,warnings,normalizations,
      reporter_agent,reporter_source,reporter_note,batch_id,file_name,imported_at,deleted_at) VALUES(${Array(21).fill('?').join(',')})`);
    for (const s of snapshots) {
      requireRestore(
        Object.keys(s).every((k) =>
          [
            'id',
            'projectId',
            'snapshotAt',
            'schemaVersion',
            'contentFingerprint',
            'rawFingerprint',
            'reporter',
            'importedAt',
            'fileName',
            'supersededBy',
            'deletedAt',
            'path',
            'batchId',
          ].includes(k),
        ),
      );
      integer(1)(s.id);
      requireRestore(!checked.has(s.id as number), 'duplicate_id');
      timestamp(s.importedAt);
      nullable(timestamp)(s.deletedAt);
      nullable(integer(1))(s.supersededBy);
      text(120, true)(s.fileName);
      requireRestore(safeFileName(s.fileName) === s.fileName);
      const active = s.deletedAt === null && s.supersededBy === null;
      const dir = active ? 'snapshots' : 'snapshots-archive';
      requireRestore(typeof s.snapshotAt === 'string' && typeof s.contentFingerprint === 'string');
      requireRestore(
        s.path ===
          `${dir}/${s.projectId}/${s.snapshotAt.replace(/[^0-9A-Za-z+.-]/g, '-')}_${s.contentFingerprint.slice(0, 8)}.json`,
        'snapshot_path',
      );
      const raw = take(s.path as string);
      const result = await checkSnapshot(raw, { registry: registered, now, codeFence: 'extract' });
      requireRestore(result.kind === 'accepted', 'invalid_snapshot');
      const fence = extractCodeFence(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      parseExportJson(fence ? new TextEncoder().encode(fence.inner) : raw);
      const { snapshot, meta } = result;
      requireRestore(
        snapshot.project_id === s.projectId &&
          snapshot.snapshot_at === s.snapshotAt &&
          meta.schemaVersion === s.schemaVersion &&
          meta.contentFingerprint === s.contentFingerprint &&
          meta.rawFingerprint === s.rawFingerprint,
        'fingerprint_mismatch',
      );
      const reporter = object(s.reporter);
      requireRestore(Object.keys(reporter).every((k) => ['agent', 'source', 'note'].includes(k)));
      nullable(choice('claude', 'codex', 'other'))(reporter.agent);
      choice('file', 'branch', 'chosen', 'none')(reporter.source);
      const note = reporter.note === undefined ? meta.attribution.note : reporter.note;
      nullable(text())(note);
      if (reporter.source !== 'chosen')
        requireRestore(
          reporter.agent === meta.attribution.agent && reporter.source === meta.attribution.source,
          'reporter_mismatch',
        );
      const batchId = batchBySnapshot.get(s.id as number) ?? null;
      if ('batchId' in s) requireRestore(s.batchId === batchId, 'batch_reference');
      insert.run(
        s.id as number,
        snapshot.project_id,
        snapshot.snapshot_at,
        meta.snapshotAtUtcMs,
        meta.snapshotAtOffsetMinutes,
        meta.schemaVersion,
        meta.validatedAs,
        meta.rulesVersion,
        meta.contentFingerprint,
        meta.rawFingerprint,
        raw,
        JSON.stringify(snapshot),
        JSON.stringify(result.warnings),
        JSON.stringify(result.normalizations),
        reporter.agent as string | null,
        reporter.source as string,
        note as string | null,
        batchId,
        s.fileName as string,
        s.importedAt as string,
        s.deletedAt as string | null,
      );
      checked.set(s.id as number, { row: s, snapshot, utcMs: meta.snapshotAtUtcMs });
    }
    for (const [id, s] of checked) {
      if (s.row.supersededBy === null) continue;
      const target = checked.get(s.row.supersededBy as number);
      requireRestore(
        target && target !== s && target.row.projectId === s.row.projectId && target.utcMs === s.utcMs,
        'replacement_reference',
      );
      const seen = new Set([id]);
      for (
        let next: typeof target | undefined = target;
        next;
        next = checked.get(next.row.supersededBy as number)
      ) {
        requireRestore(!seen.has(next.row.id as number), 'replacement_cycle');
        seen.add(next.row.id as number);
      }
      db.prepare('UPDATE status_snapshots SET superseded_by=? WHERE id=?').run(target.row.id as number, id);
    }
    requireRestore(
      !db
        .prepare(`SELECT 1 FROM status_snapshots WHERE deleted_at IS NULL AND superseded_by IS NULL
      GROUP BY project_id,snapshot_at_utc_ms HAVING COUNT(*)>1`)
        .get(),
      'snapshot_conflict',
    );
    for (const batch of rows.importBatches)
      for (const result of array(batch.results).map(object))
        if (result.outcome === 'imported' || result.outcome === 'skipped') {
          const id = (result.outcome === 'imported' ? result.snapshotId : result.existingId) as number;
          const s = checked.get(id)?.row;
          requireRestore(s && s.projectId === result.projectId, 'batch_reference');
          if (result.outcome === 'imported')
            requireRestore(s.fileName === result.fileName && s.importedAt === batch.at, 'batch_reference');
        }
    for (const collection of ['tasks', 'works', 'acceptances', 'itemStates', 'manualMilestones'] as const)
      insertRecords(db, collection, rows[collection]);
    const source = (record: RecordValue, key: string) => {
      const s = checked.get(record[key] as number);
      requireRestore(s && s.row.projectId === record.projectId, 'source_reference');
      return s.snapshot;
    };
    for (const task of rows.tasks) {
      requireRestore((task.status === 'done') === (task.completedAt !== null));
      if (task.sourceSnapshotId === null)
        requireRestore(task.sourceAction === null && task.sourceKey === null);
      else {
        const action = object(task.sourceAction);
        requireRestore(
          source(task, 'sourceSnapshotId').next_actions.some(
            (a) => canonicalize(a) === canonicalize(action),
          ) && task.sourceKey === stateKey(action, action.title as string),
          'task_source',
        );
      }
    }
    for (const r of rows.acceptances) {
      const milestone = source(r, 'snapshotId').milestones.find((m) => m.id === r.milestoneId);
      requireRestore(
        milestone && (r.status !== 'accepted' || milestone.status === 'done'),
        'acceptance_source',
      );
    }
    for (const r of rows.itemStates) {
      const s = source(r, 'snapshotId');
      const items =
        r.kind === 'needs_morii'
          ? s.needs_morii.map((i) => [i, i.decision] as const)
          : s.blockers.map((i) => [i, i.title] as const);
      requireRestore(
        items.some(([i, text]) => stateKey(i, text) === r.key && text === r.text),
        'item_source',
      );
      requireRestore(
        (r.kind === 'blockers'
          ? ['open', 'acknowledged']
          : ['open', 'decided', 'later', 'not_applicable']
        ).includes(r.status as string),
      );
      requireRestore(
        (r.status === 'later') === (r.dueDate !== null) && (r.status !== 'decided' || !!r.conclusion),
      );
    }
    for (const r of rows.manualMilestones)
      requireRestore(
        db.prepare("SELECT 1 FROM projects WHERE id=? AND tracking='manual'").get(r.projectId as string),
        'manual_project',
      );
    for (const w of rows.works) {
      requireRestore(typeof w.hasCover === 'boolean');
      requireRestore(w.coverFile === (w.hasCover ? `media/${w.id}.webp` : null), 'cover_reference');
      if (w.hasCover) {
        const cover = take(w.coverFile as string);
        requireRestore(validateCover(cover), 'invalid_cover');
        db.prepare('INSERT INTO work_covers(work_id,bytes) VALUES(?,?)').run(w.id as number, cover);
      }
    }
    db.exec('COMMIT');
    if (data.focus !== undefined) {
      const f = object(data.focus);
      requireRestore(Object.keys(f).every((k) => ['date', 'energy', 'entries', 'revision'].includes(k)));
      requireRestore(f.date === dayInShanghai(exportedAt));
      integer()(f.revision);
      requireRestore(f.revision !== 0 || (f.energy === null && array(f.entries).length === 0));
      // saveFocus validates the existing field rules against the export's day, without changing dates.
      saveFocus(db, f.date as string, { ...f, revision: 0 }, exportedAt);
      db.prepare('UPDATE focus_day SET revision=?,updated_at=? WHERE id=1').run(
        f.revision as number,
        manifest.exportedAt as string,
      );
      db.exec('DELETE FROM audit_log');
    }
    requireRestore(files.size === 0, 'unreferenced_file');
    requireRestore(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'foreign_key_check');
    audit(db, 'data.restore', null, '从导出包恢复到新实例；记录数与快照指纹已核对', now);
    requireRestore(db.prepare('PRAGMA quick_check').get()?.quick_check === 'ok', 'integrity_check');
    return {
      db,
      counts: { ...expected, covers: rows.works.filter((w) => w.hasCover).length },
      exportedAt: manifest.exportedAt,
    };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    if (error instanceof RestoreError) throw error;
    throw new RestoreError('invalid_records');
  }
}
