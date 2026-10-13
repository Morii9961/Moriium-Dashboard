import { useState } from 'react';
import { figureOf } from '../components/ProjectStrip.tsx';
import { LineMap, MilestoneGrid, StaleIcon } from '../components/parts.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { freshness, headlineNextAction, visibleMilestones } from '../progress.ts';
import { ManualSummary } from './ManualProject.tsx';
import { Link } from './router.tsx';
import { CATEGORIES, localizedName, type ProjectWithCurrent } from './types.ts';

export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export function ReportAge({ project, now }: { project: ProjectWithCurrent; now: Date }) {
  const { t, relative } = useI18n();
  const c = project.current;
  if (project.tracking === 'manual') return <span>{t('manual.recorded')}</span>;
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
  const { t, locale } = useI18n();
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
          const f = s
            ? figureOf(
                s,
                t,
                p.acceptances,
                p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
              )
            : null;
          const selected = s ? visibleMilestones(s.milestones, p.coreMilestones) : [];
          const next = s ? headlineNextAction(s) : null;
          return (
            <tr key={p.id}>
              <th scope="row">
                <Link to={projectPath(p.id)} className="project-title">
                  {localizedName(p, locale)}
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
                ) : p.tracking === 'manual' ? (
                  <ManualSummary project={p} />
                ) : (
                  <span>{t('map.noSnapshot')}</span>
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
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('priority');
  const pool = projects.filter((p) => category === 'all' || p.category === category);
  const resting = (p: ProjectWithCurrent) => p.attention === 'paused' || p.attention === 'archived';
  const filtered = pool
    .filter((p) => {
      if (filter === 'resting') return resting(p);
      if (resting(p)) return false;
      if (filter === 'pending') {
        const f = p.current
          ? figureOf(
              p.current.snapshot,
              t,
              p.acceptances,
              p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
            )
          : null;
        return f && f.p.decisions + f.p.awaitingAcceptance > 0;
      }
      if (filter === 'stale')
        return (
          p.current &&
          freshness(p.current.utcMs, now, p.current.snapshot.stage, { staleAfterDays: p.freshnessDays }) ===
            'stale'
        );
      return true;
    })
    .sort((a, b) =>
      sort === 'name'
        ? localizedName(a, locale).localeCompare(localizedName(b, locale), locale)
        : sort === 'freshness'
          ? (a.current?.utcMs ?? 0) - (b.current?.utcMs ?? 0)
          : ['focus', 'normal', 'later'].indexOf(a.priority) -
              ['focus', 'normal', 'later'].indexOf(b.priority) ||
            Number(a.attention === 'waiting') - Number(b.attention === 'waiting') ||
            a.sortOrder - b.sortOrder,
    );
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
      <div className="list-controls">
        <label className="field">
          <span>{t('settings.category')}</span>
          <select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
            <option value="all">{t('list.all')}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('list.sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.currentTarget.value)}>
            {(['priority', 'name', 'freshness'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`sort.${v}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length ? (
        CATEGORIES.filter((c) => filtered.some((p) => p.category === c)).map((c) => (
          <section className="project-category" key={c}>
            <h2>{t(`category.${c}`)}</h2>
            <ProjectTable projects={filtered.filter((p) => p.category === c)} now={now} />
          </section>
        ))
      ) : (
        <p className="page-lede">{t('list.noMatch')}</p>
      )}
      {filter === 'all' && pool.some(resting) ? (
        <details className="resting-projects">
          <summary>{t('list.restingCount', { n: pool.filter(resting).length })}</summary>
          <ProjectTable projects={pool.filter(resting)} now={now} />
        </details>
      ) : null}
    </>
  );
}
