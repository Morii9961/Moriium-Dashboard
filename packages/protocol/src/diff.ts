/**
 * 两份快照的差异（04 第 10 节「对比视图」）。
 * 里程碑按 id 配对；阻塞、下一步、待决定先按 id 配对，剩下的按规范化文本配对。
 */
import type { Blocker, Milestone, NeedsMoriiItem, NextAction, Snapshot } from './types.ts';

/**
 * 待决定和阻塞没有 id 时的匹配文本（04 第 9 节）：去掉首尾空白、合并连续空白、统一全半角。
 * NFKC 会把全角字母数字和全角标点换成半角。
 */
export function normalizeItemText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** 跨快照识别同一条目的键：有 id 用 id，否则用规范化文本。 */
export function itemKey(item: { id?: string }, text: string): string {
  return item.id !== undefined ? `id:${item.id}` : `text:${normalizeItemText(text)}`;
}

export interface Change<T> {
  from: T;
  to: T;
}

export type MilestoneField = 'title' | 'status' | 'evidence_level' | 'evidence_refs' | 'human_acceptance';

export interface MilestoneChange {
  id: string;
  before: Milestone;
  after: Milestone;
  fields: MilestoneField[];
}

export interface ItemDiff<T> {
  added: T[];
  removed: T[];
  /** 配对上的条目（措辞可能改过）。 */
  kept: { before: T; after: T }[];
}

export interface SnapshotDiff {
  stage: Change<Snapshot['stage']> | null;
  overallProgress: Change<number | null> | null;
  summary: Change<string> | null;
  milestones: { added: Milestone[]; removed: Milestone[]; changed: MilestoneChange[] };
  blockers: ItemDiff<Blocker>;
  nextActions: ItemDiff<NextAction> & {
    priorityChanged: { before: NextAction; after: NextAction }[];
  };
  needsMorii: ItemDiff<NeedsMoriiItem>;
  source: {
    branch: Change<string | null> | null;
    commitSha: Change<string | null> | null;
    basisAdded: string[];
    basisRemoved: string[];
  };
}

const change = <T>(from: T, to: T): Change<T> | null => (Object.is(from, to) ? null : { from, to });

function diffMilestones(before: Milestone[], after: Milestone[]): SnapshotDiff['milestones'] {
  const beforeById = new Map(before.map((m) => [m.id, m]));
  const afterIds = new Set(after.map((m) => m.id));
  const changed: MilestoneChange[] = [];
  const added: Milestone[] = [];
  for (const m of after) {
    const old = beforeById.get(m.id);
    if (!old) {
      added.push(m);
      continue;
    }
    const fields: MilestoneField[] = [];
    if (old.title !== m.title) fields.push('title');
    if (old.status !== m.status) fields.push('status');
    if (old.evidence_level !== m.evidence_level) fields.push('evidence_level');
    if (JSON.stringify(old.evidence_refs) !== JSON.stringify(m.evidence_refs)) fields.push('evidence_refs');
    if (old.human_acceptance !== m.human_acceptance) fields.push('human_acceptance');
    if (fields.length > 0) changed.push({ id: m.id, before: old, after: m, fields });
  }
  return { added, removed: before.filter((m) => !afterIds.has(m.id)), changed };
}

/** 两轮配对：先按 id（双方都有 id 时），再按规范化文本。 */
export function matchItems<T extends { id?: string }>(
  before: readonly T[],
  after: readonly T[],
  textOf: (item: T) => string,
): ItemDiff<T> {
  const remainingBefore = new Set(before.map((_, i) => i));
  const kept: { before: T; after: T }[] = [];
  const unmatchedAfter: T[] = [];

  const byId = new Map<string, number>();
  before.forEach((item, i) => {
    if (item.id !== undefined && !byId.has(item.id)) byId.set(item.id, i);
  });
  const afterPending: T[] = [];
  for (const item of after) {
    const i = item.id !== undefined ? byId.get(item.id) : undefined;
    if (i !== undefined && remainingBefore.has(i)) {
      remainingBefore.delete(i);
      kept.push({ before: before[i] as T, after: item });
    } else {
      afterPending.push(item);
    }
  }

  for (const item of afterPending) {
    const text = normalizeItemText(textOf(item));
    const match = [...remainingBefore].find((i) => normalizeItemText(textOf(before[i] as T)) === text);
    if (match !== undefined) {
      remainingBefore.delete(match);
      kept.push({ before: before[match] as T, after: item });
    } else {
      unmatchedAfter.push(item);
    }
  }

  return {
    added: unmatchedAfter,
    removed: [...remainingBefore].sort((a, b) => a - b).map((i) => before[i] as T),
    kept,
  };
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const nextActions = matchItems(before.next_actions, after.next_actions, (a) => a.title);
  const beforeBasis = new Set(before.source.basis);
  const afterBasis = new Set(after.source.basis);
  return {
    stage: change(before.stage, after.stage),
    overallProgress: change(before.overall_progress, after.overall_progress),
    summary: change(before.summary, after.summary),
    milestones: diffMilestones(before.milestones, after.milestones),
    blockers: matchItems(before.blockers, after.blockers, (b) => b.title),
    nextActions: {
      ...nextActions,
      priorityChanged: nextActions.kept.filter((k) => k.before.priority !== k.after.priority),
    },
    needsMorii: matchItems(before.needs_morii, after.needs_morii, (n) => n.decision),
    source: {
      branch: change(before.source.branch, after.source.branch),
      commitSha: change(before.source.commit_sha, after.source.commit_sha),
      basisAdded: after.source.basis.filter((b) => !beforeBasis.has(b)),
      basisRemoved: before.source.basis.filter((b) => !afterBasis.has(b)),
    },
  };
}

export function isEmptyDiff(diff: SnapshotDiff): boolean {
  const m = diff.milestones;
  return (
    !diff.stage &&
    !diff.overallProgress &&
    !diff.summary &&
    m.added.length + m.removed.length + m.changed.length === 0 &&
    diff.blockers.added.length + diff.blockers.removed.length === 0 &&
    diff.nextActions.added.length +
      diff.nextActions.removed.length +
      diff.nextActions.priorityChanged.length ===
      0 &&
    diff.needsMorii.added.length + diff.needsMorii.removed.length === 0 &&
    !diff.source.branch &&
    !diff.source.commitSha &&
    diff.source.basisAdded.length + diff.source.basisRemoved.length === 0
  );
}
