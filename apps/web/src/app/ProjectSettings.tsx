import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useInvalidate } from './data.tsx';
import { ReviewMessage } from './ProjectDetail.tsx';
import { ATTENTION, CATEGORIES, PRIORITIES, type ProjectDetail } from './types.ts';

export function ProjectSettings({ project: p }: { project: ProjectDetail }) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState(p);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ProjectDetail, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('PATCH', `/api/projects/${encodeURIComponent(p.id)}`, {
        expectedUpdatedAt: p.updatedAt,
        name: draft.name,
        nameJa: draft.nameJa,
        nameEn: draft.nameEn,
        attention: draft.attention,
        category: draft.category,
        priority: draft.priority,
        freshnessDays: draft.freshnessDays,
        coreMilestones: draft.coreMilestones,
        agentAssignments: draft.agentAssignments,
        repositoryUrl: draft.repositoryUrl,
        websiteUrl: draft.websiteUrl,
      });
      setMessage('saved');
      invalidate();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="project-settings" onSubmit={save}>
      <p className="mono">{p.id}</p>
      <div className="settings-fields">
        {(['name', 'nameJa', 'nameEn'] as const).map((key) => (
          <label className="field" key={key}>
            <span>{t(`settings.${key}`)}</span>
            <input
              value={draft[key]}
              required={key === 'name'}
              maxLength={80}
              onChange={(e) => set(key, e.currentTarget.value)}
            />
          </label>
        ))}
        <label className="field">
          <span>{t('project.field.attention')}</span>
          <select value={draft.attention} onChange={(e) => set('attention', e.currentTarget.value)}>
            {ATTENTION.map((v) => (
              <option key={v} value={v}>
                {t(`attention.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('settings.category')}</span>
          <select value={draft.category} onChange={(e) => set('category', e.currentTarget.value)}>
            {CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {t(`category.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('settings.priority')}</span>
          <select value={draft.priority} onChange={(e) => set('priority', e.currentTarget.value)}>
            {PRIORITIES.map((v) => (
              <option key={v} value={v}>
                {t(`priority.${v}`)}
              </option>
            ))}
          </select>
        </label>
        {p.tracking === 'protocol' ? (
          <label className="field">
            <span>{t('project.field.freshness')}</span>
            <input
              type="number"
              min={1}
              max={365}
              value={draft.freshnessDays}
              onChange={(e) => set('freshnessDays', Number(e.currentTarget.value))}
            />
          </label>
        ) : null}
        {(['repositoryUrl', 'websiteUrl'] as const).map((key) => (
          <label className="field" key={key}>
            <span>{t(`settings.${key}`)}</span>
            <input
              type="url"
              value={draft[key]}
              maxLength={1000}
              onChange={(e) => set(key, e.currentTarget.value)}
            />
          </label>
        ))}
      </div>
      {p.current ? (
        <fieldset className="core-options">
          <legend>{t('settings.core')}</legend>
          {p.current.snapshot.milestones.map((m) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={draft.coreMilestones.includes(m.id)}
                onChange={(e) =>
                  set(
                    'coreMilestones',
                    e.currentTarget.checked
                      ? [...draft.coreMilestones, m.id]
                      : draft.coreMilestones.filter((id) => id !== m.id),
                  )
                }
              />
              <span lang="zh-Hans">{m.title}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="core-options">
        <legend>{t('settings.agents')}</legend>
        {(['codex', 'claude', 'other'] as const).map((agent) => {
          const assignment = draft.agentAssignments.find((a) => a.agent === agent);
          return (
            <div key={agent}>
              <label>
                <input
                  type="checkbox"
                  checked={!!assignment}
                  onChange={(e) =>
                    set(
                      'agentAssignments',
                      e.currentTarget.checked
                        ? [...draft.agentAssignments, { agent, scope: '' }]
                        : draft.agentAssignments.filter((a) => a.agent !== agent),
                    )
                  }
                />
                {t(`agent.${agent}`)}
              </label>
              {assignment ? (
                <label className="field">
                  <span>{t('settings.scope')}</span>
                  <textarea
                    value={assignment.scope}
                    maxLength={2000}
                    onChange={(e) =>
                      set(
                        'agentAssignments',
                        draft.agentAssignments.map((a) =>
                          a.agent === agent ? { ...a, scope: e.currentTarget.value } : a,
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {t('action.save')}
      </button>
      <ReviewMessage code={message} />
    </form>
  );
}
