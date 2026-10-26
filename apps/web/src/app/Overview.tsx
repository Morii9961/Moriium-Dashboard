/**
 * 概览（DESIGN.md 第 5、6 节）：单栏长卷。首屏只有日期、待确认的主数字和横贯全宽的灰阶尺；
 * 往下依次是今天、需要你决定、项目、最近交付与最近报告。
 * 精力为「休息」时只留今天；为「低」时先列有截止日期的待决定，其余收起（P5 决定，不变）。
 */
import { type ReactNode, useMemo } from 'react';
import { inkStyle, type RulerItem, ZoneRuler, zoneOf } from '../components/Zone.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { RecentDeliveries } from './Deliveries.tsx';
import { useResource } from './data.tsx';
import { projectPath } from './ProjectList.tsx';
import { Link } from './router.tsx';
import { TodayPanel, useToday } from './Today.tsx';
import type { OverviewData } from './types.ts';
import { localizedName } from './types.ts';
import { PageHeader, SnapshotSteps } from './ui.tsx';
import {
  BandHead,
  byRuler,
  DecisionBands,
  LabeledRow,
  ProjectRows,
  pendingByProject,
} from './ZoneSections.tsx';

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

export function InboxPage() {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const { data, error } = useResource<OverviewData>('/api/overview');
  if (!data)
    return (
      <>
        <PageHeader title={t('nav.inbox')} />
        <p className="loading-line">{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      </>
    );
  return (
    <div className="page">
      <DecisionBands data={data} now={now} level={1} />
    </div>
  );
}

function FirstScreen({ data, now, rest }: { data: OverviewData; now: Date; rest: boolean }) {
  const { t, locale, fullDate, relative } = useI18n();
  const by = pendingByProject(data);
  const decisions = data.pending.filter((x) => x.kind === 'decision').length;
  const tracked = data.projects.filter((p) => p.attention === 'active' || p.attention === 'waiting');
  const items: RulerItem[] = [];
  const off: string[] = [];
  for (const p of byRuler(tracked)) {
    const c = p.current;
    const z = zoneOf(c?.snapshot.stage);
    const name = localizedName(p, locale);
    if (!c || z == null) {
      if (p.tracking === 'protocol') off.push(name);
      continue;
    }
    const age = relative(c.utcMs, now);
    items.push({
      key: p.id,
      zone: z,
      name,
      href: projectPath(p.id),
      meta: age,
      label: t('zone.hanger', {
        name,
        stage: t(`stage.${c.snapshot.stage}`),
        age,
        pending: by.get(p.id)?.length ?? 0,
      }),
      ink: inkStyle(c.utcMs, now),
    });
  }
  return (
    <section className="first" aria-labelledby="h-first">
      <p className="dateline">
        <time dateTime={now.toISOString()}>{fullDate(now)}</time> · {t('zone.week', { n: isoWeek(now) })}
      </p>
      {rest ? (
        <h1 className="ptitle page-title" id="h-first" tabIndex={-1}>
          {t('nav.overview')}
        </h1>
      ) : (
        <h1 className="hero page-title" id="h-first" tabIndex={-1}>
          <span className="big">{data.pending.length}</span>
          <span className="unit">{t('hero.unit')}</span>
          <span className="split">
            {t('hero.split', { decisions, acceptances: data.pending.length - decisions })}
          </span>
        </h1>
      )}
      {!rest && items.length ? (
        <ZoneRuler
          items={items}
          label={t('zone.ruler')}
          off={off.length ? t('zone.offRuler', { names: off.join('、') }) : null}
        />
      ) : null}
    </section>
  );
}

export function OverviewPage() {
  const { t, locale, relative } = useI18n();
  const now = useMemo(() => new Date(), []);
  const { data, error } = useResource<OverviewData>('/api/overview');
  const today = useToday();
  const energy = today.data?.energy ?? null;

  if (!data)
    return (
      <>
        <PageHeader title={t('nav.overview')} />
        <p className="loading-line">{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      </>
    );

  const tracked = data.projects.filter((p) => p.attention === 'active' || p.attention === 'waiting');
  const paused = data.projects.filter((p) => p.attention === 'paused');
  const empty = !tracked.some((p) => p.current) && !tracked.some((p) => p.tracking === 'manual');
  const urgent = { ...data, pending: data.pending.filter((i) => i.item?.state?.dueDate) };

  return (
    <>
      <FirstScreen data={data} now={now} rest={energy === 'rest'} />
      <div className="page">
        <section className="block" id="today" aria-labelledby="today-title">
          {today.data ? (
            <TodayPanel key={today.data.date} day={today.data} />
          ) : (
            <p className="loading-line">{t(today.error ? 'projects.loadFailed' : 'common.loading')}</p>
          )}
        </section>
        {energy === 'low' ? (
          <section className="block" aria-labelledby="h-urgent">
            <BandHead
              title={t('today.urgent')}
              level={2}
              id="h-urgent"
              numbers={[[t('more.pending'), urgent.pending.length]]}
            />
            {urgent.pending.length ? (
              <DecisionBands data={urgent} now={now} level={2} />
            ) : (
              <div className="g">
                <p className="main empty-line">{t('inbox.empty')}</p>
              </div>
            )}
          </section>
        ) : null}
        <EnergyContent energy={energy}>
          {empty ? <SnapshotSteps /> : null}
          <DecisionBands data={data} now={now} level={2} limit={5} />
          <ProjectRows data={data} now={now} level={2} projects={tracked} />
          {paused.length ? (
            <details className="g resting-projects">
              <summary className="main">{t('overview.paused', { n: paused.length })}</summary>
              <ul className="main">
                {paused.map((p) => (
                  <li key={p.id}>
                    <Link to={projectPath(p.id)}>{localizedName(p, locale)}</Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <section className="block" aria-labelledby="h-recent">
            <BandHead
              title={t('zone.recent')}
              level={2}
              id="h-recent"
              numbers={[
                [t('zone.deliveries'), data.recentDelivery.length + data.recentWorks.length],
                [t('zone.reports'), data.latestReports.length],
              ]}
            />
            <LabeledRow label={t('overview.delivery')}>
              <RecentDeliveries data={data} />
            </LabeledRow>
            <LabeledRow label={t('overview.reports')}>
              <ul className="reports">
                {data.latestReports.map((r) => {
                  const p = data.projects.find((x) => x.id === r.projectId);
                  return (
                    <li key={r.agent ?? 'unknown'}>
                      <span className="meta">{t(r.agent ? `agent.${r.agent}` : 'agent.unknown')}</span>
                      <Link to={projectPath(r.projectId)} style={inkStyle(r.utcMs, now)}>
                        {p ? localizedName(p, locale) : r.projectName}
                      </Link>
                      <span className="when">
                        {t('more.snapshot')} {relative(r.utcMs, now)} · {t('detail.imported')}{' '}
                        <time dateTime={r.importedAt} title={t('detail.notOnline')}>
                          {relative(Date.parse(r.importedAt), now)}
                        </time>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </LabeledRow>
          </section>
        </EnergyContent>
      </div>
    </>
  );
}

function EnergyContent({ energy, children }: { energy: string | null; children: ReactNode }) {
  const { t } = useI18n();
  if (energy === 'rest') return null;
  if (energy === 'low')
    return (
      <details className="energy-collapsed">
        <summary>{t('today.collapsed')}</summary>
        {children}
      </details>
    );
  return children;
}
