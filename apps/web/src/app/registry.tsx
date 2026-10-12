/** 设置 → 项目登记（P3.1）：登记新项目，改名称、关注状态和过期天数。 */
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { ATTENTION, type Attention, type Project } from './types.ts';

function errorKey(error: unknown): MessageKey {
  const code = error instanceof ApiError ? error.code : 'unknown';
  const known = ['invalid_id', 'invalid_name', 'exists', 'invalid_field', 'not_found', 'offline'];
  return `apiError.${known.includes(code) ? code : 'unknown'}` as MessageKey;
}

function ProjectRow({ project }: { project: Project }) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const id = useId();
  const [name, setName] = useState(project.name);
  const [attention, setAttention] = useState<Attention>(project.attention);
  const [days, setDays] = useState(String(project.freshnessDays));
  const [status, setStatus] = useState<
    { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; key: MessageKey }
  >({
    kind: 'idle',
  });

  // 别处改了同一个项目（或重新读取）时同步。
  useEffect(() => {
    setName(project.name);
    setAttention(project.attention);
    setDays(String(project.freshnessDays));
  }, [project.name, project.attention, project.freshnessDays]);

  const dirty =
    name !== project.name || attention !== project.attention || days !== String(project.freshnessDays);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'saving' });
    try {
      await api('PATCH', `/api/projects/${encodeURIComponent(project.id)}`, {
        name,
        attention,
        freshnessDays: Number(days),
      });
      setStatus({ kind: 'saved' });
      invalidate();
    } catch (error) {
      setStatus({ kind: 'error', key: errorKey(error) });
    }
  };

  return (
    <li>
      <form className="reg-row" onSubmit={save} aria-labelledby={`${id}-id`}>
        <span className="reg-id mono" id={`${id}-id`}>
          {project.id}
        </span>
        <label className="field">
          <span className="field-label">{t('project.field.name')}</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('project.field.attention')}</span>
          <select value={attention} onChange={(e) => setAttention(e.currentTarget.value as Attention)}>
            {ATTENTION.map((a) => (
              <option key={a} value={a}>
                {t(`attention.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-narrow">
          <span className="field-label">{t('project.field.freshness')}</span>
          <input
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.currentTarget.value)}
          />
        </label>
        <button type="submit" className="btn" disabled={!dirty || status.kind === 'saving'}>
          {t('action.save')}
        </button>
        <p className={`reg-status${status.kind === 'error' ? ' is-error' : ''}`} role="status">
          {status.kind === 'saved' && !dirty
            ? t('action.saved')
            : status.kind === 'error'
              ? t(status.key)
              : ''}
        </p>
      </form>
    </li>
  );
}

function AddProject() {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/projects', { id: id.trim(), name });
      setId('');
      setName('');
      invalidate();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="reg-add" onSubmit={submit}>
      <h3 className="reg-add-title">{t('settings.addProject')}</h3>
      <div className="reg-add-fields">
        <label className="field">
          <span className="field-label">{t('project.field.id')}</span>
          <input
            className="mono"
            value={id}
            required
            maxLength={64}
            placeholder="demo.alpha"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setId(e.currentTarget.value)}
            aria-invalid={error === 'apiError.invalid_id' || error === 'apiError.exists'}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('project.field.name')}</span>
          <input
            value={name}
            required
            maxLength={80}
            onChange={(e) => setName(e.currentTarget.value)}
            aria-invalid={error === 'apiError.invalid_name'}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('action.register')}
        </button>
      </div>
      <p className="reg-status is-error" role="alert">
        {error ? t(error) : ''}
      </p>
    </form>
  );
}

export function ProjectRegistry() {
  const { t } = useI18n();
  const { data, error } = useResource<{ projects: Project[] }>('/api/projects');
  return (
    <section className="settings-group" aria-labelledby="set-projects">
      <h2 id="set-projects" className="settings-title">
        {t('settings.projects')}
      </h2>
      {data ? (
        <ul className="reg-list">
          {data.projects.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </ul>
      ) : (
        <p className="settings-note">{error ? t('projects.loadFailed') : t('common.loading')}</p>
      )}
      <AddProject />
    </section>
  );
}
