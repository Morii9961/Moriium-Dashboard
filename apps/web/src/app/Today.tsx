import { type FormEvent, useEffect, useState } from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';

export type Energy = 'high' | 'normal' | 'low' | 'rest';
export interface FocusEntry {
  id: string;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  done: boolean;
  taskId?: number;
  taskRevision?: number;
}
export interface FocusDay {
  date: string;
  energy: Energy | null;
  entries: FocusEntry[];
  revision: number;
}
export const todayDate = () => new Date(Date.now() + 480 * 60000).toISOString().slice(0, 10);
export function useToday() {
  const [date, setDate] = useState(todayDate);
  useEffect(() => {
    const tick = () => setDate(todayDate());
    const timer = window.setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);
  const resource = useResource<FocusDay>(`/api/focus/${date}`);
  return { ...resource, data: resource.data?.date === date ? resource.data : undefined };
}
export function PersonalMessage({ code }: { code: string | null }) {
  const { t } = useI18n();
  return (
    <p role="status" className="save-status">
      {code
        ? t(
            code === 'saved'
              ? 'action.saved'
              : code === 'focus_changed' || code === 'date_changed'
                ? 'today.changed'
                : code === 'full'
                  ? 'today.full'
                  : code === 'exists'
                    ? 'tasks.exists'
                    : code === 'task_changed'
                      ? 'tasks.changed'
                      : code === 'suspected_secret'
                        ? 'detail.secret'
                        : 'apiError.unknown',
          )
        : ''}
    </p>
  );
}
export function TodayPanel({ day }: { day: FocusDay }) {
  const { t, locale } = useI18n();
  const invalidate = useInvalidate();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async (patch: Partial<FocusDay>) => {
    setBusy(true);
    setMessage(null);
    try {
      await api('PUT', `/api/focus/${day.date}`, { ...day, ...patch });
      invalidate();
      setMessage('saved');
      return true;
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      invalidate();
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (
      await save({ entries: [...day.entries, { id: crypto.randomUUID(), title, lang: locale, done: false }] })
    )
      setTitle('');
  };
  const toggle = async (entry: FocusEntry) => {
    if (!entry.taskId) {
      await save({ entries: day.entries.map((v) => (v.id === entry.id ? { ...v, done: !v.done } : v)) });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api('PATCH', `/api/tasks/${entry.taskId}`, {
        revision: entry.taskRevision,
        status: entry.done ? 'todo' : 'done',
      });
      invalidate();
      setMessage('saved');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      invalidate();
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    const next = [...day.entries];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;
    void save({ entries: next });
  };
  return (
    <section className="today-panel" aria-labelledby="today-title">
      <h2 id="today-title">
        {t('today.title')} · <time dateTime={day.date}>{day.date}</time> (UTC+8)
      </h2>
      <Segmented
        name="energy"
        legend={t('today.energy')}
        showLegend
        disabled={busy}
        value={day.energy ?? 'unset'}
        options={(['high', 'normal', 'low', 'rest'] as const).map(
          (v) => [v, t(`today.energy.${v}`)] as const,
        )}
        onChange={(v) => {
          if (!busy) void save({ energy: v === 'unset' ? null : v });
        }}
      />
      {day.energy === 'rest' ? <p>{t('today.rest')}</p> : null}
      <ol className="focus-list">
        {day.entries.map((entry, index) => (
          <li key={entry.id}>
            <label>
              <input
                type="checkbox"
                checked={entry.done}
                disabled={busy}
                onChange={() => void toggle(entry)}
              />
              <span lang={entry.lang}>{entry.title}</span>
            </label>
            <div className="page-actions">
              <button
                className="btn"
                type="button"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label={t('today.moveUp', { title: entry.title })}
              >
                ↑
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || index === day.entries.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t('today.moveDown', { title: entry.title })}
              >
                ↓
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void save({ entries: day.entries.filter((v) => v.id !== entry.id) })}
              >
                {t('today.remove')}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {day.entries.length === 0 ? <p>{t('today.empty')}</p> : null}
      <form className="focus-add" onSubmit={add}>
        <label>
          {t('today.add')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={2000}
            disabled={busy || day.entries.length >= 3}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || day.entries.length >= 3}>
          {t('today.add')}
        </button>
      </form>
      {day.entries.length >= 3 ? <p>{t('today.full')}</p> : null}
      <PersonalMessage code={message} />
    </section>
  );
}
export function AddToFocus({
  title,
  lang = 'zh-Hans',
  taskId,
}: {
  title: string;
  lang?: FocusEntry['lang'];
  taskId?: number;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const date = todayDate();
      const day = await api<FocusDay>('GET', `/api/focus/${date}`);
      if (day.entries.length >= 3) {
        setMessage('full');
        return;
      }
      if (taskId && day.entries.some((e) => e.taskId === taskId)) {
        setMessage('exists');
        return;
      }
      await api('PUT', `/api/focus/${date}`, {
        ...day,
        entries: [
          ...day.entries,
          { id: crypto.randomUUID(), title, lang, done: false, ...(taskId ? { taskId } : {}) },
        ],
      });
      invalidate();
      setMessage('saved');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      invalidate();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="focus-transfer">
      <button type="button" className="btn" disabled={busy} onClick={() => void add()}>
        {t('today.addToFocus')}
      </button>
      <PersonalMessage code={message} />
    </div>
  );
}
