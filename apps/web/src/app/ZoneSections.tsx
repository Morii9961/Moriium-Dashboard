/**
 * 概览与「需要你决定」「项目」共用的区块，按灰阶尺的三条竖带排（DESIGN.md 第 5 节）：
 * 灰阶栏 idx（灰块、灰条、大数字）/ 正文 main / 信息栏 rail。
 */
import type { CSSProperties, ReactNode } from 'react';
import { figureOf } from '../components/ProjectStrip.tsx';
import {
  inkStyle,
  MilestoneDots,
  ROMAN,
  ZoneBar,
  ZoneBlock,
  zoneOf,
  zoneStyle,
} from '../components/Zone.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { headlineNextAction } from '../progress.ts';
import { useImport } from './ImportDialog.tsx';
import { ItemReview } from './ItemReview.tsx';
import { ManualSummary } from './ManualProject.tsx';
import { projectPath } from './ProjectList.tsx';
import { Link } from './router.tsx';
import type { OverviewData, ProjectWithCurrent } from './types.ts';
import { localizedName } from './types.ts';

type Pending = OverviewData['pending'][number];

/** 尺上从左到右（Zone X → 0）的顺序；不在尺上的排最后。 */
export function byRuler(projects: ProjectWithCurrent[]): ProjectWithCurrent[] {
  return projects
    .map((p, i) => ({ p, i, z: zoneOf(p.current?.snapshot.stage) ?? -1 }))
    .sort((a, b) => b.z - a.z || a.i - b.i)
    .map((x) => x.p);
}

export function pendingByProject(data: OverviewData): Map<string, Pending[]> {
  const m = new Map<string, Pending[]>();
  for (const x of data.pending) m.set(x.projectId, [...(m.get(x.projectId) ?? []), x]);
  return m;
}

function RailRow({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** 页头：64px 细宽标题 + 信息栏两个大数字。title 是 h1（独立页面）或 h2（概览里的一段）。 */
export function BandHead({
  title,
  level,
  id,
  numbers,
  children,
}: {
  title: ReactNode;
  level: 1 | 2;
  id: string;
  numbers: [ReactNode, ReactNode][];
  children?: ReactNode;
}) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <header className="g phead">
      <div className="main">
        <H
          className={level === 1 ? 'ptitle page-title' : 'ptitle'}
          id={id}
          tabIndex={level === 1 ? -1 : undefined}
        >
          {title}
        </H>
      </div>
      <dl className="rail rail-big">
        {numbers.map(([k, v], i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定的两三个数字。
          <RailRow key={i} k={k}>
            {v}
          </RailRow>
        ))}
      </dl>
      {children ? <div className="span">{children}</div> : null}
    </header>
  );
}

