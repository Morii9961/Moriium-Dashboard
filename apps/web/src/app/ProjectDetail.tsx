import type { Milestone } from '@moriium-dashboard/protocol';
import { type CSSProperties, type FormEvent, lazy, type ReactNode, useEffect, useState } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { figureOf } from '../components/ProjectStrip.tsx';
import { EvidenceTag } from '../components/parts.tsx';
import {
  EVIDENCE_ZONE,
  inkStyle,
  ROMAN,
  RulerCells,
  ZoneBar,
  ZoneBlock,
  zoneOf,
  zoneStyle,
} from '../components/Zone.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { ProjectHistory } from './History.tsx';
import { ItemReview, ItemReviewList } from './ItemReview.tsx';
import { ManualProject } from './ManualProject.tsx';
import { ProjectSettings } from './ProjectSettings.tsx';
import { confirmDraftDiscard } from './router.tsx';
import { TaskFromAction, TasksPanel } from './Tasks.tsx';
import { AddToFocus } from './Today.tsx';
import {
  type AcceptanceRecord,
  localizedName,
  type ProjectDetail,
  type ProjectWithCurrent,
} from './types.ts';

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

/**
 * 详情页头（DESIGN.md 第 6 节）：灰阶栏是本项目那一格的整列高灰条；正文是名字（按报告新鲜度褪墨）与摘要；
 * 信息栏是小尺与黑三角、四个数、报告来源与依据。
 */
export function DetailHead({
  project: p,
  now,
  actions,
}: {
  project: ProjectWithCurrent;
  now: Date;
  actions?: ReactNode;
}) {
  const { t, locale, snapshotTime, relative } = useI18n();
  const c = p.current;
  const s = c?.snapshot;
  const z = zoneOf(s?.stage);
  const name = localizedName(p, locale);
  const f = s
    ? figureOf(
        s,
        t,
        p.acceptances,
        p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
      )
    : null;
  const offset = c ? Math.abs(c.offsetMinutes) : 0;
  const tz = c
    ? `UTC${c.offsetMinutes >= 0 ? '+' : '-'}${String(Math.floor(offset / 60)).padStart(2, '0')}:${String(offset % 60).padStart(2, '0')}`
    : '';
  return (
    <header className="g dhead">
      <div className="idx">
        <ZoneBar zone={z} tall />
      </div>
      <div className="main">
        <p className="kicker">
          {s ? t(`stage.${s.stage}`) : p.tracking === 'manual' ? t('manual.recorded') : t('map.noSnapshot')}
          <span className="mono">{p.id}</span>
        </p>
        <h1
          className="d-name page-title"
          id="d-name"
          tabIndex={-1}
          style={c ? inkStyle(c.utcMs, now) : undefined}
        >
          {name}
        </h1>
        {s ? (
          <p className="lede" lang="zh-Hans">
            {s.summary}
          </p>
        ) : null}
        {c?.reporter.note ? (
          <p className="lede-note" lang="zh-Hans">
            {c.reporter.note}
          </p>
        ) : null}
        {actions ? <div className="head-actions flush">{actions}</div> : null}
      </div>
      {c && s && f ? (
        <div className="rail">
          {z != null ? (
            <div className="mini" style={{ '--col': 10 - z } as CSSProperties}>
              <span className="marker" aria-hidden="true" />
              <RulerCells />
              <p className="here">
                {t(`stage.${s.stage}`)} · Zone {ROMAN[z]}
              </p>
            </div>
          ) : null}
          <dl className="quad">
            <div>
              <dt>{t('more.milestones')}</dt>
              <dd>
                {f.p.done}
                <i>/</i>
                {f.p.total}
              </dd>
            </div>
            <div>
              <dt>{t('more.pending')}</dt>
              <dd
                title={t('more.pendingDetail', {
                  decisions: f.p.decisions,
                  acceptances: f.p.awaitingAcceptance,
                })}
              >
                {f.p.decisions + f.p.awaitingAcceptance}
              </dd>
            </div>
            <div>
              <dt>{t('more.blockers')}</dt>
              <dd>{s.blockers.length}</dd>
            </div>
            <div>
              <dt>{t('zone.progress')}</dt>
              <dd title={f.label}>{f.text}</dd>
            </div>
          </dl>
          <dl className="facts" aria-label={t('detail.source')}>
            <div>
              <dt>{t('more.reporter')}</dt>
              <dd>
                {t(c.reporter.agent ? `agent.${c.reporter.agent}` : 'agent.unknown')}{' '}
                {c.reporter.source === 'branch' ? t('detail.inferred') : null}
              </dd>
            </div>
            <div>
              <dt>{t('more.source')}</dt>
              <dd className="mono">
                {s.source.branch ?? t('more.branchUnknown')}{' '}
                {s.source.commit_sha ? `@ ${s.source.commit_sha.slice(0, 7)}` : null}
              </dd>
            </div>
            <div>
              <dt>{t('more.snapshot')}</dt>
              <dd>
                <time dateTime={c.snapshotAt} title={c.snapshotAt}>
                  {snapshotTime(c.utcMs, c.offsetMinutes)} ({tz}) · {relative(c.utcMs, now)}
                </time>
              </dd>
            </div>
            <div>
              <dt>{t('detail.imported')}</dt>
              <dd>
                <time dateTime={c.importedAt} title={t('detail.notOnline')}>
                  {snapshotTime(Date.parse(c.importedAt), 480)} (UTC+8)
                </time>
              </dd>
            </div>
            <div>
              <dt>{t('detail.tests')}</dt>
              <dd>{t(s.source.tests_rerun ? 'detail.testsRerun' : 'detail.testsNotRerun')}</dd>
            </div>
          </dl>
          <details className="basis">
            <summary>{t('detail.basis', { n: s.source.basis.length })}</summary>
            <ReferenceList refs={s.source.basis} />
          </details>
        </div>
      ) : null}
    </header>
  );
}

