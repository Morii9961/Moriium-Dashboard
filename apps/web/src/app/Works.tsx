import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { restoreEditorFocus, useDraftGuard } from './drafts.ts';
import { confirmDraftDiscard, Link } from './router.tsx';
import { todayDate } from './Today.tsx';
import { localizedName, type Project } from './types.ts';
import { PageHeader } from './ui.tsx';

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
  deletedAt: string | null;
  hasCover: boolean;
}
export const WORK_KINDS = ['release', 'launch', 'photos', 'video', 'design', 'article', 'other'] as const;
function WorkMessage({ code }: { code: string | null }) {
  const { t } = useI18n();
  return (
    <p role="status" className="save-status">
      {code
        ? t(
            code === 'saved'
              ? 'action.saved'
              : code === 'work_changed'
                ? 'works.changed'
                : code === 'invalid_cover' || code === 'body_too_large'
                  ? 'works.coverError'
                  : code === 'suspected_secret'
                    ? 'detail.secret'
                    : code === 'invalid_field'
                      ? 'works.invalid'
                      : 'apiError.unknown',
          )
        : ''}
    </p>
  );
}
function WorkEditor({
  work,
  projects,
  projectId,
  close,
}: {
  work?: Work;
  projects: Project[];
  projectId?: string;
  close: () => void;
}) {
  const { t, locale } = useI18n();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState({
    title: work?.title ?? '',
    kind: work?.kind ?? 'other',
    date: work?.date ?? todayDate(),
    projectId: work?.projectId ?? projectId ?? '',
    link: work?.link ?? '',
    note: work?.note ?? '',
    treasured: work?.treasured ?? false,
  });
  const [revision] = useState(work?.revision);
  const [initial] = useState(draft);
  const confirmClose = useDraftGuard(JSON.stringify(draft) !== JSON.stringify(initial));
  const legend = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    legend.current?.focus();
  }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (key: keyof typeof draft, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(work ? 'PATCH' : 'POST', work ? `/api/works/${work.id}` : '/api/works', {
        ...draft,
        projectId: draft.projectId || null,
        lang: work?.lang ?? locale,
        ...(work ? { revision } : {}),
      });
      invalidate();
      close();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="personal-editor work-editor" onSubmit={save}>
      <fieldset disabled={busy}>
        <legend ref={legend} tabIndex={-1}>
          {t(work ? 'works.edit' : 'works.new')}
        </legend>
        <label>
          {t('tasks.title')}
          <input
            name="work-title"
            autoComplete="off"
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            required
            maxLength={2000}
          />
        </label>
        <label>
          {t('works.kind')}
          <select name="work-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value)}>
            {WORK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`works.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('works.date')}
          <input
            name="work-date"
            autoComplete="off"
            type="date"
            value={draft.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </label>
        <label>
          {t('tasks.project')}
          <select
            name="work-project"
            value={draft.projectId}
            onChange={(e) => set('projectId', e.target.value)}
          >
            <option value="">{t('tasks.noProject')}</option>
            {projects.map((p) => (
              <option value={p.id} key={p.id}>
                {localizedName(p, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('works.link')}
          <input
            name="work-link"
            autoComplete="off"
            spellCheck={false}
            type="url"
            value={draft.link}
            onChange={(e) => set('link', e.target.value)}
            maxLength={2000}
          />
        </label>
        <label>
          {t('works.note')}
          <textarea
            name="work-note"
            autoComplete="off"
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <label className="work-treasure">
          <input
            name="work-treasured"
            type="checkbox"
            checked={draft.treasured}
            onChange={(e) => set('treasured', e.target.checked)}
          />
          {t('works.treasured')}
        </label>
        <p>{t('works.afterSave')}</p>
        <div className="page-actions">
          <button type="submit" className="btn">
            {t('action.save')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!confirmClose()) return;
              invalidate();
              close();
            }}
          >
            {t('tasks.close')}
          </button>
        </div>
        <WorkMessage code={message} />
      </fieldset>
    </form>
  );
}
function WorkCard({ work: w, projects }: { work: Work; projects: Project[] }) {
  const { t, locale, calendarDate } = useI18n();
  const editButton = useRef<HTMLButtonElement>(null);
  const invalidate = useInvalidate();
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const p = projects.find((p) => p.id === w.projectId);
  const change = async (action: 'treasure' | 'trash' | 'coverRemove') => {
    setBusy(true);
    try {
      await api(
        action === 'treasure' ? 'PATCH' : 'DELETE',
        action === 'coverRemove'
          ? `/api/works/${w.id}/cover?revision=${w.revision}`
          : action === 'trash'
            ? `/api/works/${w.id}?revision=${w.revision}`
            : `/api/works/${w.id}`,
        action === 'treasure' ? { revision: w.revision, treasured: !w.treasured } : undefined,
      );
      invalidate();
      setMessage('saved');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      invalidate();
    } finally {
      setBusy(false);
    }
  };
  const cover = async (file: File) => {
    setBusy(true);
    try {
      const { encodeCover, uploadCover } = await import('./cover.ts');
      await uploadCover(w.id, w.revision, await encodeCover(file));
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
    <article className="work-card" id={`work-${w.id}`} tabIndex={-1}>
      {w.hasCover ? (
        <img
          className="work-cover"
          src={`/api/works/${w.id}/cover?v=${w.revision}`}
          alt={w.title}
          width={800}
          height={600}
          loading="lazy"
        />
      ) : (
        <div className="work-no-cover">{t('works.noCover')}</div>
      )}
      <div className="work-body">
        <h3 lang={w.lang}>{w.title}</h3>
        <p>
          {t(`works.kind.${w.kind}`)} · <time dateTime={w.date}>{calendarDate(w.date)}</time>
          {w.treasured ? <> · ★ {t('works.treasured')}</> : null}
        </p>
        {p ? <Link to={`/projects/${encodeURIComponent(p.id)}`}>{localizedName(p, locale)}</Link> : null}
        {w.note ? <p lang={w.lang}>{w.note}</p> : null}
        {w.link ? (
          <p>
            <a href={w.link} target="_blank" rel="noopener noreferrer">
              {t('works.openLink')}
            </a>
          </p>
        ) : null}
        <div className="work-controls">
          <button
            type="button"
            className="btn"
            disabled={busy || edit}
            ref={editButton}
            aria-expanded={edit}
            onClick={() => setEdit(true)}
          >
            {t('works.edit')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || edit}
            onClick={() => void change('treasure')}
          >
            {t(w.treasured ? 'works.unTreasure' : 'works.treasure')}
          </button>
          <button type="button" className="btn" disabled={busy || edit} onClick={() => void change('trash')}>
            {t('works.trash')}
          </button>
        </div>
        <label className="cover-input">
          {t('works.cover')}
          <input
            name={`work-cover-${w.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || edit}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void cover(file);
              e.target.value = '';
            }}
          />
        </label>
        <p className="source-note">{t('works.coverNote')}</p>
        {w.hasCover ? (
          <button
            type="button"
            className="btn"
            disabled={busy || edit}
            onClick={() => void change('coverRemove')}
          >
            {t('works.removeCover')}
          </button>
        ) : null}
        <WorkMessage code={message} />
        {edit ? (
          <WorkEditor
            work={w}
            projects={projects}
            close={() => {
              setEdit(false);
              restoreEditorFocus(editButton);
            }}
          />
        ) : null}
      </div>
    </article>
  );
}
export function WorksPanel({ projectId }: { projectId?: string }) {
  const { t, locale } = useI18n();
  const addButton = useRef<HTMLButtonElement>(null);
  const invalidate = useInvalidate();
  const { data, error } = useResource<{ works: Work[]; projects: Project[] }>('/api/works');
  const [adding, setAdding] = useState(false),
    [kind, setKind] = useState(''),
    [project, setProject] = useState(''),
    [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const selected =
    data?.works.filter(
      (w) =>
        (!(projectId ?? project) || w.projectId === (projectId ?? project)) && (!kind || w.kind === kind),
    ) ?? [];
  const hasData = !!data;
  useEffect(() => {
    if (hasData && /^#work-\d+$/.test(location.hash)) {
      const target = document.getElementById(location.hash.slice(1));
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    }
  }, [hasData]);
  const restore = async (w: Work) => {
    setBusy(true);
    try {
      await api('POST', `/api/works/${w.id}/restore`, { revision: w.revision });
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
    <section className="works-panel">
      <div className="section-heading">
        <h2>{t('works.heading')}</h2>
        <button
          ref={addButton}
          className="btn"
          type="button"
          disabled={adding}
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          {t('works.new')}
        </button>
      </div>
      {!data ? (
        <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      ) : (
        <>
          <div className="work-filters">
            <label>
              {t('works.kind')}
              <select
                name="work-kind-filter"
                value={kind}
                onChange={(e) => {
                  if (confirmDraftDiscard()) setKind(e.target.value);
                }}
              >
                <option value="">{t('overview.all')}</option>
                {WORK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`works.kind.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {!projectId ? (
              <label>
                {t('tasks.project')}
                <select
                  name="work-project-filter"
                  value={project}
                  onChange={(e) => {
                    if (confirmDraftDiscard()) setProject(e.target.value);
                  }}
                >
                  <option value="">{t('overview.all')}</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {localizedName(p, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {adding ? (
            <WorkEditor
              projects={data.projects}
              {...(projectId ? { projectId } : {})}
              close={() => {
                setAdding(false);
                restoreEditorFocus(addButton);
              }}
            />
          ) : null}
          <div className="work-grid">
            {selected
              .filter((w) => !w.deletedAt)
              .map((w) => (
                <WorkCard key={w.id} work={w} projects={data.projects} />
              ))}
          </div>
          {!selected.some((w) => !w.deletedAt) ? <p>{t('studio.empty')}</p> : null}
          <details className="work-trash">
            <summary>{t('works.recycled')}</summary>
            {selected
              .filter((w) => w.deletedAt)
              .map((w) => (
                <p key={w.id}>
                  <span lang={w.lang}>{w.title}</span>{' '}
                  <button type="button" className="btn" disabled={busy} onClick={() => void restore(w)}>
                    {t('history.restore')}
                  </button>
                </p>
              ))}
          </details>
          <WorkMessage code={message} />
        </>
      )}
    </section>
  );
}
export function StudioPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.studio')} />
      <WorksPanel />
    </>
  );
}
