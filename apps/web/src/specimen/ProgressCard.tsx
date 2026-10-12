/**
 * 项目进度卡（样张第二轮）。
 *
 * 卡面只回答四件事（02 第 5.4 节）：做到哪里（路线图）、还差什么、下一步、等你几件。
 * 其余的细节放在详情层里：鼠标停留片刻、键盘聚焦到卡片、或点「详情」时出现。
 * 详情层不藏关键信息（02 第 16 节）；触屏设备只用「详情」按钮，点开后固定显示，Esc 关闭。
 */
import { displayValue, type Snapshot } from '@moriium-dashboard/protocol';
import { useId, useState } from 'react';
import { freshness, headlineNextAction, MATURE_WORDING, summarizeProgress } from '../progress.ts';
import {
  EvidenceTag,
  evidenceKindOf,
  LineMap,
  MilestoneGrid,
  ProgressEstimate,
  STATUS_TEXT,
  StaleIcon,
  StatusGlyph,
} from './parts.tsx';

export interface CardItem {
  name: string;
  snapshot: Snapshot;
  utcMs: number;
  offsetMinutes: number;
  attribution: string;
  sourceLabel: string;
}

const MILESTONE_LIMIT = 6;
const STATUS_ORDER = { blocked: 0, in_progress: 1, not_started: 2, unknown: 3, done: 4 } as const;

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

export function ProgressCard({ item, now }: { item: CardItem; now: Date }) {
  const [pinned, setPinned] = useState(false);
  const detailId = useId();
  const s = item.snapshot;
  const p = summarizeProgress(s);
  const next = headlineNextAction(s);
  const fresh = freshness(item.utcMs, now, s.stage);
  const days = Math.floor((now.getTime() - item.utcMs) / 86_400_000);
  const waiting = p.decisions + p.awaitingAcceptance;
  const matureWording = p.mature ? MATURE_WORDING[s.stage] : undefined;
  const matureStage = matureWording !== undefined;

  // 卡面上的一句话：成熟项目按阶段改写，其余只说未完成的里程碑和阻塞；等你几件放到右下角。
  const headline = matureWording
    ? matureWording
    : p.remaining > 0
      ? `还差 ${p.remaining} 个里程碑${p.blocked > 0 ? `，其中 ${p.blocked} 个受阻` : ''}`
      : p.total === 0
        ? '快照里没有里程碑'
        : p.unknown > 0
          ? '已知的里程碑都已完成'
          : '里程碑都已完成';
  const subline = p.blockers > 0 ? `${p.blockers} 个阻塞` : '';

  const milestones = [...s.milestones].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const shown = milestones.slice(0, MILESTONE_LIMIT);

  return (
    <article
      className={`pcard${pinned ? ' is-pinned' : ''}`}
      aria-labelledby={`${detailId}-name`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && pinned) {
          setPinned(false);
          e.stopPropagation();
        }
      }}
    >
      <header className="pcard-head">
        <h3 className="pcard-name" id={`${detailId}-name`}>
          {displayValue(item.name)}
        </h3>
        <p className={`pcard-fresh fresh-${fresh}`}>
          {fresh === 'stale' ? (
            <>
              <StaleIcon />
              报告已 {days} 天
            </>
          ) : (
            relativeAge(item.utcMs, now)
          )}
        </p>
      </header>

      <LineMap stage={s.stage} />

      <div className="pcard-body">
        <p className={`pcard-headline${matureStage ? ' is-mature' : ''}`}>
          {headline}
          {subline ? <span className="pcard-subline">{subline}</span> : null}
        </p>
        {next ? (
          <p className="pcard-next">
            <span className="pcard-label">下一步</span>
            <span className="pcard-next-text" lang="zh-Hans">
              {displayValue(next.title)}
            </span>
          </p>
        ) : null}
      </div>

      <footer className="pcard-foot">
        {waiting > 0 ? (
          <span className="pcard-waiting">
            等你 <strong>{waiting}</strong> 件
          </span>
        ) : (
          <span className="pcard-waiting is-none">无需你处理</span>
        )}
        <button
          type="button"
          className="pcard-toggle"
          aria-expanded={pinned}
          aria-controls={detailId}
          onClick={() => setPinned((v) => !v)}
        >
          详情
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
      </footer>

      <section className="pcard-detail" id={detailId} aria-label={`${item.name} 的详情`}>
        <p className="detail-summary" lang="zh-Hans">
          {displayValue(s.summary)}
        </p>

        <div className="detail-block">
          <h4 className="detail-title">
            里程碑{' '}
            <span className="detail-count">
              {p.done}/{p.total} 完成
            </span>
          </h4>
          <div className="detail-layers">
            <MilestoneGrid milestones={s.milestones} />
            <span>
              有证据{' '}
              {
                s.milestones.filter(
                  (m) =>
                    m.status === 'done' &&
                    (m.evidence_level === 'repository' || m.evidence_level === 'existing_test'),
                ).length
              }
              {' · '}自报{' '}
              {
                s.milestones.filter(
                  (m) =>
                    m.status === 'done' &&
                    (m.evidence_level === 'self_report' || m.evidence_level === 'unknown'),
                ).length
              }
              {' · '}据报告已验收 {p.reportedAccepted}
            </span>
          </div>
          <ul className="detail-milestones">
            {shown.map((m) => (
              <li key={m.id}>
                <span className={`status status-${m.status}`} title={STATUS_TEXT[m.status]}>
                  <StatusGlyph status={m.status} />
                  <span className="sr-only">{STATUS_TEXT[m.status]}</span>
                </span>
                <span className="detail-ms-title" lang="zh-Hans" title={m.title}>
                  {displayValue(m.title)}
                </span>
                {m.status === 'done' ? <EvidenceTag kind={evidenceKindOf(m)} /> : null}
              </li>
            ))}
          </ul>
          {milestones.length > MILESTONE_LIMIT ? (
            <p className="detail-more">另有 {milestones.length - MILESTONE_LIMIT} 个已完成或未开始的里程碑</p>
          ) : null}
        </div>

        {s.blockers.length > 0 ? (
          <div className="detail-block">
            <h4 className="detail-title">
              阻塞 <span className="detail-count">{s.blockers.length}</span>
            </h4>
            <ul className="detail-list" lang="zh-Hans">
              {s.blockers.slice(0, 3).map((b) => (
                <li key={b.id ?? b.title}>{displayValue(b.title)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="detail-block detail-waiting">
          <h4 className="detail-title">等你</h4>
          <p>
            {p.decisions} 个决定 · {p.awaitingAcceptance} 次验收
            {p.unknown > 0 ? ` · 另有 ${p.unknown} 个里程碑状态未知` : ''}
          </p>
        </div>

        <p className="detail-meta">
          <span>{item.attribution}</span>
          <span className="mono">
            {s.source.branch ? displayValue(s.source.branch) : '分支未注明'}
            {s.source.commit_sha ? ` @ ${s.source.commit_sha.slice(0, 7)}` : ''}
          </span>
          <span>快照 {localTime(item.utcMs, item.offsetMinutes)}</span>
          {s.overall_progress !== null ? <ProgressEstimate value={s.overall_progress} /> : null}
          <span className="detail-source">{item.sourceLabel}</span>
        </p>
      </section>
    </article>
  );
}
