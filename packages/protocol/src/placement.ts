/**
 * 一份通过校验的快照放进历史时属于哪种情况（04 第 5 节）。
 * 纯函数：调用方提供该项目已有快照的摘要，服务端和前端预览都用它。
 */

export interface ExistingSnapshot {
  id: string;
  snapshotAtUtcMs: number;
  contentFingerprint: string;
  /** 在回收站里。 */
  deleted: boolean;
  /** 被同一时刻的新内容替换过。 */
  superseded: boolean;
}

export type Placement =
  /** 内容完全相同，不再保存。deleted 为 true 时那份在回收站里，可以恢复。 */
  | { kind: 'duplicate'; of: string; deleted: boolean }
  /** 同一时刻、内容不同，由 Morii 选择替换或取消。 */
  | { kind: 'conflict'; with: string }
  /** 比当前最新的晚（或这是第一份），成为当前状态。 */
  | { kind: 'latest'; replaces: string | null }
  /** 比当前最新的早，只进历史。 */
  | { kind: 'history'; currentLatest: string };

export function placeSnapshot(
  candidate: { snapshotAtUtcMs: number; contentFingerprint: string },
  existing: readonly ExistingSnapshot[],
): Placement {
  // 重复：先找有效的，再找回收站里的。被替换的版本也算见过。
  const sameContent = existing.filter((e) => e.contentFingerprint === candidate.contentFingerprint);
  const activeDuplicate = sameContent.find((e) => !e.deleted);
  if (activeDuplicate) return { kind: 'duplicate', of: activeDuplicate.id, deleted: false };
  const trashedDuplicate = sameContent[0];
  if (trashedDuplicate) return { kind: 'duplicate', of: trashedDuplicate.id, deleted: true };

  const active = existing.filter((e) => !e.deleted && !e.superseded);
  const sameInstant = active.find((e) => e.snapshotAtUtcMs === candidate.snapshotAtUtcMs);
  if (sameInstant) return { kind: 'conflict', with: sameInstant.id };

  const latest = currentLatest(active);
  if (!latest || candidate.snapshotAtUtcMs > latest.snapshotAtUtcMs) {
    return { kind: 'latest', replaces: latest?.id ?? null };
  }
  return { kind: 'history', currentLatest: latest.id };
}

/** 「当前状态」：未删除、未被替换的快照里 snapshot_at 最晚的一份，与导入先后无关。 */
export function currentLatest<T extends Pick<ExistingSnapshot, 'snapshotAtUtcMs' | 'deleted' | 'superseded'>>(
  snapshots: readonly T[],
): T | undefined {
  let latest: T | undefined;
  for (const s of snapshots) {
    if (s.deleted || s.superseded) continue;
    if (!latest || s.snapshotAtUtcMs > latest.snapshotAtUtcMs) latest = s;
  }
  return latest;
}

/** 同一批里同一项目有多份时，按时间从早到晚处理，最晚的那份成为当前状态。 */
export function orderForImport<T extends { snapshotAtUtcMs: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.snapshotAtUtcMs - b.snapshotAtUtcMs);
}
