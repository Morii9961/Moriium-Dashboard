import { useI18n } from '../i18n/i18n.tsx';
import { Link } from './router.tsx';
import { localizedName, type OverviewData } from './types.ts';
export function RecentDeliveries({ data }: { data: OverviewData }) {
  const { t, locale, snapshotTime } = useI18n();
  const entries = [
    ...data.recentWorks.map((w) => ({
      kind: 'work' as const,
      at: Date.parse(`${w.date}T00:00:00+08:00`),
      work: w,
    })),
    ...data.recentDelivery.map((r) => ({ kind: 'milestone' as const, at: Date.parse(r.at), record: r })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
  const projectName = (id: string) => {
    const p = data.projects.find((p) => p.id === id);
    return p ? localizedName(p, locale) : id;
  };
  return (
    <section className="overview-section">
      <div className="section-heading">
        <h2>{t('overview.delivery')}</h2>
        <Link to="/studio">{t('works.new')}</Link>
      </div>
      {entries.length ? (
        <ul className="delivery-list">
          {entries.map((entry) =>
            entry.kind === 'work' ? (
              <li key={`work-${entry.work.id}`}>
                {entry.work.hasCover ? (
                  <img
                    className="delivery-cover"
                    src={`/api/works/${entry.work.id}/cover?v=${entry.work.revision}`}
                    width={160}
                    height={120}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <Link to={`/studio#work-${entry.work.id}`} lang={entry.work.lang}>
                  {entry.work.title}
                </Link>
                <p>
                  {t(`works.kind.${entry.work.kind}`)} ·{' '}
                  <time dateTime={entry.work.date}>{entry.work.date}</time>
                </p>
                {entry.work.projectId ? <p>{projectName(entry.work.projectId)}</p> : null}
                <span>{t('works.recorded')}</span>
              </li>
            ) : (
              <li key={`${entry.record.projectId}:${entry.record.milestoneId}`}>
                <Link to={`/projects/${encodeURIComponent(entry.record.projectId)}`}>
                  {projectName(entry.record.projectId)}
                </Link>
                <p lang="zh-Hans">{entry.record.title}</p>
                <time dateTime={entry.record.at}>
                  {t('evidence.accepted', { date: snapshotTime(entry.at, 480) })}
                </time>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p>{t('overview.noDelivery')}</p>
      )}
    </section>
  );
}
