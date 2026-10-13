import type { Database } from './db.ts';
import { reviewItems } from './items.ts';
import { listProjects } from './projects.ts';
import { acceptanceRecords } from './review.ts';
import { currentSnapshots, getSnapshot, snapshotCounts } from './snapshots.ts';

export function projectViews(db: Database, now: Date) {
  const current = currentSnapshots(db);
  const counts = snapshotCounts(db);
  return listProjects(db).map((p) => ({
    ...p,
    current: current.get(p.id) ?? null,
    snapshotCount: counts.get(p.id) ?? 0,
    acceptances: acceptanceRecords(db, p.id),
    reviewItems: reviewItems(db, p.id, now),
  }));
}
export function overview(db: Database, now: Date) {
  const projects = projectViews(db, now);
  const active = projects.filter((p) => p.attention === 'active' || p.attention === 'waiting');
  const pending = active
    .flatMap((p) => {
      const c = p.current;
      if (!c) return [];
      const common = { projectId: p.id, projectName: p.name, snapshotId: c.id, utcMs: c.utcMs };
      const decisions = p.reviewItems
        .filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone)
        .map((i) => ({
          ...common,
          kind: 'decision' as const,
          key: i.key,
          title: i.text,
          item: i,
          milestoneId: null,
        }));
      const acceptances = c.snapshot.milestones
        .filter(
          (m) =>
            m.status === 'done' &&
            (p.acceptances.find((a) => a.milestoneId === m.id)?.status === 'rejected' ||
              (!p.acceptances.some((a) => a.milestoneId === m.id) && m.human_acceptance === 'pending')),
        )
        .map((m) => ({
          ...common,
          kind: 'acceptance' as const,
          key: m.id,
          title: m.title,
          item: null,
          milestoneId: m.id,
        }));
      return [...decisions, ...acceptances];
    })
    .sort(
      (a, b) => b.utcMs - a.utcMs || a.projectId.localeCompare(b.projectId) || a.key.localeCompare(b.key),
    );
  const ids = db
    .prepare(
      'SELECT id FROM status_snapshots WHERE deleted_at IS NULL AND superseded_by IS NULL ORDER BY imported_at DESC,id DESC',
    )
    .all() as { id: number }[];
  const latestReports = [];
  const agents = new Set<string>();
  for (const { id } of ids) {
    const s = getSnapshot(db, id);
    if (!s) continue;
    const agent = s.reporter.agent ?? 'unknown';
    if (agents.has(agent)) continue;
    agents.add(agent);
    latestReports.push({
      agent: s.reporter.agent,
      projectId: s.projectId,
      projectName: projects.find((p) => p.id === s.projectId)?.name ?? s.projectId,
      snapshotAt: s.snapshotAt,
      utcMs: s.utcMs,
      offsetMinutes: s.offsetMinutes,
      importedAt: s.importedAt,
      reporterSource: s.reporter.source,
    });
  }
  const recentDelivery = acceptanceRecords(db)
    .filter(
      (r) =>
        r.status === 'accepted' &&
        Date.parse(r.at) <= now.getTime() &&
        Date.parse(r.at) >= now.getTime() - 14 * 86_400_000,
    )
    .map((r) => ({
      ...r,
      projectName: projects.find((p) => p.id === r.projectId)?.name ?? r.projectId,
      title:
        getSnapshot(db, r.snapshotId)?.snapshot.milestones.find((m) => m.id === r.milestoneId)?.title ??
        r.milestoneId,
    }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);
  return { projects, pending, latestReports, recentDelivery };
}
