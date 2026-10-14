import { audit } from './audit.ts';
import { validateCover } from './covers.ts';
import { type Database, transaction } from './db.ts';
import { getProject, isCalendarDate } from './projects.ts';
import { reviewText } from './review.ts';

export interface Work {
  id: number;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  kind: 'release' | 'launch' | 'photos' | 'video' | 'design' | 'article' | 'other';
  date: string;
  projectId: string | null;
  link: string;
  note: string;
  treasured: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  hasCover: boolean;
}
const cols =
  'id,title,lang,kind,date,project_id AS projectId,link,note,treasured,revision,created_at AS createdAt,updated_at AS updatedAt,deleted_at AS deletedAt,EXISTS(SELECT 1 FROM work_covers WHERE work_id=works.id) AS hasCover';
type Row = Omit<Work, 'treasured' | 'hasCover'> & { treasured: number; hasCover: number };
const view = (r: Row): Work => ({ ...r, treasured: !!r.treasured, hasCover: !!r.hasCover });
export function workRecords(db: Database): Work[] {
  return (db.prepare(`SELECT ${cols} FROM works ORDER BY date DESC,id DESC`).all() as unknown as Row[]).map(
    view,
  );
}
export function getWork(db: Database, id: number): Work | null {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const r = db.prepare(`SELECT ${cols} FROM works WHERE id=?`).get(id) as unknown as Row | undefined;
  return r ? view(r) : null;
}
export class WorkError extends Error {
  readonly code: 'not_found' | 'invalid_field' | 'work_changed' | 'invalid_cover';
  constructor(code: WorkError['code']) {
    super(code);
    this.code = code;
  }
}
function requireWork(db: Database, id: number, revision: unknown, allowDeleted = false) {
  const old = getWork(db, id);
  if (!old || (!allowDeleted && old.deletedAt)) throw new WorkError('not_found');
  if (revision !== old.revision) throw new WorkError('work_changed');
  return old;
}
export function saveWork(db: Database, id: number | null, body: Record<string, unknown>, now: Date) {
  return transaction(db, () => {
    const old = id === null ? null : requireWork(db, id, body.revision);
    const field = (k: keyof Work) => (body[k] === undefined ? old?.[k] : body[k]);
    const title = reviewText(field('title'), 2000),
      note = reviewText(field('note') ?? '', 2000),
      link = reviewText(field('link') ?? '', 2000);
    const lang = field('lang'),
      kind = field('kind'),
      date = field('date'),
      projectId = field('projectId') ?? null,
      treasured = field('treasured') === undefined ? false : field('treasured');
    if (
      !title ||
      !['zh-Hans', 'ja', 'en'].includes(lang as string) ||
      !['release', 'launch', 'photos', 'video', 'design', 'article', 'other'].includes(kind as string) ||
      typeof date !== 'string' ||
      !isCalendarDate(date) ||
      typeof treasured !== 'boolean' ||
      (projectId !== null && (typeof projectId !== 'string' || !getProject(db, projectId)))
    )
      throw new WorkError('invalid_field');
    if (link) {
      try {
        const u = new URL(link);
        if (u.protocol !== 'https:' || u.username || u.password) throw new Error();
      } catch {
        throw new WorkError('invalid_field');
      }
    }
    const at = now.toISOString();
    let workId = id;
    if (old)
      db.prepare(
        'UPDATE works SET title=?,lang=?,kind=?,date=?,project_id=?,link=?,note=?,treasured=?,revision=revision+1,updated_at=? WHERE id=?',
      ).run(
        title,
        lang as string,
        kind as string,
        date,
        projectId as string | null,
        link,
        note,
        Number(treasured),
        at,
        id,
      );
    else
      workId = Number(
        db
          .prepare(
            'INSERT INTO works(title,lang,kind,date,project_id,link,note,treasured,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            title,
            lang as string,
            kind as string,
            date,
            projectId as string | null,
            link,
            note,
            Number(treasured),
            at,
            at,
          ).lastInsertRowid,
      );
    audit(db, 'work.save', String(workId), '保存成果', now);
    const saved = getWork(db, workId as number);
    if (!saved) throw new Error('Saved work is missing');
    return saved;
  });
}
export function trashWork(db: Database, id: number, revision: unknown, now: Date, restore = false) {
  return transaction(db, () => {
    requireWork(db, id, revision, true);
    db.prepare('UPDATE works SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=?').run(
      restore ? null : now.toISOString(),
      now.toISOString(),
      id,
    );
    audit(db, restore ? 'work.restore' : 'work.trash', String(id), restore ? '恢复成果' : '移入回收站', now);
    return getWork(db, id);
  });
}
export function workCover(db: Database, id: number): Uint8Array | null {
  const row = db.prepare('SELECT bytes FROM work_covers WHERE work_id=?').get(id) as
    | { bytes: Uint8Array }
    | undefined;
  return row?.bytes ?? null;
}
export function saveCover(db: Database, id: number, revision: unknown, bytes: Uint8Array | null, now: Date) {
  if (bytes && !validateCover(bytes)) throw new WorkError('invalid_cover');
  return transaction(db, () => {
    requireWork(db, id, revision);
    if (bytes)
      db.prepare(
        'INSERT INTO work_covers(work_id,bytes) VALUES(?,?) ON CONFLICT(work_id) DO UPDATE SET bytes=excluded.bytes',
      ).run(id, bytes);
    else db.prepare('DELETE FROM work_covers WHERE work_id=?').run(id);
    db.prepare('UPDATE works SET revision=revision+1,updated_at=? WHERE id=?').run(now.toISOString(), id);
    audit(db, 'work.cover', String(id), '更新封面缩略图', now);
    return getWork(db, id);
  });
}
