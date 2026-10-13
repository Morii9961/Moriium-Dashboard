import { createHash } from 'node:crypto';
import { itemKey } from '@moriium-dashboard/protocol';
import type { Database } from './db.ts';
import { ReviewError, reviewText } from './review.ts';
import { currentSnapshot, getSnapshot } from './snapshots.ts';

export type ItemKind = 'needs_morii' | 'blockers';
export interface ItemState {
  projectId: string;
  kind: ItemKind;
  key: string;
  text: string;
  status: 'open' | 'decided' | 'later' | 'not_applicable' | 'acknowledged';
  conclusion: string;
  dueDate: string | null;
  at: string;
  snapshotId: number;
}
export interface ReviewItem {
  kind: ItemKind;
  key: string;
  text: string;
  impact: string | null;
  state: ItemState | null;
  gone: boolean;
  pending: boolean;
  repeated: boolean;
}

export const calendarDay = (now: Date) => new Date(now.getTime() + 480 * 60_000).toISOString().slice(0, 10);
/** 沿用协议 itemKey 的身份规则；在持久化边界将无 ID 文本变为 SHA-256，不改协议结构。 */
export function stateKey(item: { id?: string }, text: string) {
  const key = itemKey(item, text);
  return key.startsWith('text:') ? `text:${createHash('sha256').update(key.slice(5)).digest('hex')}` : key;
}
export function itemStates(db: Database, projectId?: string): ItemState[] {
  const cols =
    'project_id AS projectId,kind,item_key AS key,text,status,conclusion,due_date AS dueDate,at,snapshot_id AS snapshotId';
  return (projectId
    ? db.prepare(`SELECT ${cols} FROM item_states WHERE project_id=?`).all(projectId)
    : db.prepare(`SELECT ${cols} FROM item_states`).all()) as unknown as ItemState[];
}
export function reviewItems(db: Database, projectId: string, now: Date): ReviewItem[] {
  const current = currentSnapshot(db, projectId);
  const states = itemStates(db, projectId);
  const today = calendarDay(now);
  const result: ReviewItem[] = [];
  if (current)
    for (const kind of ['needs_morii', 'blockers'] as const) {
      const items =
        kind === 'needs_morii'
          ? current.snapshot.needs_morii.map((i) => ({ item: i, text: i.decision, impact: null }))
          : current.snapshot.blockers.map((i) => ({ item: i, text: i.title, impact: i.impact }));
      for (const i of items) {
        const key = stateKey(i.item, i.text);
        const state = states.find((s) => s.kind === kind && s.key === key) ?? null;
        result.push({
          kind,
          key,
          text: i.text,
          impact: i.impact,
          state,
          gone: false,
          pending:
            !state ||
            state.status === 'open' ||
            (state.status === 'later' && !!state.dueDate && state.dueDate <= today),
          repeated:
            !!state &&
            state.status === 'decided' &&
            current.utcMs > (getSnapshot(db, state.snapshotId)?.utcMs ?? current.utcMs),
        });
      }
    }
  for (const s of states)
    if (!result.some((i) => i.kind === s.kind && i.key === s.key))
      result.push({
        kind: s.kind,
        key: s.key,
        text: s.text,
        impact: null,
        state: s,
        gone: true,
        pending: false,
        repeated: false,
      });
  return result;
}
export function saveItemState(
  db: Database,
  projectId: string,
  kind: string,
  key: string,
  body: Record<string, unknown>,
  now: Date,
) {
  if (kind !== 'needs_morii' && kind !== 'blockers') throw new ReviewError('invalid_field');
  const current = currentSnapshot(db, projectId);
  if (!current) throw new ReviewError('not_found');
  if (body.snapshotId !== current.id) throw new ReviewError('snapshot_changed');
  const item = reviewItems(db, projectId, now).find((i) => !i.gone && i.kind === kind && i.key === key);
  if (!item) throw new ReviewError('not_found');
  const allowed =
    kind === 'needs_morii' ? ['open', 'decided', 'later', 'not_applicable'] : ['open', 'acknowledged'];
  if (!allowed.includes(body.status as string)) throw new ReviewError('invalid_field');
  const conclusion = reviewText(body.conclusion ?? '');
  if (body.status === 'decided' && !conclusion) throw new ReviewError('invalid_field');
  let dueDate: string | null = null;
  if (body.status === 'later') {
    if (
      typeof body.dueDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ||
      !Number.isFinite(Date.parse(body.dueDate)) ||
      new Date(body.dueDate).toISOString().slice(0, 10) !== body.dueDate
    )
      throw new ReviewError('invalid_field');
    dueDate = body.dueDate;
  }
  const at = now.toISOString();
  db.prepare(`INSERT INTO item_states(project_id,kind,item_key,text,status,conclusion,due_date,at,snapshot_id) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(project_id,kind,item_key) DO UPDATE SET text=excluded.text,status=excluded.status,conclusion=excluded.conclusion,due_date=excluded.due_date,at=excluded.at,snapshot_id=excluded.snapshot_id`).run(
    projectId,
    kind,
    key,
    item.text,
    body.status as string,
    conclusion,
    dueDate,
    at,
    current.id,
  );
  return itemStates(db, projectId).find((s) => s.kind === kind && s.key === key);
}
