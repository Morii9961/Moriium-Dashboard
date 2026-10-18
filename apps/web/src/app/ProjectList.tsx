import { useState } from 'react';
import { figureOf } from '../components/ProjectStrip.tsx';
import { StaleIcon } from '../components/parts.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { freshness } from '../progress.ts';
import { Link } from './router.tsx';
import { CATEGORIES, localizedName, type ProjectWithCurrent } from './types.ts';
import { ProjectRow } from './ZoneSections.tsx';

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

function ProjectRowsList({ projects, now }: { projects: ProjectWithCurrent[]; now: Date }) {
  const { t } = useI18n();
  return (
    <div className="prows">
      {projects.map((p) => {
        const f = p.current
          ? figureOf(
              p.current.snapshot,
              t,
              p.acceptances,
              p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
            )
          : null;
        return (
          <ProjectRow
            key={p.id}
            project={p}
            now={now}
            detailed
            pending={f ? f.p.decisions + f.p.awaitingAcceptance : 0}
          />
        );
      })}
    </div>
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
      <div className="g list-tools">
        <div className="main">
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
        </div>
      </div>
      {filtered.length ? (
        CATEGORIES.filter((c) => filtered.some((p) => p.category === c)).map((c) => (
          <section className="project-category" key={c} aria-labelledby={`cat-${c}`}>
            <div className="g">
              <h2 className="main cat-title" id={`cat-${c}`}>
                {t(`category.${c}`)}
              </h2>
            </div>
            <ProjectRowsList projects={filtered.filter((p) => p.category === c)} now={now} />
          </section>
        ))
      ) : (
        <div className="g">
          <p className="main empty-line">{t('list.noMatch')}</p>
        </div>
      )}
      {filter === 'all' && pool.some(resting) ? (
        <details className="resting-list">
          <summary>{t('list.restingCount', { n: pool.filter(resting).length })}</summary>
          <ProjectRowsList projects={pool.filter(resting)} now={now} />
        </details>
      ) : null}
    </>
  );
}
