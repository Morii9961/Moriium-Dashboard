import { useI18n } from '../i18n/i18n.tsx';
import { useResource } from './data.tsx';
import { Link } from './router.tsx';
import { localizedName, type ProjectWithCurrent, type ReporterAgent, type SnapshotRecord } from './types.ts';
import { PageHeader } from './ui.tsx';
import { BandHead } from './ZoneSections.tsx';

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
type AgentCard = AgentData['agents'][number];

/** 把「未注明」并进 Codex：计数、证据相加，负责范围合并，最近报告取更新的一份；去掉「其他 Agent」。 */
function mergeUnstated(agents: AgentCard[]): AgentCard[] {
  const unstated = agents.find((a) => a.agent === null);
  const rest = agents.filter((a) => a.agent !== null && a.agent !== 'other');
  if (!unstated) return rest;
  const codex = rest.find((a) => a.agent === 'codex');
  if (!codex) return [{ ...unstated, agent: 'codex' }, ...rest];
  const newer = (x: Report | null, y: Report | null) => (!x ? y : !y ? x : y.utcMs > x.utcMs ? y : x);
  const evidence = { ...codex.evidence };
  for (const k of Object.keys(evidence) as (keyof typeof evidence)[]) evidence[k] += unstated.evidence[k];
  const merged: AgentCard = {
    agent: 'codex',
    latest: newer(codex.latest, unstated.latest),
    count30: codex.count30 + unstated.count30,
    pending: codex.pending + unstated.pending,
    evidence,
    assignments: [...codex.assignments, ...unstated.assignments].filter(
      (p, i, all) => all.findIndex((q) => q.projectId === p.projectId && q.scope === p.scope) === i,
    ),
  };
  return rest.map((a) => (a === codex ? merged : a));
}

