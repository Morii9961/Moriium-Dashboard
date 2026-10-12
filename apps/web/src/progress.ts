/**
 * 进度展示用的派生数据（规划 02 第 5.4 节）。完全由快照计算，不做任何估算。
 * P4 的项目列表和详情会沿用这里的规则；样张先用它展示真实快照。
 */
import type { Milestone, Snapshot } from '@moriium-dashboard/protocol';

export interface ProgressSummary {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  notStarted: number;
  unknown: number;
  /** 完成且等 Morii 验收的里程碑（快照转述为 pending）。 */
  awaitingAcceptance: number;
  /** 快照里说已验收的完成里程碑（据报告）。 */
  reportedAccepted: number;
  blockers: number;
  decisions: number;
  /** 成熟、只剩上线或维护：没有未完成的里程碑，也没有阻塞。 */
  mature: boolean;
  /** 「还差什么」一行。 */
  line: string;
}

/** 用「 · 」连接；全角括号后面不加空格（与 02 第 5.4 节的写法一致）。 */
const joinParts = (parts: string[]) => parts.filter(Boolean).join(' · ').replaceAll('） · ', '）· ');

const MATURE_WORDING: Partial<Record<Snapshot['stage'], string>> = {
  launch_preparation: '功能成熟 · 等待上线',
  live: '已上线',
  maintenance: '维护中',
};

export function summarizeProgress(snapshot: Snapshot, coreMilestoneIds?: readonly string[]): ProgressSummary {
  const milestones: Milestone[] =
    coreMilestoneIds && coreMilestoneIds.length > 0
      ? snapshot.milestones.filter((m) => coreMilestoneIds.includes(m.id))
      : snapshot.milestones;
  const count = (status: Milestone['status']) => milestones.filter((m) => m.status === status).length;
  const done = count('done');
  const inProgress = count('in_progress');
  const blocked = count('blocked');
  const notStarted = count('not_started');
  const unknown = count('unknown');
  const awaitingAcceptance = milestones.filter(
    (m) => m.status === 'done' && m.human_acceptance === 'pending',
  ).length;
  const reportedAccepted = milestones.filter(
    (m) =>
      m.status === 'done' && (m.human_acceptance === 'accepted' || m.evidence_level === 'morii_accepted'),
  ).length;
  const blockers = snapshot.blockers.length;
  const decisions = snapshot.needs_morii.length;
  const remaining = inProgress + blocked + notStarted;
  const mature = remaining === 0 && blockers === 0;

  const waiting = decisions + awaitingAcceptance;
  const waitingText =
    waiting > 0
      ? `等你 ${waiting} 件（${[
          decisions > 0 ? `${decisions} 个决定` : '',
          awaitingAcceptance > 0 ? `${awaitingAcceptance} 次验收` : '',
        ]
          .filter(Boolean)
          .join('、')}）`
      : '';
  const unknownText = unknown > 0 ? `另有 ${unknown} 个状态未知` : '';

  let line: string;
  if (mature) {
    const head =
      MATURE_WORDING[snapshot.stage] ??
      (milestones.length === 0
        ? '快照里没有里程碑'
        : unknown > 0
          ? '已知的里程碑都已完成'
          : '里程碑都已完成');
    line = joinParts([head, waitingText, unknownText]);
  } else {
    const parts = [
      remaining > 0 ? `${remaining} 个里程碑未完成${blocked > 0 ? `（其中 ${blocked} 个受阻）` : ''}` : '',
      blockers > 0 ? `${blockers} 个阻塞` : '',
      waitingText,
      unknownText,
    ];
    line = `还差：${joinParts(parts)}`;
  }

  return {
    total: milestones.length,
    done,
    inProgress,
    blocked,
    notStarted,
    unknown,
    awaitingAcceptance,
    reportedAccepted,
    blockers,
    decisions,
    mature,
    line,
  };
}

/** 卡片上的下一步：第一条 P0，没有就第一条 P1（02 第 5.4 节）。 */
export function headlineNextAction(snapshot: Snapshot) {
  return (
    snapshot.next_actions.find((a) => a.priority === 'P0') ??
    snapshot.next_actions.find((a) => a.priority === 'P1')
  );
}

export type Freshness = 'fresh' | 'aging' | 'stale' | 'not_counted';

/** 报告新鲜度（04 第 11 节）：7 天内较新，7 到 14 天有些旧，超过 14 天过期；暂停不计算。 */
export function freshness(snapshotAtUtcMs: number, now: Date, stage: Snapshot['stage']): Freshness {
  if (stage === 'paused') return 'not_counted';
  const days = (now.getTime() - snapshotAtUtcMs) / 86_400_000;
  if (days > 14) return 'stale';
  if (days > 7) return 'aging';
  return 'fresh';
}
