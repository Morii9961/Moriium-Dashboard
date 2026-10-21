-- Independent private Usage domain; JSON contains validated aggregate facts only.
CREATE TABLE usage_imports (
  hash TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  source TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  imported_at TEXT NOT NULL,
  UNIQUE(dataset_id,revision)
) STRICT;
CREATE TABLE usage_daily_rows (
  import_hash TEXT NOT NULL REFERENCES usage_imports(hash),
  ordinal INTEGER NOT NULL,
  date TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK(json_valid(row_json)),
  PRIMARY KEY(import_hash,ordinal)
) STRICT;
CREATE INDEX usage_rows_date ON usage_daily_rows(date,import_hash);
CREATE TABLE usage_selections (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  date TEXT NOT NULL,
  import_hash TEXT REFERENCES usage_imports(hash),
  previous_hash TEXT REFERENCES usage_imports(hash),
  action TEXT NOT NULL CHECK(action IN ('import','select','undo')),
  at TEXT NOT NULL
) STRICT;
CREATE INDEX usage_selection_day ON usage_selections(dataset_id,date,id);
CREATE VIEW usage_resolved_days AS
  SELECT s.* FROM usage_selections s WHERE s.id=(SELECT MAX(t.id) FROM usage_selections t WHERE t.dataset_id=s.dataset_id AND t.date=s.date);
CREATE TABLE price_catalog_versions (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  catalog TEXT NOT NULL CHECK(json_valid(catalog))
) STRICT;
CREATE TABLE fx_snapshots (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot))
) STRICT;
CREATE TABLE usage_bills (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  revision INTEGER NOT NULL,
  previous_id INTEGER REFERENCES usage_bills(id),
  hash TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  created_at TEXT NOT NULL,
  UNIQUE(dataset_id,week_start,revision)
) STRICT;
