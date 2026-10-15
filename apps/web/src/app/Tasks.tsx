import type { NextAction } from '@moriium-dashboard/protocol';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useCreationCommand } from './creation.ts';
import { useInvalidate, useResource } from './data.tsx';
import { restoreEditorFocus, useDraftGuard } from './drafts.ts';
import { confirmDraftDiscard, Link } from './router.tsx';
import { AddToFocus } from './Today.tsx';
import { localizedName, type Project } from './types.ts';

export interface Task {
  id: number;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  projectId: string | null;
  dueDate: string | null;
  status: 'todo' | 'doing' | 'done' | 'dropped';
  sourceSnapshotId: number | null;
  sourceAction: NextAction | null;
  revision: number;
  gone: boolean;
}
function TaskMessage({ code }: { code: string | null }) {
  const { t } = useI18n();
  return (
    <p role="status" className="save-status">
      {code
        ? t(
            code === 'saved'
              ? 'action.saved'
              : code === 'task_changed'
                ? 'tasks.changed'
                : code === 'exists'
                  ? 'tasks.exists'
                  : code === 'snapshot_changed'
                    ? 'detail.changed'
                    : code === 'suspected_secret'
                      ? 'detail.secret'
                      : 'apiError.unknown',
          )
        : ''}
    </p>
  );
}
function TaskEditor({
  task,
  projects,
  projectId,
  close,
}: {
  task?: Task;
  projects: Project[];
  projectId?: string;
  close: () => void;
}) {
  const { t, locale } = useI18n();
  const invalidate = useInvalidate();
  const [expectedRevision] = useState(task?.revision);
  const [title, setTitle] = useState(task?.title ?? '');
  const [project, setProject] = useState(task?.projectId ?? projectId ?? '');
  const [date, setDate] = useState(task?.dueDate ?? '');
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'todo');
  const [initial] = useState({ title, project, date, status });
  const confirmClose = useDraftGuard(
    title !== initial.title ||
      project !== initial.project ||
      date !== initial.date ||
      status !== initial.status,
  );
  const legend = useRef<HTMLLegendElement>(null);
  useEffect(() => {
    legend.current?.focus();
  }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api(task ? 'PATCH' : 'POST', task ? `/api/tasks/${task.id}` : '/api/tasks', {
        title,
        lang: task?.lang ?? locale,
        projectId: project || null,
        dueDate: date || null,
        status,
        ...(task ? { revision: expectedRevision } : {}),
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
    <form className="personal-editor task-editor" onSubmit={save}>
      <fieldset disabled={busy}>
        <legend ref={legend} tabIndex={-1}>
          {t(task ? 'tasks.edit' : 'tasks.new')}
        </legend>
        <label>
          {t('tasks.title')}
          <input
            name="task-title"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={2000}
          />
        </label>
        <label>
          {t('tasks.project')}
          <select
            name="task-project"
            value={project}
            disabled={!!task?.sourceSnapshotId}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">{t('tasks.noProject')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {localizedName(p, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('tasks.due')}
          <input
            name="task-due-date"
            autoComplete="off"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          {t('tasks.status')}
          <select
            name="task-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Task['status'])}
          >
            {(['todo', 'doing', 'done', 'dropped'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`tasks.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
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
        <TaskMessage code={message} />
      </fieldset>
    </form>
  );
}
function TaskRow({ task, projects }: { task: Task; projects: Project[] }) {
  const { t, locale, calendarDate } = useI18n();
  const editButton = useRef<HTMLButtonElement>(null);
  const invalidate = useInvalidate();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const project = projects.find((p) => p.id === task.projectId);
  const change = async () => {
    setBusy(true);
    try {
      await api('PATCH', `/api/tasks/${task.id}`, {
        revision: task.revision,
        status: task.status === 'done' ? 'todo' : 'done',
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
    <li className="task-row">
      <label className="task-check">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          disabled={busy || edit}
          onChange={() => void change()}
        />
        <span lang={task.lang}>{task.title}</span>
      </label>
      <p>
        {t(`tasks.status.${task.status}`)} · {task.dueDate ? calendarDate(task.dueDate) : t('tasks.noDate')}
        {project ? (
          <>
            {' '}
            · <Link to={`/projects/${encodeURIComponent(project.id)}`}>{localizedName(project, locale)}</Link>
          </>
        ) : null}
      </p>
      {task.sourceSnapshotId && task.projectId ? (
        <p>
          <a
            href={`/projects/${encodeURIComponent(task.projectId)}?snapshot=${task.sourceSnapshotId}#history`}
          >
            {t('tasks.source', { id: task.sourceSnapshotId })}
          </a>
          <span lang="zh-Hans"> · {task.sourceAction?.title}</span>
        </p>
      ) : null}
      {task.gone ? <p className="source-note">{t('tasks.gone')}</p> : null}
      <div className="page-actions">
        <button
          ref={editButton}
          type="button"
          className="btn"
          disabled={edit}
          aria-expanded={edit}
          onClick={() => setEdit(true)}
        >
          {t('tasks.edit')}
        </button>
        {task.status !== 'done' && task.status !== 'dropped' ? (
          <AddToFocus title={task.title} lang={task.lang} taskId={task.id} />
        ) : null}
      </div>
      <TaskMessage code={message} />
      {edit ? (
        <TaskEditor
          task={task}
          projects={projects}
          close={() => {
            setEdit(false);
            restoreEditorFocus(editButton);
          }}
        />
      ) : null}
    </li>
  );
}
export function TasksPanel({ projectId }: { projectId?: string }) {
  const { t, locale } = useI18n();
  const { data, error } = useResource<{ tasks: Task[]; projects: Project[] }>('/api/tasks');
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useCreationCommand(
    'task',
    projectId
      ? null
      : () => {
          setAdding(true);
          requestAnimationFrame(() =>
            addButton.current
              ?.closest('section')
              ?.querySelector<HTMLElement>(':scope > .task-editor legend')
              ?.focus(),
          );
        },
  );
  const [filter, setFilter] = useState('');
  const tasks =
    data?.tasks.filter((task) => !(projectId ?? filter) || task.projectId === (projectId ?? filter)) ?? [];
  const open = tasks.filter((task) => task.status === 'todo' || task.status === 'doing');
  const closed = tasks.filter((task) => task.status === 'done' || task.status === 'dropped');
  return (
    <section className="tasks-panel">
      <div className="section-heading">
        <h2>{t('tasks.heading')}</h2>
        <button
          ref={addButton}
          type="button"
          className="btn"
          disabled={adding}
          aria-expanded={adding}
          onClick={() => setAdding(true)}
        >
          {t('tasks.new')}
        </button>
      </div>
      {!data ? (
        <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      ) : (
        <>
          {!projectId ? (
            <label className="task-filter">
              {t('tasks.project')}
              <select
                name="task-project-filter"
                value={filter}
                onChange={(e) => {
                  if (confirmDraftDiscard()) setFilter(e.target.value);
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
          {adding ? (
            <TaskEditor
              projects={data.projects}
              {...(projectId ? { projectId } : {})}
              close={() => {
                setAdding(false);
                restoreEditorFocus(addButton);
              }}
            />
          ) : null}
          {open.length ? (
            <ul className="task-list">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} projects={data.projects} />
              ))}
            </ul>
          ) : (
            <p>{t('tasks.empty')}</p>
          )}
          <details className="closed-tasks">
            <summary>{t('tasks.closed')}</summary>
            <ul className="task-list">
              {closed.map((task) => (
                <TaskRow key={task.id} task={task} projects={data.projects} />
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
export function TaskFromAction({
  projectId,
  snapshotId,
  index,
}: {
  projectId: string;
  snapshotId: number;
  index: number;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      await api('POST', '/api/tasks', { projectId, sourceSnapshotId: snapshotId, actionIndex: index });
      invalidate();
      setMessage('saved');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="task-transfer">
      <button type="button" className="btn" disabled={busy} onClick={() => void create()}>
        {t('tasks.fromAction')}
      </button>
      <TaskMessage code={message} />
    </div>
  );
}
