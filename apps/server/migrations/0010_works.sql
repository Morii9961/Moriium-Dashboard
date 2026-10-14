CREATE TABLE works (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('zh-Hans','ja','en')),
  kind TEXT NOT NULL CHECK (kind IN ('release','launch','photos','video','design','article','other')),
  date TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  link TEXT NOT NULL,
  note TEXT NOT NULL,
  treasured INTEGER NOT NULL CHECK (treasured IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
CREATE TABLE work_covers (
  work_id INTEGER PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  bytes BLOB NOT NULL
) STRICT;
CREATE INDEX works_project ON works(project_id,date);
