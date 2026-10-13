import { useMemo } from 'react';
import { figureOf, ProjectStrip, type StripItem } from '../components/ProjectStrip.tsx';
import { type MapLine, TransitMap } from '../components/TransitMap.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { freshness } from '../progress.ts';
import { useResource } from './data.tsx';
import { useImport } from './ImportDialog.tsx';
import { ItemReview } from './ItemReview.tsx';
import { ManualSummary } from './ManualProject.tsx';
import { projectPath, ReportAge } from './ProjectList.tsx';
import { Link } from './router.tsx';
import type { OverviewData, ProjectWithCurrent } from './types.ts';
import { localizedName } from './types.ts';
import { PageHeader, SnapshotSteps } from './ui.tsx';

function projectLabel(data: OverviewData, id: string, locale: string, fallback: string) {
  const p = data.projects.find((p) => p.id === id);
  return p ? localizedName(p, locale) : fallback;
}

function itemOf(p: ProjectWithCurrent, locale: string): StripItem | null {
  const c = p.current;
  if (!c) return null;
  return {
    anchor: `p-${p.id.replace(/[^a-z0-9]+/g, '-')}`,
    name: localizedName(p, locale),
    snapshot: c.snapshot,
    utcMs: c.utcMs,
    offsetMinutes: c.offsetMinutes,
    agent: c.reporter.agent,
    agentInferred: c.reporter.source === 'branch',
    staleAfterDays: p.freshnessDays,
    projectPaused: p.attention === 'paused',
    acceptances: p.acceptances,
    coreMilestones: p.coreMilestones,
    href: projectPath(p.id),
    pendingDecisions: p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
  };
}

