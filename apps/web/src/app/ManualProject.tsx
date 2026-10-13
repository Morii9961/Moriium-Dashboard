import { type FormEvent, useState } from 'react';
import { MilestoneGrid, StatusMark } from '../components/parts.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES } from '../i18n/locale.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate } from './data.tsx';
import { ReviewMessage } from './ProjectDetail.tsx';
import type { ManualMilestone, ProjectWithCurrent } from './types.ts';

export function ManualSummary({ project: p }: { project: ProjectWithCurrent }) {
  const { t } = useI18n();
  const m = p.manualMilestones;
  const done = m.filter((m) => m.status === 'done').length;
  return (
    <section className="manual-summary">
      <span className="tag">{t('manual.recorded')}</span>
      {m.length ? (
        <>
          <MilestoneGrid
            milestones={m.map((m) => ({
              id: String(m.id),
              status: m.status,
            }))}
          />
          <p>{t('more.milestonesDone', { done, total: m.length })}</p>
        </>
      ) : null}
      <dl>
        <dt>{t('manual.working')}</dt>
        <dd lang={p.manualLang}>{p.workingOn || '—'}</dd>
        <dt>{t('more.next')}</dt>
        <dd lang={p.manualLang}>{p.nextStep || '—'}</dd>
      </dl>
      {p.keyDate ? (
        <p>
          <span lang={p.manualLang}>{p.keyDateLabel}</span> · <time dateTime={p.keyDate}>{p.keyDate}</time>
        </p>
      ) : null}
    </section>
  );
}

export function ManualProject({ project: p }: { project: ProjectWithCurrent }) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    workingOn: p.workingOn,
    nextStep: p.nextStep,
    keyDate: p.keyDate,
    keyDateLabel: p.keyDateLabel,
    lang: p.manualLang,
  });
  const [rows, setRows] = useState(
    p.manualMilestones.map((m) => ({ ...m, key: `existing-${m.id}` })) as (Partial<ManualMilestone> & {
      key: string;
      title: string;
      status: ManualMilestone['status'];
      targetDate: string | null;
    })[],
  );
  const [message, setMessage] = useState<string | null>(null);
  const changeDraft = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const changeRow = (key: string, field: 'title' | 'status' | 'targetDate', value: string | null) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('PUT', `/api/projects/${encodeURIComponent(p.id)}/manual`, {
        ...draft,
        updatedAt: p.updatedAt,
        milestones: rows.map((m) => ({
          ...('id' in m ? { id: m.id } : {}),
          title: m.title,
          status: m.status,
          targetDate: m.targetDate,
        })),
      });
      setMessage('saved');
      setEditing(false);
      invalidate();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ManualSummary project={p} />
      <ul className="detail-items manual-milestones">
        {p.manualMilestones.map((m) => (
          <li key={m.id}>
            <StatusMark status={m.status} />
            <p lang={m.lang}>{m.title}</p>
            {m.targetDate ? <time dateTime={m.targetDate}>{m.targetDate}</time> : null}
          </li>
        ))}
      </ul>
      <button type="button" className="btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
        {t('manual.edit')}
      </button>
      {editing ? (
        <form className="manual-editor" onSubmit={save}>
          <div className="settings-fields">
            <label className="field">
              <span>{t('manual.language')}</span>
              <select value={draft.lang} onChange={(e) => changeDraft('lang', e.currentTarget.value)}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </select>
            </label>
            {(['workingOn', 'nextStep', 'keyDateLabel'] as const).map((key) => (
              <label className="field" key={key}>
                <span>{t(`manual.${key}`)}</span>
                <input
                  value={draft[key]}
                  maxLength={key === 'keyDateLabel' ? 80 : 2000}
                  onChange={(e) => changeDraft(key, e.currentTarget.value)}
                />
              </label>
            ))}
            <label className="field">
              <span>{t('manual.date')}</span>
              <input
                type="date"
                value={draft.keyDate}
                onChange={(e) => changeDraft('keyDate', e.currentTarget.value)}
              />
            </label>
          </div>
          <ol className="manual-rows">
            {rows.map((m, i) => (
              <li key={m.key}>
                <label className="field">
                  <span>{t('detail.milestone')}</span>
                  <input
                    required
                    value={m.title}
                    maxLength={2000}
                    onChange={(e) => changeRow(m.key, 'title', e.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  <span>{t('item.state')}</span>
                  <select
                    value={m.status}
                    onChange={(e) => changeRow(m.key, 'status', e.currentTarget.value)}
                  >
                    {(['not_started', 'in_progress', 'blocked', 'done', 'unknown'] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`status.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('manual.target')}</span>
                  <input
                    type="date"
                    value={m.targetDate ?? ''}
                    onChange={(e) => changeRow(m.key, 'targetDate', e.currentTarget.value || null)}
                  />
                </label>
                <button
                  className="btn"
                  type="button"
                  aria-label={t('manual.remove', { n: i + 1 })}
                  onClick={() => setRows((r) => r.filter((x) => x.key !== m.key))}
                >
                  {t('manual.delete')}
                </button>
              </li>
            ))}
          </ol>
          <div className="page-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  { key: crypto.randomUUID(), title: '', status: 'not_started', targetDate: null },
                ])
              }
            >
              {t('manual.add')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('action.save')}
            </button>
          </div>
          <ReviewMessage code={message} />
        </form>
      ) : null}
    </>
  );
}
