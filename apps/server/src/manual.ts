import type { Database } from './db.ts';
import { getProject, isCalendarDate, ProjectError, projectText, updateProject } from './projects.ts';
import { ReviewError } from './review.ts';
export interface ManualMilestone {
  id: number;
  projectId: string;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  status: 'not_started' | 'in_progress' | 'blocked' | 'done' | 'unknown';
  targetDate: string | null;
  sortOrder: number;
  at: string;
}
export function manualMilestones(db: Database, projectId?: string): ManualMilestone[] {
  const cols =
    'id,project_id AS projectId,title,lang,status,target_date AS targetDate,sort_order AS sortOrder,at';
  return (projectId
    ? db
        .prepare(`SELECT ${cols} FROM manual_milestones WHERE project_id=? ORDER BY sort_order,id`)
        .all(projectId)
    : db
        .prepare(`SELECT ${cols} FROM manual_milestones ORDER BY project_id,sort_order,id`)
        .all()) as unknown as ManualMilestone[];
}
export function saveManual(db: Database, id: string, body: Record<string, unknown>, now: Date) {
  const p = getProject(db, id);
  if (!p) throw new ProjectError('not_found');
  if (p.tracking !== 'manual') throw new ProjectError('invalid_field');
  if (body.updatedAt !== p.updatedAt) throw new ReviewError('project_changed');
  if (!Array.isArray(body.milestones) || body.milestones.length > 200)
    throw new ProjectError('invalid_field', 'milestones');
  const existing = manualMilestones(db, id);
  const seen = new Set<number>();
  const entries = body.milestones.map((m: unknown) => {
    if (!m || typeof m !== 'object') throw new ProjectError('invalid_field');
    const v = m as Record<string, unknown>;
    const title = projectText(v.title);
    if (!title || !['not_started', 'in_progress', 'blocked', 'done', 'unknown'].includes(v.status as string))
      throw new ProjectError('invalid_field');
    let entryId: number | null = null;
    if (v.id !== undefined) {
      if (typeof v.id !== 'number' || !existing.some((x) => x.id === v.id) || seen.has(v.id))
        throw new ProjectError('invalid_field');
      entryId = v.id;
      seen.add(v.id);
    }
    const date = v.targetDate ?? null;
    if (date !== null && (typeof date !== 'string' || !isCalendarDate(date)))
      throw new ProjectError('invalid_field');
    return { id: entryId, title, status: v.status as string, date: date as string | null };
  });
  updateProject(
    db,
    id,
    {
      workingOn: body.workingOn,
      nextStep: body.nextStep,
      keyDate: body.keyDate,
      keyDateLabel: body.keyDateLabel,
      manualLang: body.lang,
    },
    now,
  );
  db.prepare('DELETE FROM manual_milestones WHERE project_id=?').run(id);
  entries.forEach((m, i) => {
    db.prepare(
      'INSERT INTO manual_milestones(id,project_id,title,lang,status,target_date,sort_order,at) VALUES(?,?,?,?,?,?,?,?)',
    ).run(m.id, id, m.title, body.lang as string, m.status, m.date, i, now.toISOString());
  });
  return manualMilestones(db, id);
}
