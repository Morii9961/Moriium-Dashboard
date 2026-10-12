/**
 * 项目进度长条（样张第三轮）。
 *
 * 一行只放最关键的：项目与阶段、路线图（做到哪里）、进度数字、还差什么、等你几件。
 * 进度数字只用真实数据：快照给了 overall_progress 就显示「Agent 估算」的百分比；
 * 没给就显示里程碑完成数（例如 9/14），绝不把 null 画成百分比（启动提示词规则 1、02 第 5.4 节）。
 *
 * 细节在长条内部展开（不弹出浮层）：鼠标停留片刻、键盘聚焦，或点击长条时展开；点击后固定，Esc 收起。
 */
import { displayValue, type Snapshot, STAGE_LABELS } from '@moriium-dashboard/protocol';
import { type MouseEvent, useId, useState } from 'react';
import { freshness, MATURE_WORDING, summarizeProgress } from '../progress.ts';
import {
  EvidenceTag,
  evidenceKindOf,
  LineMap,
  ProgressEstimate,
  SegBar,
  STATUS_TEXT,
  StaleIcon,
  StatusGlyph,
} from './parts.tsx';

export interface StripItem {
  name: string;
  snapshot: Snapshot;
  utcMs: number;
  offsetMinutes: number;
  attribution: string;
  sourceLabel: string;
}

const MILESTONE_LIMIT = 7;
const STATUS_ORDER = { blocked: 0, in_progress: 1, not_started: 2, unknown: 3, done: 4 } as const;
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;

function relativeAge(utcMs: number, now: Date): string {
  const hours = Math.round((now.getTime() - utcMs) / 3_600_000);
  if (hours < 1) return '刚刚';
  if (hours < 48) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** 按快照原文的时区显示：10月11日 22:45。 */
function localTime(utcMs: number, offsetMinutes: number): string {
  const d = new Date(utcMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function ProjectStrip({ item, now }: { item: StripItem; now: Date }) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const s = item.snapshot;
  const p = summarizeProgress(s);
  const fresh = freshness(item.utcMs, now, s.stage);
  const days = Math.floor((now.getTime() - item.utcMs) / 86_400_000);
  const waiting = p.decisions + p.awaitingAcceptance;
  const matureWording = p.mature ? MATURE_WORDING[s.stage] : undefined;
  const estimate = s.overall_progress;

  const headline = matureWording
    ? matureWording
    : p.remaining > 0
      ? `还差 ${p.remaining} 个里程碑`
      : p.total === 0
        ? '快照里没有里程碑'
        : p.unknown > 0
          ? '已知的里程碑都已完成'
          : '里程碑都已完成';
  const subline = [
    p.blocked > 0 ? `${p.blocked} 个受阻` : '',
    p.blockers > 0 ? `${p.blockers} 个阻塞` : '',
    p.unknown > 0 ? `${p.unknown} 个状态未知` : '',
  ]
    .filter(Boolean)
    .join(' · ');

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
            <span>{STAGE_LABELS[s.stage]}</span>
            <span aria-hidden="true">·</span>
            {fresh === 'stale' ? (
              <span className="is-stale">
                <StaleIcon />
                报告已 {days} 天
              </span>
            ) : (
              <span>{relativeAge(item.utcMs, now)}</span>
            )}
          </p>
        </div>

        <div className="strip-route">
          <LineMap stage={s.stage} size="row" />
        </div>

        <div className="strip-progress">
          <p className="figure">
            {estimate !== null ? (
              <>
                {estimate}
                <span className="figure-unit">%</span>
              </>
            ) : (
              <>
                {p.done}
                <span className="figure-unit">/{p.total}</span>
              </>
            )}
          </p>
          <SegBar milestones={s.milestones} />
          <p className="figure-caption">
            {estimate !== null ? `Agent 估算 · 里程碑 ${p.done}/${p.total}` : '里程碑完成'}
          </p>
        </div>

        <div className="strip-gap">
          <p className={`strip-headline${matureWording ? ' is-mature' : ''}`}>{headline}</p>
          {subline ? <p className="strip-subline">{subline}</p> : null}
        </div>

        <div className={`strip-waiting${waiting === 0 ? ' is-none' : ''}`}>
          <p className="figure figure-sm">{waiting > 0 ? waiting : '—'}</p>
          <p className="figure-caption">等你</p>
        </div>

        <button
          type="button"
          className="strip-toggle"
          aria-expanded={pinned}
          aria-controls={id}
          aria-label={`${pinned ? '收起' : '展开'} ${item.name} 的详情`}
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
          <section className="more-col" aria-label="下一步与摘要">
            <h4 className="more-title">下一步</h4>
            {nextActions.length > 0 ? (
              <ol className="more-next">
                {nextActions.slice(0, 3).map((a) => (
                  <li key={a.id ?? a.title}>
                    <span className={`prio prio-${a.priority ?? 'none'}`}>{a.priority ?? '？'}</span>
                    <span lang="zh-Hans">{displayValue(a.title)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="more-empty">快照里没有下一步</p>
            )}
            <p className="more-summary" lang="zh-Hans">
              {displayValue(s.summary)}
            </p>
          </section>

          <section className="more-col" aria-label="里程碑">
            <h4 className="more-title">
              里程碑{' '}
              <span>
                {p.done}/{p.total} 完成
              </span>
            </h4>
            <ul className="more-milestones">
              {milestones.slice(0, MILESTONE_LIMIT).map((m) => (
                <li key={m.id}>
                  <span className={`status status-${m.status}`}>
                    <StatusGlyph status={m.status} />
                    <span className="sr-only">{STATUS_TEXT[m.status]}</span>
                  </span>
                  <span className="more-ms-title" lang="zh-Hans" title={m.title}>
                    {displayValue(m.title)}
                  </span>
                  {m.status === 'done' ? <EvidenceTag kind={evidenceKindOf(m)} /> : null}
                </li>
              ))}
            </ul>
            {milestones.length > MILESTONE_LIMIT ? (
              <p className="more-empty">另有 {milestones.length - MILESTONE_LIMIT} 个已完成的里程碑</p>
            ) : null}
          </section>

          <section className="more-col" aria-label="阻塞、等你、来源">
            {s.blockers.length > 0 ? (
              <>
                <h4 className="more-title">
                  阻塞 <span>{s.blockers.length}</span>
                </h4>
                <ul className="more-list" lang="zh-Hans">
                  {s.blockers.slice(0, 3).map((b) => (
                    <li key={b.id ?? b.title}>{displayValue(b.title)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <h4 className="more-title">等你</h4>
            <p className="more-text">
              {p.decisions} 个决定 · {p.awaitingAcceptance} 次验收
            </p>
            <dl className="more-meta">
              <dt>报告</dt>
              <dd>{item.attribution.replace('报告来自 ', '').replace('报告来自：', '')}</dd>
              <dt>来源</dt>
              <dd className="mono">
                {s.source.branch ? displayValue(s.source.branch) : '分支未注明'}
                {s.source.commit_sha ? ` @ ${s.source.commit_sha.slice(0, 7)}` : ''}
              </dd>
              <dt>快照</dt>
              <dd>{localTime(item.utcMs, item.offsetMinutes)}</dd>
              {estimate !== null ? (
                <>
                  <dt>估算</dt>
                  <dd>
                    <ProgressEstimate value={estimate} />
                  </dd>
                </>
              ) : null}
            </dl>
            <p className="more-source">{item.sourceLabel}</p>
          </section>
        </div>
      </div>
    </article>
  );
}
