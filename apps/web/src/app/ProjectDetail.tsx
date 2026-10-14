import type { Milestone } from '@moriium-dashboard/protocol';
import { type FormEvent, lazy, useEffect, useState } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { EvidenceTag, LineMap, StatusMark } from '../components/parts.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { evidenceSummary } from '../progress.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { ProjectHistory } from './History.tsx';
import { ItemReviewList } from './ItemReview.tsx';
import { ManualProject } from './ManualProject.tsx';
import { ProjectSettings } from './ProjectSettings.tsx';
import { TaskFromAction, TasksPanel } from './Tasks.tsx';
import { AddToFocus } from './Today.tsx';
import type { AcceptanceRecord, ProjectDetail } from './types.ts';

const WorksPanel = lazy(() => import('./Works.tsx').then((m) => ({ default: m.WorksPanel })));

export function ReferenceList({ refs }: { refs: readonly string[] }) {
  const { t } = useI18n();
  return (
    <ul className="reference-list">
      {refs.map((ref, i) => {
        let clickable = false;
        try {
          clickable = new URL(ref).protocol === 'https:';
        } catch {
          /* 普通文本 */
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 引用可能重复，不会重排。
          <li key={i}>
            {clickable ? (
              <a href={ref} target="_blank" rel="noopener noreferrer" lang="zh-Hans">
                {ref}
              </a>
            ) : (
              <CopyLine text={ref} lang="zh-Hans" />
            )}
          </li>
        );
      })}
      {refs.length ? <li className="source-note">{t('detail.unverified')}</li> : null}
    </ul>
  );
}

