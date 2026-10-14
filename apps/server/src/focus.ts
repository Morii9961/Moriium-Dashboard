import { audit } from './audit.ts';
import { type Database, transaction } from './db.ts';
import { reviewText } from './review.ts';

export const dayInShanghai = (now: Date) => new Date(now.getTime() + 480 * 60000).toISOString().slice(0, 10);
export interface FocusEntry {
  id: string;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  done: boolean;
}
export interface FocusDay {
  date: string;
  energy: 'high' | 'normal' | 'low' | 'rest' | null;
  entries: FocusEntry[];
  revision: number;
}
export class FocusError extends Error {
  readonly code: 'date_changed' | 'focus_changed' | 'invalid_field';
  constructor(code: FocusError['code']) {
    super(code);
    this.code = code;
  }
}
export function readFocus(db: Database, now: Date): FocusDay {
  const date = dayInShanghai(now);
  const row = db.prepare('SELECT date,energy,entries,revision FROM focus_day WHERE id=1').get() as
    | { date: string; energy: FocusDay['energy']; entries: string; revision: number }
    | undefined;
  return row?.date === date
    ? { ...row, entries: JSON.parse(row.entries) as FocusEntry[] }
    : { date, energy: null, entries: [], revision: 0 };
}
export function saveFocus(db: Database, date: string, body: Record<string, unknown>, now: Date) {
  if (date !== dayInShanghai(now)) throw new FocusError('date_changed');
  if (body.energy !== null && !['high', 'normal', 'low', 'rest'].includes(body.energy as string))
    throw new FocusError('invalid_field');
  if (!Array.isArray(body.entries) || body.entries.length > 3) throw new FocusError('invalid_field');
  const seen = new Set<string>();
  const entries = body.entries.map((value: unknown): FocusEntry => {
    if (!value || typeof value !== 'object') throw new FocusError('invalid_field');
    const v = value as Record<string, unknown>;
    if (
      typeof v.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(v.id) ||
      seen.has(v.id) ||
      typeof v.done !== 'boolean' ||
      !['zh-Hans', 'ja', 'en'].includes(v.lang as string)
    )
      throw new FocusError('invalid_field');
    const title = reviewText(v.title, 500);
    if (!title) throw new FocusError('invalid_field');
    seen.add(v.id);
    return { id: v.id, title, done: v.done, lang: v.lang as FocusEntry['lang'] };
  });
  return transaction(db, () => {
    const current = readFocus(db, now);
    if (body.revision !== current.revision) throw new FocusError('focus_changed');
    db.prepare(`INSERT INTO focus_day(id,date,energy,entries,revision,updated_at) VALUES(1,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date,energy=excluded.energy,entries=excluded.entries,revision=excluded.revision,updated_at=excluded.updated_at`).run(
      date,
      body.energy as FocusDay['energy'],
      JSON.stringify(entries),
      current.revision + 1,
      now.toISOString(),
    );
    audit(db, 'focus.save', date, '更新今天的安排', now);
    return readFocus(db, now);
  });
}