const EV_KEYS = ['unknown', 'self_report', 'repository', 'existing_test', 'morii_accepted'] as const;
const EV_LABEL = {
  unknown: 'evidence.unknown',
  self_report: 'evidence.self',
  repository: 'evidence.evidence',
  existing_test: 'evidence.test',
  morii_accepted: 'evidence.reported',
} as const;

/** 证据构成：一条按数量分段的灰阶条 + 「色块 · 名称 · 计数」，不写说明句（DESIGN.md 第 8 节）。 */
function EvidenceBar({
  milestones,
  acceptances,
}: {
  milestones: readonly Milestone[];
  acceptances: readonly AcceptanceRecord[];
}) {
  const { t } = useI18n();
  const count = Object.fromEntries(EV_KEYS.map((k) => [k, 0])) as Record<(typeof EV_KEYS)[number], number>;
  for (const m of milestones) {
    const accepted = acceptances.some((a) => a.milestoneId === m.id && a.status === 'accepted');
    count[accepted ? 'morii_accepted' : m.evidence_level] += 1;
  }
  const parts = EV_KEYS.map((k) => ({ k, z: EVIDENCE_ZONE[k], n: count[k] }));
  return (
    <div className="evbar" role="img" aria-label={parts.map((x) => `${t(EV_LABEL[x.k])} ${x.n}`).join('，')}>
      <div className="evstrip" aria-hidden="true">
        {parts
          .filter((x) => x.n)
          .map((x) => (
            <span
              key={x.k}
              className={x.z === 10 ? 'blank' : undefined}
              style={{ flex: `${x.n} 1 0`, ...zoneStyle(x.z) }}
            >
              {ROMAN[x.z]}
            </span>
          ))}
      </div>
      <ul className="evkey" aria-hidden="true">
        {parts.map((x) => (
          <li key={x.k} className={x.n ? undefined : 'nil'}>
            <i className={`sw${x.z === 10 ? ' blank' : ''}`} style={zoneStyle(x.z)} />
            <span>{t(EV_LABEL[x.k])}</span>
            <b>{x.n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 区块标题：灰阶栏是大数字，正文是标题，信息栏可放分布条。 */
function SectionHead({
  id,
  n,
  title,
  note,
  rail,
}: {
  id: string;
  n: number;
  title: string;
  note?: ReactNode;
  rail?: ReactNode;
}) {
  return (
    <header className="g shead">
      <div className="idx">
        <span className="bign">{n}</span>
      </div>
      <div className="main">
        <h2 className="stitle" id={id}>
          {title}
          {note ? <span>{note}</span> : null}
        </h2>
      </div>
      {rail ? <div className="rail">{rail}</div> : null}
    </header>
  );
}

type Section = 'summary' | 'history' | 'works' | 'tasks' | 'settings';

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { t, snapshotTime } = useI18n();
  const { data, error } = useResource<{ project: ProjectDetail }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );
  const [section, setSection] = useState<Section>(() =>
    location.hash === '#history' ? 'history' : 'summary',
  );
  useEffect(() => {
    if (!data || section !== 'summary' || !location.hash.startsWith('#milestone-')) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [data, section]);
  if (!data) return <p className="loading-line">{t(error ? 'projects.loadFailed' : 'common.loading')}</p>;
  const p = data.project;
  const s = p.current?.snapshot;
  const snapshotId = p.current?.id ?? 0;
  const toAccept = s
    ? s.milestones.filter(
        (m) =>
          m.status === 'done' &&
          (p.acceptances.find((a) => a.milestoneId === m.id)?.status === 'rejected' ||
            (!p.acceptances.some((a) => a.milestoneId === m.id) && m.human_acceptance === 'pending')),
      )
    : [];
  const decisions = p.reviewItems.filter((i) => i.kind === 'needs_morii');
  const blockers = p.reviewItems.filter((i) => i.kind === 'blockers');
  const pendingDecisions = decisions.filter((i) => i.pending && !i.gone).length;
  const open = s ? s.milestones.filter((m) => m.status !== 'done').length : 0;
  const sections: Section[] =
    p.tracking === 'manual'
      ? ['summary', 'works', 'tasks', 'settings']
      : ['summary', 'history', 'works', 'tasks', 'settings'];
  return (
    <>
      <div className="g detail-tabs-row">
        <fieldset className="main list-filters detail-tabs">
          <legend className="sr-only">{t('detail.sections')}</legend>
          {sections.map((key) => (
            <button
              type="button"
              className="btn"
              key={key}
              aria-pressed={key === section}
              onClick={() => {
                if (key !== section && confirmDraftDiscard()) setSection(key);
              }}
            >
              {t(`detail.${key}`)}
            </button>
          ))}
        </fieldset>
      </div>
      {section !== 'summary' || p.tracking === 'manual' ? (
        <div className="g tab-body">
          <div className="main wide">
            {section === 'works' ? (
              <WorksPanel projectId={p.id} />
            ) : section === 'tasks' ? (
              <TasksPanel projectId={p.id} />
            ) : section === 'history' ? (
              <ProjectHistory projectId={p.id} />
            ) : section === 'settings' ? (
              <ProjectSettings key={p.updatedAt} project={p} />
            ) : (
              <ManualProject key={p.updatedAt} project={p} />
            )}
          </div>
        </div>
      ) : s ? (
        <div className="project-detail">
          <section className="block" aria-labelledby="d-nd">
            <SectionHead
              id="d-nd"
              n={pendingDecisions + toAccept.length}
              title={t('nav.inbox')}
              note={t('more.pendingDetail', { decisions: pendingDecisions, acceptances: toAccept.length })}
            />
            <div className="g dsplit">
              <div className="main">
                <ol className="dec">
                  {decisions
                    .filter((i) => !i.gone)
                    .map((item) => (
                      <ItemReview
                        key={`${item.kind}:${item.key}:${item.state?.at ?? ''}`}
                        item={item}
                        projectId={p.id}
                        snapshotId={snapshotId}
                      />
                    ))}
                </ol>
                {decisions.some((i) => i.gone) ? (
                  <ItemReviewList
                    items={decisions.filter((i) => i.gone)}
                    projectId={p.id}
                    snapshotId={snapshotId}
                  />
                ) : null}
                {!decisions.some((i) => i.pending) ? <p className="empty-line">{t('inbox.empty')}</p> : null}
              </div>
              {toAccept.length ? (
                <div className="rail">
                  <h3 className="tier">
                    {t('detail.awaiting')}
                    <span>{toAccept.length}</span>
                  </h3>
                  <ol className="acc">
                    {toAccept.map((m) => (
                      <li key={m.id}>
                        <span className="no">{m.id}</span>
                        <a href={`#milestone-${encodeURIComponent(m.id)}`} lang="zh-Hans">
                          {m.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </section>

          <section className="block" aria-labelledby="d-ms">
            <SectionHead
              id="d-ms"
              n={open}
              title={t('more.milestones')}
              note={
                <>
                  {t('more.milestonesDone', { done: s.milestones.length - open, total: s.milestones.length })}
                  {p.stageEntry
                    ? ` · ${
                        p.stageEntry.onlySnapshot
                          ? t('detail.firstStage')
                          : t('detail.stageSince', {
                              date: snapshotTime(p.stageEntry.utcMs, p.stageEntry.offsetMinutes),
                            })
                      }`
                    : null}
                </>
              }
              rail={<EvidenceBar milestones={s.milestones} acceptances={p.acceptances} />}
            />
            <ol className="ms">
              {s.milestones.map((m) => {
                const record = p.acceptances.find((a) => a.milestoneId === m.id);
                const ez = record?.status === 'accepted' ? 1 : EVIDENCE_ZONE[m.evidence_level];
                const done = m.status === 'done';
                return (
                  <li
                    key={m.id}
                    id={`milestone-${encodeURIComponent(m.id)}`}
                    tabIndex={-1}
                    className={`g mrow ${done ? 'is-done' : 'is-open'}`}
                  >
                    <div className="idx">
                      <ZoneBlock zone={ez} className="mblock" />
                    </div>
                    <div className="main">
                      <p className="mt">
                        <span className="mid">{m.id}</span>
                        <span className="mtt" lang="zh-Hans">
                          {m.title}
                        </span>
                      </p>
                      {m.evidence_refs.length ? (
                        <details className="refs">
                          <summary>
                            {t('detail.references', { n: m.evidence_refs.length })} ·{' '}
                            {t(EV_LABEL[m.evidence_level])}
                          </summary>
                          <ReferenceList refs={m.evidence_refs} />
                        </details>
                      ) : null}
                    </div>
                    <div className="rail st">
                      <b className={m.status === 'blocked' ? 'blocked' : undefined}>
                        {t(`status.${m.status}`)}
                      </b>
                      <Acceptance project={p} milestone={m} record={record} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="block" aria-labelledby="d-bl">
            <SectionHead id="d-bl" n={s.blockers.length} title={t('more.blockers')} />
            <div className="g">
              <div className="main">
                <ol className="dec blockers">
                  {blockers
                    .filter((i) => !i.gone)
                    .map((item) => (
                      <ItemReview
                        key={`${item.kind}:${item.key}:${item.state?.at ?? ''}`}
                        item={item}
                        projectId={p.id}
                        snapshotId={snapshotId}
                      />
                    ))}
                </ol>
                {blockers.some((i) => i.gone) ? (
                  <ItemReviewList
                    items={blockers.filter((i) => i.gone)}
                    projectId={p.id}
                    snapshotId={snapshotId}
                  />
                ) : null}
                {!s.blockers.length ? <p className="empty-line">{t('detail.noBlockers')}</p> : null}
              </div>
            </div>
          </section>

          <section className="block" aria-labelledby="d-nx">
            <SectionHead id="d-nx" n={s.next_actions.length} title={t('more.next')} />
            <div className="g">
              <div className="main">
                <ol className="nexts">
                  {[...s.next_actions]
                    .sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9'))
                    .map((a) => (
                      <li key={a.id ?? a.title}>
                        <p className="it">
                          <span className={`prio prio-${a.priority ?? 'none'}`}>{a.priority ?? '—'}</span>{' '}
                          <span lang="zh-Hans">{a.title}</span>
                        </p>
                        <p className="ix" lang="zh-Hans">
                          {a.result}
                        </p>
                        <div className="row-actions">
                          <AddToFocus title={a.title} />
                          <TaskFromAction
                            projectId={p.id}
                            snapshotId={snapshotId}
                            index={s.next_actions.indexOf(a)}
                          />
                        </div>
                      </li>
                    ))}
                </ol>
                {!s.next_actions.length ? <p className="empty-line">{t('more.noNext')}</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