export function PendingList({ data, limit }: { data: OverviewData; limit?: number }) {
  const { t, locale } = useI18n();
  const entries = limit ? data.pending.slice(0, limit) : data.pending;
  if (!entries.length) return <p>{t('inbox.empty')}</p>;
  return (
    <ol className="overview-pending">
      {entries.map((i) => (
        <li key={`${i.projectId}:${i.kind}:${i.key}`}>
          <Link to={projectPath(i.projectId)} className="pending-project">
            {projectLabel(data, i.projectId, locale, i.projectName)}
          </Link>
          {i.kind === 'acceptance' ? (
            <Link to={`${projectPath(i.projectId)}#milestone-${encodeURIComponent(i.milestoneId ?? '')}`}>
              {t('detail.acceptMilestone', { title: i.title })}
            </Link>
          ) : i.item ? (
            <ul className="pending-decision">
              <ItemReview item={i.item} projectId={i.projectId} snapshotId={i.snapshotId} />
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  const { data, error } = useResource<OverviewData>('/api/overview');
  return (
    <>
      <PageHeader title={t('nav.inbox')} />
      {data ? <PendingList data={data} /> : <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>}
    </>
  );
}

export function OverviewPage() {
  const { open } = useImport();
  const { t, locale, fullDate, relative, snapshotTime } = useI18n();
  const now = useMemo(() => new Date(), []);
  const { data, error } = useResource<OverviewData>('/api/overview');
  const projects = [
    ...(data?.projects.filter((p) => p.attention === 'active' || p.attention === 'waiting') ?? []),
  ].sort(
    (a, b) =>
      ['focus', 'normal', 'later'].indexOf(a.priority) - ['focus', 'normal', 'later'].indexOf(b.priority) ||
      Number(a.attention === 'waiting') - Number(b.attention === 'waiting') ||
      a.sortOrder - b.sortOrder,
  );
  const items = projects.map((p) => itemOf(p, locale)).filter((i): i is StripItem => !!i);
  const lines: MapLine[] = projects
    .filter((p) => p.tracking === 'protocol')
    .map((p) => {
      const item = itemOf(p, locale);
      if (!item)
        return {
          href: projectPath(p.id),
          name: localizedName(p, locale),
          stage: null,
          progress: '',
          progressLabel: '',
          pending: 0,
        };
      const f = figureOf(item.snapshot, t, item.acceptances, item.pendingDecisions);
      return {
        href: `#${item.anchor}`,
        name: localizedName(p, locale),
        stage: item.snapshot.stage,
        progress: f.text,
        progressLabel: f.label,
        pending: f.p.decisions + f.p.awaitingAcceptance,
      };
    });
  const ageRank = (p: ProjectWithCurrent) =>
    !p.current
      ? 3
      : { stale: 3, aging: 2, fresh: 1, not_counted: 0 }[
          freshness(p.current.utcMs, now, p.current.snapshot.stage, {
            staleAfterDays: p.freshnessDays,
            projectPaused: p.attention === 'paused',
          })
        ];
  return (
    <>
      <PageHeader
        meta={<time dateTime={now.toISOString()}>{fullDate(now)}</time>}
        title={
          data ? (
            items.length || projects.some((p) => p.tracking === 'manual') ? (
              <>
                <span>{t('hero.projects', { projects: projects.length })}</span>
                <span className="title-second">{t('hero.pending', { pending: data.pending.length })}</span>
              </>
            ) : (
              t('overview.emptyTitle', { count: projects.length })
            )
          ) : (
            t('nav.overview')
          )
        }
      />
      {!data ? (
        <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      ) : (
        <>
          <TransitMap lines={lines} />
          {items.length === 0 && !projects.some((p) => p.tracking === 'manual') ? <SnapshotSteps /> : null}
          <div className="overview-layout">
            <div>
              <section className="overview-section">
                <div className="section-heading">
                  <h2>
                    {t('nav.inbox')} · {data.pending.length}
                  </h2>
                  <Link to="/inbox">{t('overview.all')}</Link>
                </div>
                <PendingList data={data} limit={5} />
              </section>
              <section className="overview-section">
                <div className="section-heading">
                  <h2>{t('nav.projects')}</h2>
                  <Link to="/projects">{t('overview.all')}</Link>
                </div>
                <div className="strips">
                  {items.map((item) => (
                    <ProjectStrip key={item.anchor} item={item} now={now} />
                  ))}
                </div>
                {projects
                  .filter((p) => p.tracking === 'manual')
                  .map((p) => (
                    <article className="manual-overview" key={p.id}>
                      <h3>
                        <Link to={projectPath(p.id)}>{localizedName(p, locale)}</Link>
                      </h3>
                      <ManualSummary project={p} />
                    </article>
                  ))}
                {projects
                  .filter((p) => !p.current && p.tracking === 'protocol')
                  .map((p) => (
                    <p key={p.id}>
                      <Link to={projectPath(p.id)}>{localizedName(p, locale)}</Link> · {t('map.noSnapshot')}
                    </p>
                  ))}
                {data.projects.some((p) => p.attention === 'paused') ? (
                  <details className="resting-projects">
                    <summary>
                      {t('overview.paused', {
                        n: data.projects.filter((p) => p.attention === 'paused').length,
                      })}
                    </summary>
                    {data.projects
                      .filter((p) => p.attention === 'paused')
                      .map((p) => (
                        <p key={p.id}>
                          <Link to={projectPath(p.id)}>{localizedName(p, locale)}</Link>
                        </p>
                      ))}
                  </details>
                ) : null}
              </section>
              <section className="overview-section">
                <h2>{t('overview.delivery')}</h2>
                {data.recentDelivery.length ? (
                  <ul className="delivery-list">
                    {data.recentDelivery.map((r) => (
                      <li key={`${r.projectId}:${r.milestoneId}`}>
                        <Link to={projectPath(r.projectId)}>
                          {projectLabel(data, r.projectId, locale, r.projectName)}
                        </Link>
                        <p lang="zh-Hans">{r.title}</p>
                        <time dateTime={r.at}>
                          {t('evidence.accepted', { date: snapshotTime(Date.parse(r.at), 480) })}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('overview.noDelivery')}</p>
                )}
              </section>
            </div>
            <aside className="overview-side">
              <section className="overview-section">
                <h2>{t('overview.freshness')}</h2>
                <ul className="age-list">
                  {[...projects]
                    .filter((p) => p.tracking === 'protocol')
                    .sort((a, b) => ageRank(b) - ageRank(a))
                    .map((p) => (
                      <li key={p.id}>
                        <Link to={projectPath(p.id)}>{localizedName(p, locale)}</Link>
                        <ReportAge project={p} now={now} />
                        <button type="button" className="btn" onClick={() => open(p.id)}>
                          {t('overview.update')}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
              <section className="overview-section">
                <h2>{t('overview.reports')}</h2>
                <ul className="age-list">
                  {data.latestReports.map((r) => (
                    <li key={r.agent ?? 'unknown'}>
                      <strong>{t(r.agent ? `agent.${r.agent}` : 'agent.unknown')}</strong>
                      <Link to={projectPath(r.projectId)}>
                        {projectLabel(data, r.projectId, locale, r.projectName)}
                      </Link>
                      <span>
                        {t('more.snapshot')} · {relative(r.utcMs, now)}
                      </span>
                      <time dateTime={r.importedAt}>
                        {t('detail.imported')} · {relative(Date.parse(r.importedAt), now)}
                      </time>
                    </li>
                  ))}
                </ul>
                <p className="source-note">{t('detail.notOnline')}</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
