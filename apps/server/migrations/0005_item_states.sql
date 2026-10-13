CREATE TABLE item_states (
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN ('needs_morii','blockers')),
  item_key TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','decided','later','not_applicable','acknowledged')),
  conclusion TEXT NOT NULL,
  due_date TEXT,
  at TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES status_snapshots(id),
  PRIMARY KEY(project_id,kind,item_key)
) STRICT;
