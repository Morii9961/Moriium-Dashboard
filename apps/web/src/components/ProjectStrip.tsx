/**
 * 项目进度长条（2026-10-12 定稿）。
 *
 * 一行只放最关键的：项目与阶段、路线图（站名写在每一行里）、进度百分比、还差什么、待确认几项。
 * 百分比：快照有 overall_progress 就用它，前面加「≈」表示是 Agent 估算；没有就按已知里程碑的完成率
 * 计算（progressFigure）。来源不再写在数字下面，但读屏和悬停提示会说清楚（启动提示词规则 1）。
 *
 * 细节在长条内部展开（不弹出浮层）：鼠标停留片刻、键盘聚焦，或点击长条时展开；点击后固定，Esc 收起。
 * 地址栏的 #锚点 指向这一条时（例如从线路总图点过来）也会固定展开。
 */
import { displayValue, type Snapshot } from '@moriium-dashboard/protocol';
import { type MouseEvent, useEffect, useId, useState } from 'react';
import { type I18n, useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { freshness, progressFigure, summarizeProgress } from '../progress.ts';
import {
  EvidenceTag,
  evidenceKindOf,
  LineMap,
  ProgressEstimate,
  SegBar,
  StaleIcon,
  StatusGlyph,
} from './parts.tsx';

export type Origin = 'real' | 'self' | 'demo';

export interface StripItem {
  anchor: string;
  name: string;
  snapshot: Snapshot;
  utcMs: number;
  offsetMinutes: number;
  agent: 'claude' | 'codex' | 'other' | null;
  agentInferred: boolean;
  /** 登记表里这个项目的过期天数；不传时按 14 天。 */
  staleAfterDays?: number;
  /** 项目的关注状态是「已暂停」：不计算过期。 */
  projectPaused?: boolean;
  /** 设计基线页用来标出数据来源；应用里不传。 */
  origin?: Origin;
}

const MILESTONE_LIMIT = 7;
const STATUS_ORDER = { blocked: 0, in_progress: 1, not_started: 2, unknown: 3, done: 4 } as const;
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;

/** 进度数字和它的来源说明；长条和线路总图共用。 */
export function figureOf(s: Snapshot, t: I18n['t']) {
  const p = summarizeProgress(s);
  const figure = progressFigure(s, p);
  const source =
    figure === null
      ? t('progress.none')
      : figure.basis === 'estimate'
        ? t('progress.estimate')
        : t(p.unknown > 0 ? 'progress.knownMilestones' : 'progress.milestones', {
            done: p.done,
            total: p.total - p.unknown,
          });
  const text = figure === null ? '—' : `${figure.basis === 'estimate' ? '≈' : ''}${figure.percent}%`;
  return { p, figure, source, text, label: figure === null ? source : `${source} ${figure.percent}%` };
}

export function ProjectStrip({
  item,
  now,
  defaultPinned = false,
}: {
  item: StripItem;
  now: Date;
  /** 项目详情页里默认展开。 */
  defaultPinned?: boolean;
}) {
  const { t, relative, snapshotTime } = useI18n();
  const [pinned, setPinned] = useState(defaultPinned);
  const id = useId();
  const s = item.snapshot;
  const { p, figure, source } = figureOf(s, t);
  const fresh = freshness(item.utcMs, now, s.stage, {
    ...(item.staleAfterDays !== undefined ? { staleAfterDays: item.staleAfterDays } : {}),
    ...(item.projectPaused ? { projectPaused: true } : {}),
  });
  const days = Math.floor((now.getTime() - item.utcMs) / 86_400_000);
  const waiting = p.decisions + p.awaitingAcceptance;
  const mature =
    p.mature && (s.stage === 'launch_preparation' || s.stage === 'live' || s.stage === 'maintenance')
      ? t(`mature.${s.stage}`)
      : undefined;

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${item.anchor}`) setPinned(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [item.anchor]);

  const headline =
    mature ??
    (p.remaining > 0
      ? t('gap.remaining', { n: p.remaining })
      : p.total === 0
        ? t('gap.noMilestones')
        : p.unknown > 0
          ? t('gap.allKnownDone')
          : t('gap.allDone'));
  const subline = [
    p.blocked > 0 ? t('gap.blocked', { n: p.blocked }) : '',
    p.blockers > 0 ? t('gap.blockers', { n: p.blockers }) : '',
    p.unknown > 0 ? t('gap.unknown', { n: p.unknown }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const agentName = item.agent ? t(`agent.${item.agent}`) : t('agent.unknown');
  const reporter = item.agent && item.agentInferred ? t('agent.inferred', { agent: agentName }) : agentName;

  const milestones = [...s.milestones].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const nextActions = [...s.next_actions].sort(
    (a, b) => (a.priority ? PRIORITY_ORDER[a.priority] : 3) - (b.priority ? PRIORITY_ORDER[b.priority] : 3),
  );

  const toggle = (e: MouseEvent) => {
    // 选中文字时不切换；点到链接或按钮时交给它们自己。
    if (window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    setPinned((v) => !v);
  };

  return (
    <article
      id={item.anchor}
      className={`strip${pinned ? ' is-pinned' : ''}`}
      aria-labelledby={`${id}-name`}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pinned) {
          setPinned(false);
          e.stopPropagation();
        }
      }}
    >
      <div className="strip-main">
        <div className="strip-id">
          <h3 className="strip-name" id={`${id}-name`}>
            {displayValue(item.name)}
          </h3>
          <p className="strip-meta">
            <span>{t(`stage.${s.stage}` as MessageKey)}</span>
            <span aria-hidden="true">·</span>
            {fresh === 'stale' ? (
              <span className="is-stale">
                <StaleIcon />
                {t('strip.stale', { days })}
              </span>
            ) : (
              <span>{relative(item.utcMs, now)}</span>
            )}
          </p>
        </div>

        <div className="strip-route">
          <LineMap stage={s.stage} size="row" />
        </div>

        <div className="strip-progress">
          <p className="figure" title={source}>
            {figure?.basis === 'estimate' ? (
              <span className="figure-approx" aria-hidden="true">
                ≈
              </span>
            ) : null}
            {figure !== null ? (
              <>
                {figure.percent}
                <span className="figure-unit">%</span>
              </>
            ) : (
              '—'
            )}
            <span className="sr-only">（{source}）</span>
          </p>
          <SegBar milestones={s.milestones} />
        </div>

        <div className="strip-gap">
          <p className={`strip-headline${mature ? ' is-mature' : ''}`}>{headline}</p>
          {subline ? <p className="strip-subline">{subline}</p> : null}
        </div>

        <div className={`strip-waiting${waiting === 0 ? ' is-none' : ''}`}>
          <p className="figure figure-sm">{waiting > 0 ? waiting : '—'}</p>
          <p className="figure-caption">{t('strip.pending')}</p>
        </div>

        <button
          type="button"
          className="strip-toggle"
          aria-expanded={pinned}
          aria-controls={id}
          aria-label={t(pinned ? 'strip.collapse' : 'strip.expand', { name: item.name })}
          onClick={() => setPinned((v) => !v)}
        >
          <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="strip-more" id={id}>
        <div className="strip-more-inner">
          <section className="more-col" aria-label={t('more.sectionNext')}>
            <h4 className="more-title">{t('more.next')}</h4>
            {nextActions.length > 0 ? (
              <ol className="more-next">
                {nextActions.slice(0, 3).map((a) => (
                  <li key={a.id ?? a.title}>
                    <span className={`prio prio-${a.priority ?? 'none'}`}>{a.priority ?? '?'}</span>
                    <span lang="zh-Hans">{displayValue(a.title)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="more-empty">{t('more.noNext')}</p>
            )}
            <p className="more-summary" lang="zh-Hans">
              {displayValue(s.summary)}
            </p>
          </section>

          <section className="more-col" aria-label={t('more.milestones')}>
            <h4 className="more-title">
              {t('more.milestones')} <span>{t('more.milestonesDone', { done: p.done, total: p.total })}</span>
            </h4>
            <ul className="more-milestones">
              {milestones.slice(0, MILESTONE_LIMIT).map((m) => (
                <li key={m.id}>
                  <span className={`status status-${m.status}`}>
                    <StatusGlyph status={m.status} />
                    <span className="sr-only">{t(`status.${m.status}`)}</span>
                  </span>
                  <span className="more-ms-title" lang="zh-Hans" title={m.title}>
                    {displayValue(m.title)}
                  </span>
                  {m.status === 'done' ? <EvidenceTag kind={evidenceKindOf(m)} /> : null}
                </li>
              ))}
            </ul>
            {milestones.length > MILESTONE_LIMIT ? (
              <p className="more-empty">{t('more.moreDone', { n: milestones.length - MILESTONE_LIMIT })}</p>
            ) : null}
          </section>

          <section className="more-col" aria-label={t('more.sectionSide')}>
            {s.blockers.length > 0 ? (
              <>
                <h4 className="more-title">
                  {t('more.blockers')} <span>{s.blockers.length}</span>
                </h4>
                <ul className="more-list" lang="zh-Hans">
                  {s.blockers.slice(0, 3).map((b) => (
                    <li key={b.id ?? b.title}>{displayValue(b.title)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <h4 className="more-title">{t('more.pending')}</h4>
            <p className="more-text">
              {t('more.pendingDetail', { decisions: p.decisions, acceptances: p.awaitingAcceptance })}
            </p>
            <dl className="more-meta">
              <dt>{t('more.reporter')}</dt>
              <dd>{reporter}</dd>
              <dt>{t('more.source')}</dt>
              <dd className="mono">
                {s.source.branch ? displayValue(s.source.branch) : t('more.branchUnknown')}
                {s.source.commit_sha ? ` @ ${s.source.commit_sha.slice(0, 7)}` : ''}
              </dd>
              <dt>{t('more.snapshot')}</dt>
              <dd>{snapshotTime(item.utcMs, item.offsetMinutes)}</dd>
              {s.overall_progress !== null ? (
                <>
                  <dt>{t('more.estimate')}</dt>
                  <dd>
                    <ProgressEstimate value={s.overall_progress} />
                  </dd>
                </>
              ) : null}
            </dl>
            {item.origin ? <p className="more-source">{t(`origin.${item.origin}`)}</p> : null}
          </section>
        </div>
      </div>
    </article>
  );
}