export function AgentsPage({ agent }: { agent?: string }) {
  const { t, locale, snapshotTime } = useI18n();
  const { data, error } = useResource<AgentData>('/api/agents');
  const name = (id: string) => {
    const p = data?.projects.find((p) => p.id === id);
    return p ? localizedName(p, locale) : id;
  };
  const label = (a: ReporterAgent | null) => t(a ? `agent.${a}` : 'agent.unknown');
  // 没写 Agent 的报告都是 Codex 的，并进 Codex；「其他 Agent」不单列（Morii，2026-10-25）。
  const focus = agent === 'unknown' ? 'codex' : agent;
  const cards = mergeUnstated(data?.agents ?? []).filter((a) => !focus || a.agent === focus);
  const reports =
    data?.reports.filter(
      (r) => r.reporter.agent !== 'other' && (!focus || (r.reporter.agent ?? 'codex') === focus),
    ) ?? [];
  if (!data)
    return (
      <>
        <PageHeader title={t('nav.agents')} />
        <p className="loading-line">{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      </>
    );
  return (
    <div className="page">
      <section className="block" aria-labelledby="h-agents">
        <BandHead
          title={agent ? label(agent === 'unknown' ? null : (agent as ReporterAgent)) : t('nav.agents')}
          level={1}
          id="h-agents"
          numbers={[
            [t('zone.reports'), reports.length],
            [t('more.pending'), cards.reduce((n, a) => n + a.pending, 0)],
          ]}
        >
          <p className="head-note">{t('agents.explanation')}</p>
          {agent ? (
            <p className="head-actions go">
              <Link to="/agents">{t('overview.all')}</Link>
            </p>
          ) : null}
        </BandHead>
        {cards.map((a) => (
          <section
            className="g band agent-band"
            key={a.agent ?? 'unknown'}
            aria-labelledby={`ag-${a.agent ?? 'unknown'}`}
          >
            <div className="idx">
              <div className="stick">
                <span className="bign">{a.count30}</span>
              </div>
            </div>
            <div className="main">
              <h2 className="bname" id={`ag-${a.agent ?? 'unknown'}`}>
                <Link to={`/agents/${a.agent ?? 'unknown'}`}>{label(a.agent)}</Link>
              </h2>
              <p className="kicker">
                <span>{t('agents.count30', { n: a.count30 })}</span>
              </p>
              <h3 className="tier">{t('agents.lastReport')}</h3>
              {a.latest ? (
                <div className="agent-latest">
                  <p className="it">
                    <Link to={`/projects/${encodeURIComponent(a.latest.projectId)}`}>
                      {name(a.latest.projectId)}
                    </Link>
                  </p>
                  <p className="ix">
                    <time dateTime={a.latest.snapshotAt}>
                      {t('more.snapshot')} {snapshotTime(a.latest.utcMs, a.latest.offsetMinutes)}
                    </time>{' '}
                    ·{' '}
                    <time dateTime={a.latest.importedAt} title={t('detail.notOnline')}>
                      {t('detail.imported')} {snapshotTime(Date.parse(a.latest.importedAt), 480)}
                    </time>{' '}
                    · {t(`agents.source.${a.latest.reporter.source}`)}
                  </p>
                  {a.latest.reporter.note ? (
                    <p className="ix" lang="zh-Hans">
                      {a.latest.reporter.note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="ix">{t('agents.empty')}</p>
              )}
              <h3 className="tier">{t('agents.assignments')}</h3>
              {a.assignments.length ? (
                <ul className="agent-assign">
                  {a.assignments.map((p) => (
                    <li key={`${p.projectId}:${p.scope}`}>
                      <Link to={`/projects/${encodeURIComponent(p.projectId)}`}>{name(p.projectId)}</Link>{' '}
                      <span lang="zh-Hans">{p.scope}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ix">{t('agents.noAssignments')}</p>
              )}
            </div>
            <dl className="rail agent-evidence">
              <div className="agent-ev-head">
                <dt>{t('agents.composition')}</dt>
              </div>
              {(Object.keys(a.evidence) as (keyof typeof a.evidence)[]).map((k) => (
                <div key={k} className={a.evidence[k] ? undefined : 'nil'}>
                  <dt>{t(`agents.evidence.${k}`)}</dt>
                  <dd>{a.evidence[k]}</dd>
                </div>
              ))}
              <div>
                <dt>{t('more.pending')}</dt>
                <dd>{a.pending}</dd>
              </div>
            </dl>
          </section>
        ))}
      </section>

      <section className="block" aria-labelledby="h-reports">
        <BandHead
          title={t('agents.recent')}
          level={2}
          id="h-reports"
          numbers={[[t('zone.reports'), reports.length]]}
        >
          <p className="head-note">{t('agents.changesNote')}</p>
        </BandHead>
        <ol className="report-log">
          {reports.map((r) => (
            <li key={r.id} className="g">
              <div className="idx">
                <span className="no">{label(r.reporter.agent)}</span>
              </div>
              <div className="main">
                <p className="it">
                  <Link to={`/projects/${encodeURIComponent(r.projectId)}`}>{name(r.projectId)}</Link>
                  {r.changes?.stage ? (
                    <span className="stage-change">
                      {t(`stage.${r.changes.stage.from}`)} → {t(`stage.${r.changes.stage.to}`)}
                    </span>
                  ) : null}
                </p>
                <p className="ix">
                  {r.changes
                    ? t('agents.changes', {
                        completed: r.changes.completed,
                        blockers: r.changes.blockers,
                        decisions: r.changes.decisions,
                      })
                    : t('agents.first')}
                </p>
              </div>
              <p className="rail ix">
                <time dateTime={r.snapshotAt}>
                  {t('more.snapshot')} {snapshotTime(r.utcMs, r.offsetMinutes)}
                </time>
                <br />
                <time dateTime={r.importedAt} title={t('detail.notOnline')}>
                  {t('detail.imported')} {snapshotTime(Date.parse(r.importedAt), 480)}
                </time>
                <br />
                {t(`agents.source.${r.reporter.source}`)}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
