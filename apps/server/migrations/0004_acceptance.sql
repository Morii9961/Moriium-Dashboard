-- Morii 的判断与快照分开保存；audit_log 保留每一次变更。
CREATE TABLE acceptance_records (
  project_id TEXT NOT NULL REFERENCES projects(id),
  milestone_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted', 'rejected')),
  note TEXT NOT NULL,
  at TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES status_snapshots(id),
  PRIMARY KEY(project_id, milestone_id)
) STRICT;
