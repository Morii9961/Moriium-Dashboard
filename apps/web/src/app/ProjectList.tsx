import { useState } from 'react';
import { figureOf } from '../components/ProjectStrip.tsx';
import { LineMap, MilestoneGrid, StaleIcon } from '../components/parts.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { freshness, headlineNextAction, visibleMilestones } from '../progress.ts';
import { Link } from './router.tsx';
import type { ProjectWithCurrent } from './types.ts';

export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export function ReportAge({ project, now }: { project: ProjectWithCurrent; now: Date }) {
  const { t, relative } = useI18n();
  const c = project.current;
  if (!c) return <span>{t('map.noSnapshot')}</span>;
  const state = freshness(c.utcMs, now, c.snapshot.stage, {
    staleAfterDays: project.freshnessDays,
    projectPaused: project.attention === 'paused',
  });
  return (
    <span className={`report-age report-${state}`}>
      {state === 'stale' || state === 'aging' ? <StaleIcon /> : null}
      <time dateTime={c.snapshotAt}>{relative(c.utcMs, now)}</time>
    </span>
  );
}

function ProjectTable({ projects, now }: { projects: ProjectWithCurrent[]; now: Date }) {
  const { t } = useI18n();
  return (
    <table className="projects-table">
      <caption className="sr-only">{t('nav.projects')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('project.field.name')}</th>
          <th scope="col">{t('list.progress')}</th>
          <th scope="col">{t('list.gapNext')}</th>
          <th scope="col">{t('strip.pending')}</th>
          <th scope="col">{t('more.snapshot')}</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const s = p.current?.snapshot;
          const f = s ? figureOf(s, t) : null;
          const selected = s ? visibleMilestones(s.milestones, p.coreMilestones) : [];
          const next = s ? headlineNextAction(s) : null;
          return (
            <tr key={p.id}>
              <th scope="row">
                <Link to={projectPath(p.id)} className="project-title">
                  {p.name}
                </Link>
                <span className="project-attention">{t(`attention.${p.attention}`)}</span>
              </th>
              <td className="project-progress-cell">
                {s && f ? (
                  <>
                    <LineMap stage={s.stage} size="compact" />
                    <div className="project-milestones">
                      <MilestoneGrid milestones={selected} />
                      <span>{t('more.milestonesDone', { done: f.p.done, total: f.p.total })}</span>
                      <strong title={f.source}>
                        <span aria-hidden="true">{f.text}</span>
                        <span className="sr-only">{f.label}</span>
                      </strong>
                    </div>
                    {s.milestones.length > selected.length ? (
                      <span className="project-attention">
                        {t('list.moreMilestones', { n: s.milestones.length - selected.length })}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span>{t(p.tracking === 'manual' ? 'list.manual' : 'map.noSnapshot')}</span>
                )}
              </td>
              <td className="project-gap-cell">
                {f ? (
                  <p>
                    {t(
                      f.p.mature && s && ['launch_preparation', 'live', 'maintenance'].includes(s.stage)
                        ? `mature.${s.stage as 'live' | 'maintenance' | 'launch_preparation'}`
                        : f.p.remaining > 0
                          ? 'gap.remaining'
                          : f.p.total === 0
                            ? 'gap.noMilestones'
                            : f.p.unknown > 0
                              ? 'gap.allKnownDone'
                              : 'gap.allDone',
                      { n: f.p.remaining },
                    )}
                  </p>
                ) : null}
                {f && f.p.blockers > 0 ? <p>{t('gap.blockers', { n: f.p.blockers })}</p> : null}
                {f && f.p.unknown > 0 ? <p>{t('gap.unknown', { n: f.p.unknown })}</p> : null}
                {next ? (
                  <p className="project-next">
                    <span className="prio">{next.priority}</span>
                    <span lang="zh-Hans">{next.title}</span>
                  </p>
                ) : null}
              </td>
              <td className="project-pending-cell">
                {f
                  ? t('more.pendingDetail', { decisions: f.p.decisions, acceptances: f.p.awaitingAcceptance })
                  : '—'}
              </td>
              <td>
                <ReportAge project={p} now={now} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ProjectList({ projects, now }: { projects: ProjectWithCurrent[]; now: Date }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const resting = (p: ProjectWithCurrent) => p.attention === 'paused' || p.attention === 'archived';
  const filtered = projects.filter((p) => {
    if (filter === 'resting') return resting(p);
    if (resting(p)) return false;
    if (filter === 'pending') {
      const f = p.current ? figureOf(p.current.snapshot, t) : null;
      return f && f.p.decisions + f.p.awaitingAcceptance > 0;
    }
    if (filter === 'stale')
      return (
        p.current &&
        freshness(p.current.utcMs, now, p.current.snapshot.stage, { staleAfterDays: p.freshnessDays }) ===
          'stale'
      );
    return true;
  });
  return (
    <>
      <fieldset className="list-filters">
        <legend className="sr-only">{t('list.filter')}</legend>
        {['all', 'pending', 'stale', 'resting'].map((value) => (
          <button
            key={value}
            type="button"
            className="btn"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`list.${value as 'all' | 'pending' | 'stale' | 'resting'}`)}
          </button>
        ))}
      </fieldset>
      {filtered.length ? (
        <ProjectTable projects={filtered} now={now} />
      ) : (
        <p className="page-lede">{t('list.noMatch')}</p>
      )}
      {filter === 'all' && projects.some(resting) ? (
        <details className="resting-projects">
          <summary>{t('list.restingCount', { n: projects.filter(resting).length })}</summary>
          <ProjectTable projects={projects.filter(resting)} now={now} />
        </details>
      ) : null}
    </>
  );
}