/** 分布条：按数量分段，每段是那个项目在尺上的灰；点击跳到该项目的那一条带。 */
function Spread({
  data,
  ordered,
  by,
  href,
}: {
  data: OverviewData;
  ordered: ProjectWithCurrent[];
  by: Map<string, Pending[]>;
  href: (id: string) => string;
}) {
  const { t, locale } = useI18n();
  const parts = ordered.filter((p) => by.get(p.id)?.length);
  return (
    <ul className="spread" aria-label={t('zone.spread', { n: data.pending.length })}>
      {parts.map((p) => {
        const n = by.get(p.id)?.length ?? 0;
        const z = zoneOf(p.current?.snapshot.stage);
        const name = localizedName(p, locale);
        return (
          <li key={p.id} style={{ flex: `${n} 1 0` }}>
            <Link
              to={href(p.id)}
              className={`spread-seg${z == null || z === 10 ? ' blank' : ''}`}
              style={z != null ? zoneStyle(z) : undefined}
              aria-label={t('zone.segment', { name, n })}
            >
              <span className="segn">{n}</span>
              <span className="segl">{name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 「需要你决定」：一个项目一条带。灰阶栏是灰块 + 件数（滚动时粘住）；
 * 正文先「决定」（可处理、可加入今日焦点），后「验收」；信息栏是阶段、报告、阻塞。
 */
export function DecisionBands({
  data,
  now,
  level,
  limit,
}: {
  data: OverviewData;
  now: Date;
  level: 1 | 2;
  /** 概览里只展开前几件，其余留给「需要你决定」页。 */
  limit?: number;
}) {
  const { t, locale, relative } = useI18n();
  const by = pendingByProject(data);
  const ordered = byRuler(data.projects);
  const decisions = data.pending.filter((x) => x.kind === 'decision').length;
  const acceptances = data.pending.length - decisions;
  let budget = limit ?? Number.POSITIVE_INFINITY;
  const bands = ordered
    .filter((p) => by.get(p.id)?.length)
    .map((p) => {
      const all = by.get(p.id) ?? [];
      const shown = all.slice(0, Math.max(0, budget));
      budget -= shown.length;
      return { p, all, shown };
    })
    .filter((b) => b.shown.length);
  return (
    <section className="block" id="decisions" aria-labelledby="h-dec">
      <BandHead
        title={t('nav.inbox')}
        level={level}
        id="h-dec"
        numbers={[
          [t('zone.kind.decision'), decisions],
          [t('zone.kind.acceptance'), acceptances],
        ]}
      >
        {data.pending.length ? (
          <Spread
            data={data}
            ordered={ordered}
            by={by}
            href={(id) => `/inbox#dg-${encodeURIComponent(id)}`}
          />
        ) : null}
      </BandHead>
      {!data.pending.length ? (
        <div className="g">
          <p className="main empty-line">{t('inbox.empty')}</p>
        </div>
      ) : null}
      {bands.map(({ p, all, shown }) => {
        const c = p.current;
        const z = zoneOf(c?.snapshot.stage);
        const ds = shown.filter((x) => x.kind === 'decision');
        const as = shown.filter((x) => x.kind === 'acceptance');
        return (
          <section
            key={p.id}
            className="g band"
            id={`dg-${encodeURIComponent(p.id)}`}
            aria-labelledby={`dgh-${p.id}`}
          >
            <div className="idx">
              <div className="stick">
                {z != null ? <ZoneBlock zone={z} className="zb-lg" /> : null}
                <span className="bign">{all.length}</span>
              </div>
            </div>
            <div className="main">
              <h3 className="bname" id={`dgh-${p.id}`}>
                <Link to={projectPath(p.id)} style={c ? inkStyle(c.utcMs, now) : undefined}>
                  {localizedName(p, locale)}
                </Link>
              </h3>
              {ds.length ? (
                <>
                  <h4 className="tier">
                    {t('zone.kind.decision')}
                    <span>{ds.length}</span>
                  </h4>
                  <ol className="dec">
                    {ds.map((x) =>
                      x.item ? (
                        <ItemReview
                          key={x.key}
                          item={x.item}
                          projectId={x.projectId}
                          snapshotId={x.snapshotId}
                        />
                      ) : (
                        <li key={x.key} lang="zh-Hans">
                          {x.title}
                        </li>
                      ),
                    )}
                  </ol>
                </>
              ) : null}
              {as.length ? (
                <>
                  <h4 className="tier">
                    {t('zone.kind.acceptance')}
                    <span>{as.length}</span>
                  </h4>
                  <ol className="acc">
                    {as.map((x) => (
                      <li key={x.key}>
                        <span className="no">{x.milestoneId}</span>
                        <Link
                          to={`${projectPath(x.projectId)}#milestone-${encodeURIComponent(x.milestoneId ?? '')}`}
                          lang="zh-Hans"
                        >
                          {x.title}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {shown.length < all.length ? (
                <p className="go">
                  <Link to={`/inbox#dg-${encodeURIComponent(p.id)}`}>
                    {t('zone.more', { n: all.length - shown.length })}
                  </Link>
                </p>
              ) : null}
            </div>
            <dl className="rail">
              {c ? (
                <>
                  <RailRow k={t('zone.stage')}>
                    {t(`stage.${c.snapshot.stage}`)}
                    {z != null ? <small>Zone {ROMAN[z]}</small> : null}
                  </RailRow>
                  <RailRow k={t('more.reporter')}>
                    {t(c.reporter.agent ? `agent.${c.reporter.agent}` : 'agent.unknown')}
                    <small>{relative(c.utcMs, now)}</small>
                  </RailRow>
                  <RailRow k={t('more.blockers')}>{c.snapshot.blockers.length}</RailRow>
                </>
              ) : null}
              <div className="go">
                <Link to={projectPath(p.id)}>{t('zone.open')}</Link>
              </div>
            </dl>
          </section>
        );
      })}
      {limit !== undefined && data.pending.length > limit ? (
        <div className="g">
          <p className="main go">
            <Link to="/inbox">{t('zone.all', { n: data.pending.length })}</Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** 项目一行：灰阶栏是整行高的灰条，按尺上顺序排，连起来是一条测试条。 */
export function ProjectRow({
  project: p,
  pending,
  now,
  detailed = false,
}: {
  project: ProjectWithCurrent;
  pending: number;
  now: Date;
  /** 项目列表：用「还差什么 · 下一步」代替摘要，并显示关注状态。 */
  detailed?: boolean;
}) {
  const { t, locale, relative } = useI18n();
  const { open } = useImport();
  const c = p.current;
  const name = localizedName(p, locale);
  if (p.tracking === 'manual') {
    return (
      <article className="g prow" aria-labelledby={`pj-${p.id}`}>
        <div className="idx">
          <ZoneBar zone={null} />
        </div>
        <div className="main">
          <p className="kicker">{t('manual.recorded')}</p>
          <h3 className="pname2">
            <Link id={`pj-${p.id}`} to={projectPath(p.id)}>
              {name}
            </Link>
          </h3>
          <ManualSummary project={p} />
        </div>
      </article>
    );
  }
  if (!c) {
    return (
      <article className="g prow" aria-labelledby={`pj-${p.id}`}>
        <div className="idx">
          <ZoneBar zone={null} />
        </div>
        <div className="main">
          <p className="kicker">{t('map.noSnapshot')}</p>
          <h3 className="pname2">
            <Link id={`pj-${p.id}`} to={projectPath(p.id)}>
              {name}
            </Link>
          </h3>
        </div>
        <div className="rail">
          <button type="button" className="btn btn-quiet" onClick={() => open(p.id)}>
            {t('action.import')}
          </button>
        </div>
      </article>
    );
  }
  const s = c.snapshot;
  const z = zoneOf(s.stage);
  const done = s.milestones.filter((m) => m.status === 'done').length;
  const f = figureOf(
    s,
    t,
    p.acceptances,
    p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
  );
  const next = detailed ? headlineNextAction(s) : null;
  const gap = t(
    f.p.mature && ['launch_preparation', 'live', 'maintenance'].includes(s.stage)
      ? `mature.${s.stage as 'live' | 'maintenance' | 'launch_preparation'}`
      : f.p.remaining > 0
        ? 'gap.remaining'
        : f.p.total === 0
          ? 'gap.noMilestones'
          : f.p.unknown > 0
            ? 'gap.allKnownDone'
            : 'gap.allDone',
    { n: f.p.remaining },
  );
  const firstSentence = (() => {
    const i = s.summary.indexOf('。');
    return i < 0 ? s.summary : s.summary.slice(0, i + 1);
  })();
  return (
    <article className="g prow" aria-labelledby={`pj-${p.id}`}>
      <div className="idx">
        <ZoneBar zone={z} />
      </div>
      <div className="main">
        <p className="kicker">
          {t(`stage.${s.stage}`)}
          {detailed && p.attention !== 'active' ? <span>{t(`attention.${p.attention}`)}</span> : null}
          <span>
            {t(c.reporter.agent ? `agent.${c.reporter.agent}` : 'agent.unknown')} ·{' '}
            <time dateTime={c.snapshotAt}>{relative(c.utcMs, now)}</time>
          </span>
        </p>
        <h3 className="pname2">
          <Link id={`pj-${p.id}`} to={projectPath(p.id)} style={inkStyle(c.utcMs, now)}>
            {name}
          </Link>
        </h3>
        {detailed ? (
          <>
            <p className="gapline">
              {gap}
              {f.p.blockers > 0 ? <span>{t('gap.blockers', { n: f.p.blockers })}</span> : null}
              {f.p.unknown > 0 ? <span>{t('gap.unknown', { n: f.p.unknown })}</span> : null}
            </p>
            {next ? (
              <p className="nextline">
                <span className="prio">{next.priority}</span>
                <span lang="zh-Hans">{next.title}</span>
              </p>
            ) : null}
            {p.attention === 'paused' && p.attentionNote ? (
              <p className="sum" lang="zh-Hans">
                {p.attentionNote}
              </p>
            ) : null}
          </>
        ) : (
          <p className="sum" lang="zh-Hans">
            {firstSentence}
          </p>
        )}
      </div>
      <div className="rail">
        <dl className="quad">
          <RailRow k={t('more.milestones')}>
            {done}
            <i>/</i>
            {s.milestones.length}
          </RailRow>
          <RailRow k={t('more.pending')}>
            <span
              title={t('more.pendingDetail', {
                decisions: f.p.decisions,
                acceptances: f.p.awaitingAcceptance,
              })}
            >
              {pending}
            </span>
          </RailRow>
          <RailRow k={t('more.blockers')}>{s.blockers.length}</RailRow>
          <RailRow k={t('zone.progress')}>
            <span title={f.label}>{f.text}</span>
          </RailRow>
        </dl>
        <div className="qfoot">
          <MilestoneDots done={s.milestones.map((m) => m.status === 'done')} />
          <button type="button" className="text-btn" onClick={() => open(p.id)}>
            {t('zone.update')}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProjectRows({
  data,
  now,
  level,
  projects,
}: {
  data: OverviewData;
  now: Date;
  level: 1 | 2;
  projects: ProjectWithCurrent[];
}) {
  const { t } = useI18n();
  const by = pendingByProject(data);
  const ordered = byRuler(projects);
  const blockers = ordered.reduce((a, p) => a + (p.current?.snapshot.blockers.length ?? 0), 0);
  return (
    <section className="block" id="projects" aria-labelledby="h-proj">
      <BandHead
        title={t('nav.projects')}
        level={level}
        id="h-proj"
        numbers={[
          [t('zone.inProgress'), ordered.length],
          [t('more.blockers'), blockers],
        ]}
      />
      <div className="prows">
        {ordered.map((p) => (
          <ProjectRow key={p.id} project={p} pending={by.get(p.id)?.length ?? 0} now={now} />
        ))}
      </div>
    </section>
  );
}

/** 一行「标签 + 内容」，用在「今天」这类区块。 */
export function LabeledRow({
  label,
  children,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="g trow" style={style}>
      <h3 className="idx tk">{label}</h3>
      <div className="main">{children}</div>
    </div>
  );
}