export function ReviewMessage({ code }: { code: string | null }) {
  const { t } = useI18n();
  return (
    <p role="status" className={code === 'saved' ? 'save-status' : 'save-status is-error'}>
      {code
        ? t(
            code === 'saved'
              ? 'action.saved'
              : code === 'project_changed'
                ? 'manual.changed'
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

function Acceptance({
  project,
  milestone,
  record,
}: {
  project: ProjectDetail;
  milestone: Milestone;
  record: AcceptanceRecord | undefined;
}) {
  const { t, locale } = useI18n();
  const invalidate = useInvalidate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
    if (!project.current || !button) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(
        'PUT',
        `/api/acceptance/${encodeURIComponent(project.id)}/${encodeURIComponent(milestone.id)}`,
        { status: button.value, note, snapshotId: project.current.id },
      );
      setMessage('saved');
      setNote('');
      invalidate();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      if (e instanceof ApiError && e.code === 'snapshot_changed') invalidate();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="acceptance-cell">
      {record ? (
        <>
          <EvidenceTag kind={record.status} date={fmt.format(new Date(record.at))} />
          <p className="source-note">{t('detail.basisSnapshot', { id: record.snapshotId })}</p>
          {record.note ? <p lang="zh-Hans">{record.note}</p> : null}
        </>
      ) : milestone.human_acceptance === 'accepted' || milestone.evidence_level === 'morii_accepted' ? (
        <EvidenceTag kind="reported" />
      ) : milestone.human_acceptance === 'rejected' ? (
        <span>{t('detail.reportedRejected')}</span>
      ) : (
        <span>
          {t(
            milestone.status === 'done' && milestone.human_acceptance === 'pending'
              ? 'detail.awaiting'
              : 'detail.noAcceptance',
          )}
        </span>
      )}
      {record?.status === 'rejected' &&
      (milestone.human_acceptance === 'accepted' || milestone.evidence_level === 'morii_accepted') ? (
        <p className="contradiction" role="note">
          {t('detail.contradiction')}
        </p>
      ) : null}
      <details>
        <summary>{t('detail.recordAcceptance')}</summary>
        <form onSubmit={save} className="review-form">
          <label className="field">
            <span>{t('detail.note')}</span>
            <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.currentTarget.value)} />
          </label>
          <div className="page-actions">
            <button
              type="submit"
              name="status"
              value="accepted"
              className="btn"
              disabled={busy || milestone.status !== 'done'}
            >
              {t('detail.accept')}
            </button>
            <button type="submit" name="status" value="rejected" className="btn" disabled={busy}>
              {t('detail.reject')}
            </button>
          </div>
          <ReviewMessage code={message} />
        </form>
      </details>
    </div>
  );
}

function Source({ project }: { project: ProjectDetail }) {
  const { t, snapshotTime } = useI18n();
  const c = project.current;
  if (!c) return null;
  const s = c.snapshot;
  const offset = Math.abs(c.offsetMinutes);
  const zone = `UTC${c.offsetMinutes >= 0 ? '+' : '-'}${String(Math.floor(offset / 60)).padStart(2, '0')}:${String(offset % 60).padStart(2, '0')}`;
  return (
    <section className="source-panel" aria-label={t('detail.source')}>
      <dl className="source-grid">
        <dt>{t('more.reporter')}</dt>
        <dd>
          {t(c.reporter.agent ? `agent.${c.reporter.agent}` : 'agent.unknown')}{' '}
          {c.reporter.source === 'branch' ? t('detail.inferred') : null}
        </dd>
        <dt>{t('more.source')}</dt>
        <dd className="mono">
          {s.source.branch ?? t('more.branchUnknown')}{' '}
          {s.source.commit_sha ? `@ ${s.source.commit_sha}` : null}
        </dd>
        <dt>{t('more.snapshot')}</dt>
        <dd>
          <time dateTime={c.snapshotAt} title={c.snapshotAt}>
            {snapshotTime(c.utcMs, c.offsetMinutes)} ({zone})
          </time>
        </dd>
        <dt>{t('detail.imported')}</dt>
        <dd>
          <time dateTime={c.importedAt}>{snapshotTime(Date.parse(c.importedAt), 480)} (UTC+8)</time> ·{' '}
          {t('detail.notOnline')}
        </dd>
        <dt>{t('detail.tests')}</dt>
        <dd>{t(s.source.tests_rerun ? 'detail.testsRerun' : 'detail.testsNotRerun')}</dd>
      </dl>
      {c.reporter.note ? <p lang="zh-Hans">{c.reporter.note}</p> : null}
      <details>
        <summary>{t('detail.basis', { n: s.source.basis.length })}</summary>
        <ReferenceList refs={s.source.basis} />
      </details>
      <p className="project-summary" lang="zh-Hans">
        {s.summary}
      </p>
    </section>
  );
}

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { t, snapshotTime } = useI18n();
  const { data, error } = useResource<{ project: ProjectDetail }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );
  const [section, setSection] = useState(() => (location.hash === '#history' ? 'history' : 'summary'));
  useEffect(() => {
    if (!data || section !== 'summary' || !location.hash.startsWith('#milestone-')) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [data, section]);
  if (!data) return <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>;
  const p = data.project;
  const s = p.current?.snapshot;
  return (
    <>
      <Source project={p} />
      <fieldset className="list-filters detail-tabs">
        <legend className="sr-only">{t('detail.sections')}</legend>
        {(p.tracking === 'manual'
          ? ['summary', 'works', 'tasks', 'settings']
          : ['summary', 'history', 'works', 'tasks', 'settings']
        ).map((key) => (
          <button
            type="button"
            className="btn"
            key={key}
            aria-pressed={key === section}
            onClick={() => setSection(key)}
          >
            {t(`detail.${key as 'summary' | 'history' | 'works' | 'tasks' | 'settings'}`)}
          </button>
        ))}
      </fieldset>
      {section === 'works' ? (
        <WorksPanel projectId={p.id} />
      ) : section === 'tasks' ? (
        <TasksPanel projectId={p.id} />
      ) : section === 'history' ? (
        <ProjectHistory projectId={p.id} />
      ) : section === 'settings' ? (
        <ProjectSettings key={p.updatedAt} project={p} />
      ) : p.tracking === 'manual' ? (
        <ManualProject key={p.updatedAt} project={p} />
      ) : s ? (
        <div className="project-detail">
          <section className="detail-section">
            <h2>{t('more.pending')}</h2>
            <ItemReviewList
              items={p.reviewItems.filter((i) => i.kind === 'needs_morii')}
              projectId={p.id}
              snapshotId={p.current?.id ?? 0}
            />
            {!p.reviewItems.some((i) => i.kind === 'needs_morii' && i.pending) ? (
              <p>{t('inbox.empty')}</p>
            ) : null}
            <ul className="detail-items">
              {s.milestones
                .filter(
                  (m) =>
                    m.status === 'done' &&
                    (p.acceptances.find((a) => a.milestoneId === m.id)?.status === 'rejected' ||
                      (!p.acceptances.some((a) => a.milestoneId === m.id) &&
                        m.human_acceptance === 'pending')),
                )
                .map((m) => (
                  <li key={m.id}>
                    <a href={`#milestone-${encodeURIComponent(m.id)}`}>
                      {t('detail.acceptMilestone', { title: m.title })}
                    </a>
                  </li>
                ))}
            </ul>
          </section>
          <section className="detail-section">
            <LineMap stage={s.stage} />
            {p.stageEntry ? (
              <p>
                {p.stageEntry.onlySnapshot
                  ? t('detail.firstStage')
                  : t('detail.stageSince', {
                      date: snapshotTime(p.stageEntry.utcMs, p.stageEntry.offsetMinutes),
                    })}
              </p>
            ) : null}
            <h2>{t('more.milestones')}</h2>
            <p className="evidence-summary">
              {t('detail.evidenceSummary', evidenceSummary(s, p.acceptances))}
            </p>
            <table className="milestone-table">
              <thead>
                <tr>
                  <th scope="col">{t('detail.milestone')}</th>
                  <th scope="col">{t('detail.evidence')}</th>
                  <th scope="col">{t('detail.acceptance')}</th>
                </tr>
              </thead>
              <tbody>
                {s.milestones.map((m) => (
                  <tr key={m.id} id={`milestone-${encodeURIComponent(m.id)}`} tabIndex={-1}>
                    <th scope="row">
                      <StatusMark status={m.status} />
                      <p lang="zh-Hans">{m.title}</p>
                      <span className="mono source-note">{m.id}</span>
                    </th>
                    <td>
                      <EvidenceTag
                        kind={
                          m.evidence_level === 'repository'
                            ? 'evidence'
                            : m.evidence_level === 'existing_test'
                              ? 'test'
                              : m.evidence_level === 'morii_accepted'
                                ? 'reported'
                                : m.evidence_level === 'unknown'
                                  ? 'unknown'
                                  : 'self'
                        }
                      />
                      {m.evidence_refs.length ? (
                        <details>
                          <summary>{t('detail.references', { n: m.evidence_refs.length })}</summary>
                          <ReferenceList refs={m.evidence_refs} />
                        </details>
                      ) : null}
                    </td>
                    <td>
                      <Acceptance
                        project={p}
                        milestone={m}
                        record={p.acceptances.find((a) => a.milestoneId === m.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="detail-section">
            <h2>{t('more.blockers')}</h2>
            <ItemReviewList
              items={p.reviewItems.filter((i) => i.kind === 'blockers')}
              projectId={p.id}
              snapshotId={p.current?.id ?? 0}
            />
            {!s.blockers.length ? <p>{t('detail.noBlockers')}</p> : null}
          </section>
          <section className="detail-section">
            <h2>{t('more.next')}</h2>
            <ol className="detail-items">
              {[...s.next_actions]
                .sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9'))
                .map((a) => (
                  <li key={a.id ?? a.title}>
                    <span className="prio">{a.priority ?? '—'}</span> <span lang="zh-Hans">{a.title}</span>
                    <p lang="zh-Hans">{a.result}</p>
                    <AddToFocus title={a.title} />
                    <TaskFromAction
                      projectId={p.id}
                      snapshotId={p.current?.id ?? 0}
                      index={s.next_actions.indexOf(a)}
                    />
                  </li>
                ))}
            </ol>
            {!s.next_actions.length ? <p>{t('more.noNext')}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
