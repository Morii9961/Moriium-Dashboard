import { matchItems, type NextAction } from '@moriium-dashboard/protocol';
import { audit } from './audit.ts';
import { type Database, transaction } from './db.ts';
import { stateKey } from './items.ts';
import { getProject, isCalendarDate } from './projects.ts';
import { reviewText } from './review.ts';
import { currentSnapshot } from './snapshots.ts';

export interface Task {
  id: number;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  projectId: string | null;
  dueDate: string | null;
  status: 'todo' | 'doing' | 'done' | 'dropped';
  sourceSnapshotId: number | null;
  sourceAction: NextAction | null;
  sourceKey: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  gone: boolean;
}
interface TaskRow extends Omit<Task, 'sourceAction' | 'gone'> {
  sourceAction: string | null;
}
const columns =
  'id,title,lang,project_id AS projectId,due_date AS dueDate,status,source_snapshot_id AS sourceSnapshotId,source_action AS sourceAction,source_key AS sourceKey,revision,created_at AS createdAt,updated_at AS updatedAt,completed_at AS completedAt';
export class TaskError extends Error {
  readonly code: 'invalid_field' | 'not_found' | 'task_changed' | 'snapshot_changed' | 'exists';
  constructor(code: TaskError['code']) {
    super(code);
    this.code = code;
  }
}
function view(db: Database, row: TaskRow): Task {
  const sourceAction = row.sourceAction ? (JSON.parse(row.sourceAction) as NextAction) : null;
  const current = row.projectId && sourceAction ? currentSnapshot(db, row.projectId) : null;
  return {
    ...row,
    sourceAction,
    gone:
      !!sourceAction &&
      (!current ||
        matchItems([sourceAction], current.snapshot.next_actions, (a) => a.title).kept.length === 0),
  };
}
export function taskRecords(db: Database, projectId?: string): Task[] {
  const rows = (projectId
    ? db
        .prepare(`SELECT ${columns} FROM tasks WHERE project_id=? ORDER BY due_date IS NULL,due_date,id DESC`)
        .all(projectId)
    : db
        .prepare(`SELECT ${columns} FROM tasks ORDER BY due_date IS NULL,due_date,id DESC`)
        .all()) as unknown as TaskRow[];
  return rows.map((r) => view(db, r));
}
export function getTask(db: Database, id: number): Task | null {
  const row = db.prepare(`SELECT ${columns} FROM tasks WHERE id=?`).get(id) as unknown as TaskRow | undefined;
  return row ? view(db, row) : null;
}
export function saveTask(db: Database, id: number | null, body: Record<string, unknown>, now: Date) {
  return transaction(db, () => {
    const old = id === null ? null : getTask(db, id);
    if (id !== null && !old) throw new TaskError('not_found');
    if (old && body.revision !== old.revision) throw new TaskError('task_changed');
    let sourceAction: NextAction | null = old?.sourceAction ?? null;
    let sourceSnapshotId = old?.sourceSnapshotId ?? null;
    let sourceKey = old?.sourceKey ?? null;
    const projectId = body.projectId === undefined ? (old?.projectId ?? null) : body.projectId;
    let title = body.title === undefined ? old?.title : body.title;
    let lang = body.lang === undefined ? old?.lang : body.lang;
    if (!old && body.sourceSnapshotId !== undefined) {
      if (
        typeof body.sourceSnapshotId !== 'number' ||
        typeof projectId !== 'string' ||
        !Number.isSafeInteger(body.actionIndex)
      )
        throw new TaskError('invalid_field');
      const current = currentSnapshot(db, projectId);
      if (!current || current.id !== body.sourceSnapshotId) throw new TaskError('snapshot_changed');
      sourceAction = current.snapshot.next_actions[body.actionIndex as number] ?? null;
      if (!sourceAction) throw new TaskError('invalid_field');
      sourceSnapshotId = current.id;
      sourceKey = stateKey(sourceAction, sourceAction.title);
      title = sourceAction.title;
      lang = 'zh-Hans';
    } else if (body.sourceSnapshotId !== undefined || body.actionIndex !== undefined)
      throw new TaskError('invalid_field');
    if (projectId !== null && (typeof projectId !== 'string' || !getProject(db, projectId)))
      throw new TaskError('invalid_field');
    if (old?.sourceSnapshotId && projectId !== old.projectId) throw new TaskError('invalid_field');
    const checkedTitle = reviewText(title, 2000);
    const status = body.status === undefined ? (old?.status ?? 'todo') : body.status;
    const date = body.dueDate === undefined ? (old?.dueDate ?? null) : body.dueDate;
    if (
      !checkedTitle ||
      !['zh-Hans', 'ja', 'en'].includes(lang as string) ||
      !['todo', 'doing', 'done', 'dropped'].includes(status as string) ||
      (date !== null && (typeof date !== 'string' || !isCalendarDate(date)))
    )
      throw new TaskError('invalid_field');
    if (
      sourceKey &&
      ['todo', 'doing'].includes(status as string) &&
      db
        .prepare(
          "SELECT id FROM tasks WHERE project_id=? AND source_key=? AND status IN ('todo','doing') AND id!=?",
        )
        .get(projectId as string, sourceKey, id ?? -1)
    )
      throw new TaskError('exists');
    const at = now.toISOString();
    const completedAt = status === 'done' ? (old?.status === 'done' ? old.completedAt : at) : null;
    let taskId = id;
    if (old)
      db.prepare(
        'UPDATE tasks SET title=?,lang=?,project_id=?,due_date=?,status=?,revision=revision+1,updated_at=?,completed_at=? WHERE id=?',
      ).run(
        checkedTitle,
        lang as string,
        projectId as string | null,
        date as string | null,
        status as string,
        at,
        completedAt,
        id,
      );
    else
      taskId = Number(
        db
          .prepare(
            'INSERT INTO tasks(title,lang,project_id,due_date,status,source_snapshot_id,source_action,source_key,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            checkedTitle,
            lang as string,
            projectId as string | null,
            date as string | null,
            status as string,
            sourceSnapshotId,
            sourceAction ? JSON.stringify(sourceAction) : null,
            sourceKey,
            at,
            at,
            completedAt,
          ).lastInsertRowid,
      );
    audit(db, 'task.save', String(taskId), '保存任务', now);
    const saved = getTask(db, taskId as number);
    if (!saved) throw new Error('Saved task is missing');
    return saved;
  });
}
