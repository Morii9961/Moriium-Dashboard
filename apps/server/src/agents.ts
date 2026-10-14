import { diffSnapshots } from '@moriium-dashboard/protocol';
import type { Database } from './db.ts';
import { projectViews } from './overview.ts';
import { getSnapshot, type SnapshotRecord } from './snapshots.ts';

/** Report chronology and attribution come only from imported, effective snapshots. */
export function agentReports(db: Database, now: Date) {
  const projects = projectViews(db, now);
  const rows = db
    .prepare(`SELECT id FROM status_snapshots
    WHERE deleted_at IS NULL AND superseded_by IS NULL
    ORDER BY snapshot_at_utc_ms ASC, id ASC`)
    .all() as { id: number }[];
  const previous = new Map<string, SnapshotRecord>();
  const reports = rows
    .flatMap(({ id }) => {
      const s = getSnapshot(db, id);
      if (!s) return [];
      const old = previous.get(s.projectId);
      previous.set(s.projectId, s);
      const diff = old ? diffSnapshots(old.snapshot, s.snapshot) : null;
      return [
        {
          id: s.id,
          projectId: s.projectId,
          reporter: s.reporter,
          snapshotAt: s.snapshotAt,
          utcMs: s.utcMs,
          offsetMinutes: s.offsetMinutes,
          importedAt: s.importedAt,
          previousId: old?.id ?? null,
          changes: diff
            ? {
                stage: diff.stage,
                completed:
                  diff.milestones.added.filter((m) => m.status === 'done').length +
                  diff.milestones.changed.filter(
                    (m) => m.before.status !== 'done' && m.after.status === 'done',
                  ).length,
                blockers: diff.blockers.added.length,
                decisions: diff.needsMorii.added.length,
              }
            : null,
        },
      ];
    })
    .sort((a, b) => Date.parse(b.importedAt) - Date.parse(a.importedAt) || b.id - a.id);
  const agents = (['codex', 'claude', 'other', null] as const).map((agent) => {
    const own = reports.filter((r) => r.reporter.agent === agent);
    const current = projects.filter((p) => p.current && p.current.reporter.agent === agent);
    const evidence = { accepted: 0, repository: 0, existingTest: 0, self: 0, reported: 0, unknown: 0 };
    for (const p of current)
      for (const m of p.current?.snapshot.milestones ?? []) {
        if (m.status !== 'done') continue;
        if (p.acceptances.some((a) => a.milestoneId === m.id && a.status === 'accepted')) evidence.accepted++;
        if (m.human_acceptance === 'accepted' || m.evidence_level === 'morii_accepted') evidence.reported++;
        if (m.evidence_level === 'repository') evidence.repository++;
        else if (m.evidence_level === 'existing_test') evidence.existingTest++;
        else if (m.evidence_level === 'self_report') evidence.self++;
        else if (m.evidence_level === 'unknown') evidence.unknown++;
      }
    return {
      agent,
      latest: own[0] ?? null,
      count30: own.filter(
        (r) =>
          Date.parse(r.importedAt) <= now.getTime() &&
          Date.parse(r.importedAt) >= now.getTime() - 30 * 86400000,
      ).length,
      evidence,
      pending: current.reduce(
        (n, p) => n + p.reviewItems.filter((i) => i.kind === 'needs_morii' && i.pending && !i.gone).length,
        0,
      ),
      assignments: agent
        ? projects.flatMap((p) =>
            p.agentAssignments
              .filter((a) => a.agent === agent)
              .map((a) => ({ projectId: p.id, scope: a.scope })),
          )
        : [],
    };
  });
  return { agents, reports: reports.slice(0, 100), projects };
}
