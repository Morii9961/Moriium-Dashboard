import { useI18n } from '../i18n/i18n.tsx';
import { useResource } from './data.tsx';
import { Link } from './router.tsx';
import { localizedName, type ProjectWithCurrent, type ReporterAgent, type SnapshotRecord } from './types.ts';
import { PageHeader } from './ui.tsx';

interface Report
  extends Pick<
    SnapshotRecord,
    'id' | 'projectId' | 'reporter' | 'snapshotAt' | 'utcMs' | 'offsetMinutes' | 'importedAt'
  > {
  previousId: number | null;
  changes: {
    stage: { from: SnapshotRecord['snapshot']['stage']; to: SnapshotRecord['snapshot']['stage'] } | null;
    completed: number;
    blockers: number;
    decisions: number;
  } | null;
}
interface AgentData {
  projects: ProjectWithCurrent[];
  reports: Report[];
  agents: {
    agent: ReporterAgent | null;
    latest: Report | null;
    count30: number;
    pending: number;
    evidence: {
      accepted: number;
      repository: number;
      existingTest: number;
      self: number;
      reported: number;
      unknown: number;
    };
    assignments: { projectId: string; scope: string }[];
  }[];
}
export function AgentsPage({ agent }: { agent?: string }) {
  const { t, locale, snapshotTime } = useI18n();
  const { data, error } = useResource<AgentData>('/api/agents');
  const name = (id: string) => {
    const p = data?.projects.find((p) => p.id === id);
    return p ? localizedName(p, locale) : id;
  };
  const label = (a: ReporterAgent | null) => t(a ? `agent.${a}` : 'agent.unknown');
  const cards = data?.agents.filter((a) => !agent || (a.agent ?? 'unknown') === agent) ?? [];
  return (
    <>
      <PageHeader title={t('nav.agents')} lede={t('agents.explanation')} />
      {agent ? <Link to="/agents">{t('overview.all')}</Link> : null}
      {!data ? (
        <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      ) : (
        <>
          <div className="agent-grid">
            {cards.map((a) => (
              <section className="agent-card" key={a.agent ?? 'unknown'}>
                <h2>
                  <Link to={`/agents/${a.agent ?? 'unknown'}`}>{label(a.agent)}</Link>
                </h2>
                <h3>{t('agents.lastReport')}</h3>
                {a.latest ? (
                  <>
                    <Link to={`/projects/${encodeURIComponent(a.latest.projectId)}`}>
                      {name(a.latest.projectId)}
                    </Link>
                    <p>
                      <time dateTime={a.latest.snapshotAt}>
                        {t('more.snapshot')} · {snapshotTime(a.latest.utcMs, a.latest.offsetMinutes)}
                      </time>
                    </p>
                    <p>
                      <time dateTime={a.latest.importedAt}>
                        {t('detail.imported')} · {snapshotTime(Date.parse(a.latest.importedAt), 480)}
                      </time>
                    </p>
                    <p>{t(`agents.source.${a.latest.reporter.source}`)}</p>
                    {a.latest.reporter.note ? <p lang="zh-Hans">{a.latest.reporter.note}</p> : null}
                  </>
                ) : (
                  <p>{t('agents.empty')}</p>
                )}
                <h3>{t('agents.assignments')}</h3>
                {a.assignments.length ? (
                  <ul>
                    {a.assignments.map((p) => (
                      <li key={`${p.projectId}:${p.scope}`}>
                        <Link to={`/projects/${encodeURIComponent(p.projectId)}`}>{name(p.projectId)}</Link>{' '}
                        <span lang="zh-Hans">{p.scope}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('agents.noAssignments')}</p>
                )}
                <p>{t('agents.count30', { n: a.count30 })}</p>
                <h3>{t('agents.composition')}</h3>
                <dl className="agent-evidence">
                  {(Object.keys(a.evidence) as (keyof typeof a.evidence)[]).map((k) => (
                    <div key={k}>
                      <dt>{t(`agents.evidence.${k}`)}</dt>
                      <dd>{a.evidence[k]}</dd>
                    </div>
                  ))}
                </dl>
                <p>{t('agents.pending', { n: a.pending })}</p>
              </section>
            ))}
          </div>
          <section className="overview-section">
            <h2>{t('agents.recent')}</h2>
            <p className="source-note">{t('agents.changesNote')}</p>
            <ol className="agent-reports">
              {data.reports
                .filter((r) => !agent || (r.reporter.agent ?? 'unknown') === agent)
                .map((r) => (
                  <li key={r.id}>
                    <Link to={`/projects/${encodeURIComponent(r.projectId)}`}>{name(r.projectId)}</Link> ·{' '}
                    {label(r.reporter.agent)}
                    <p>
                      <time dateTime={r.snapshotAt}>
                        {t('more.snapshot')} · {snapshotTime(r.utcMs, r.offsetMinutes)}
                      </time>{' '}
                      · {t(`agents.source.${r.reporter.source}`)}
                    </p>
                    <p>
                      <time dateTime={r.importedAt}>
                        {t('detail.imported')} · {snapshotTime(Date.parse(r.importedAt), 480)}
                      </time>
                    </p>
                    {r.changes ? (
                      <>
                        {r.changes.stage ? (
                          <p>
                            {t(`stage.${r.changes.stage.from}`)} → {t(`stage.${r.changes.stage.to}`)}
                          </p>
                        ) : null}
                        <p>
                          {t('agents.changes', {
                            completed: r.changes.completed,
                            blockers: r.changes.blockers,
                            decisions: r.changes.decisions,
                          })}
                        </p>
                        <Link to={`/projects/${encodeURIComponent(r.projectId)}`}>{t('agents.compare')}</Link>
                      </>
                    ) : (
                      <p>{t('agents.first')}</p>
                    )}
                  </li>
                ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
