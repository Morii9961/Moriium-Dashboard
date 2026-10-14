CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh-Hans','ja','en')),
  project_id TEXT REFERENCES projects(id),
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('todo','doing','done','dropped')),
  source_snapshot_id INTEGER REFERENCES status_snapshots(id),
  source_action TEXT,
  source_key TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;
CREATE INDEX tasks_project ON tasks(project_id);
CREATE UNIQUE INDEX tasks_open_source ON tasks(project_id,source_key) WHERE source_key IS NOT NULL AND status IN ('todo','doing');
