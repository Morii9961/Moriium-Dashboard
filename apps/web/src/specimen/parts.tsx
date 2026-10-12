/**
 * 样张里的小部件：路线图（阶段轴）、状态标记、证据标签、进度估算、里程碑格。
 * 规则来自规划 02 第 11 节。每个状态都有图形加文字，颜色不是唯一线索。
 *
 * 阶段轴已定为「圆点」画法（2026-10-12）。这一轮把它画成一条路线：
 * 走过的路段是实线，没走到的是细线；当前站是雾蓝，站名写在下面。
 */
import { type Milestone, STAGE_AXIS, type Stage } from '@moriium-dashboard/protocol';

export const STATION: Record<(typeof STAGE_AXIS)[number], string> = {
  planning: '规划',
  development: '开发',
  integration: '集成',
  acceptance: '验收',
  launch_preparation: '上线准备',
  live: '已上线',
  maintenance: '维护',
};

/** 路线图。paused 时整条变弱并写「已暂停」；unknown 时画成虚线并写「阶段未知」。 */
export function LineMap({ stage, size = 'card' }: { stage: Stage; size?: 'card' | 'compact' | 'row' }) {
  const current = (STAGE_AXIS as readonly string[]).indexOf(stage);
  const off = current < 0;
  const label =
    stage === 'paused'
      ? '已暂停'
      : stage === 'unknown'
        ? '阶段未知'
        : STATION[STAGE_AXIS[current] ?? 'planning'];
  return (
    <div
      className={`linemap linemap-${size}${stage === 'paused' ? ' linemap-paused' : ''}${stage === 'unknown' ? ' linemap-unknown' : ''}`}
      role="img"
      aria-label={`阶段：${label}`}
    >
      <ol className="linemap-stations" aria-hidden="true">
        {STAGE_AXIS.map((s, i) => {
          const state = off ? 'off' : i < current ? 'past' : i === current ? 'here' : 'ahead';
          return (
            <li key={s} className={`station station-${state}`}>
              <span className="station-dot" />
              <span className="station-name">{STATION[s]}</span>
            </li>
          );
        })}
      </ol>
      {off ? (
        <span className="linemap-note">
          {stage === 'paused' ? <PauseIcon /> : null}
          {label}
        </span>
      ) : null}
    </div>
  );
}

const SEG_ORDER = { done: 0, in_progress: 1, blocked: 2, not_started: 3, unknown: 4 } as const;

/** 里程碑分段条：一段一个里程碑，按完成、进行中、受阻、未开始、未知排列。文字说明在旁边。 */
export function SegBar({ milestones }: { milestones: readonly Milestone[] }) {
  const sorted = [...milestones].sort((a, b) => SEG_ORDER[a.status] - SEG_ORDER[b.status]);
  return (
    <span className="segbar" aria-hidden="true">
      {sorted.map((m) => (
        <span key={m.id} className={`seg seg-${m.status}`} />
      ))}
    </span>
  );
}

export function PauseIcon() {
  return (
    <svg className="icon icon-paused" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="3" width="2.5" height="10" rx="1" />
      <rect x="9.5" y="3" width="2.5" height="10" rx="1" />
    </svg>
  );
}

export function StaleIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 里程碑状态的图形（02 第 11.1 节）。 */
export function StatusGlyph({ status }: { status: Milestone['status'] }) {
  switch (status) {
    case 'done':
      return (
        <svg className="icon glyph-done" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'in_progress':
      return (
        <svg className="icon glyph-progress" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.5" />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" className="glyph-fill" />
        </svg>
      );
    case 'blocked':
      return (
        <svg className="icon glyph-blocked" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.5" />
          <path d="M4.2 11.8l7.6-7.6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'not_started':
      return (
        <svg className="icon glyph-todo" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.5" />
        </svg>
      );
    case 'unknown':
      return (
        <svg className="icon glyph-unknown" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.5" strokeDasharray="2.2 2" />
          <text x="8" y="11" textAnchor="middle" fontSize="7.5" fontWeight="700">
            ?
          </text>
        </svg>
      );
  }
}

export const STATUS_TEXT: Record<Milestone['status'], string> = {
  done: '完成',
  in_progress: '进行中',
  blocked: '受阻',
  not_started: '未开始',
  unknown: '未知',
};

export function StatusMark({ status }: { status: Milestone['status'] }) {
  return (
    <span className={`status status-${status}`}>
      <StatusGlyph status={status} />
      {STATUS_TEXT[status]}
    </span>
  );
}

/** 里程碑格：每个里程碑一格，形状区分状态；格子对读屏隐藏，旁边总有文字。 */
export function MilestoneGrid({ milestones }: { milestones: readonly Milestone[] }) {
  return (
    <span className="mgrid" aria-hidden="true">
      {milestones.map((m) => (
        <span key={m.id} className={`mcell mcell-${m.status}`} />
      ))}
    </span>
  );
}

export type EvidenceKind = 'self' | 'evidence' | 'test' | 'reported' | 'accepted' | 'rejected';

export const EVIDENCE_TEXT: Record<EvidenceKind, string> = {
  self: '自报',
  evidence: '仓库证据',
  test: '有测试记录',
  reported: '据报告已验收',
  accepted: '你已验收 · 10月9日',
  rejected: '你已退回 · 10月9日',
};

export function evidenceKindOf(m: Milestone): EvidenceKind {
  if (m.evidence_level === 'morii_accepted' || m.human_acceptance === 'accepted') return 'reported';
  if (m.evidence_level === 'existing_test') return 'test';
  if (m.evidence_level === 'repository') return 'evidence';
  return 'self';
}

/** 证据与验收的层级（02 第 11.2 节）：自报虚线、有证据实线、你的验收浅色填充。 */
export function EvidenceTag({ kind }: { kind: EvidenceKind }) {
  return (
    <span className={`tag tag-${kind}`}>
      {kind === 'reported' || kind === 'accepted' ? (
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {kind === 'rejected' ? (
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6 4L3 7l3 3M3.5 7H10a3 3 0 0 1 0 6H8"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {EVIDENCE_TEXT[kind]}
    </span>
  );
}

/** 有 overall_progress 时：一行小字加 120px 宽、2px 高的细条，标注「估算」（02 第 5.1 节）。 */
export function ProgressEstimate({ value }: { value: number }) {
  return (
    <span className="estimate">
      <span>Agent 估算 {value}%</span>
      <span className="estimate-bar" role="img" aria-label={`Agent 估算 ${value}%，不是验收比例`}>
        {/* React 通过 CSSOM 设置 style，严格 CSP（style-src 'self'）下允许；不会生成内联 style 属性。 */}
        <span className="estimate-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
    </span>
  );
}
