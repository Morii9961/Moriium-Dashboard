-- 0003 · 快照与导入记录（规划 05 第 7 节 status_snapshots、import_batches，P3.3）。
-- 快照只增不改：原文逐字节保存，规范化结果是派生的；删除是软删除（回收站），替换只标记 superseded_by。

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  -- 每个文件的结果（JSON 数组）：文件名、结果、项目、快照、跳过原因。只存文件名，不存路径。
  results TEXT NOT NULL,
  undone_at TEXT
) STRICT;

CREATE TABLE status_snapshots (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  -- snapshot_at 原文，以及换算后的 UTC 毫秒和原文时区偏移（分钟）。
  snapshot_at TEXT NOT NULL,
  snapshot_at_utc_ms INTEGER NOT NULL,
  offset_minutes INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  validated_as TEXT NOT NULL,
  rules_version INTEGER NOT NULL,
  -- RFC 8785 规范化后的 SHA-256（去重用）和原始字节的 SHA-256（核对原文用）。
  content_fingerprint TEXT NOT NULL,
  raw_fingerprint TEXT NOT NULL,
  raw BLOB NOT NULL,
  normalized TEXT NOT NULL,
  warnings TEXT NOT NULL,
  normalizations TEXT NOT NULL,
  -- 报告归属：Agent 和依据（file 文件里的 reporter、branch 由分支前缀推断、chosen Morii 选的、none 未注明）。
  reporter_agent TEXT CHECK (reporter_agent IN ('claude', 'codex', 'other')),
  reporter_source TEXT NOT NULL CHECK (reporter_source IN ('file', 'branch', 'chosen', 'none')),
  reporter_note TEXT,
  batch_id INTEGER REFERENCES import_batches (id),
  file_name TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  superseded_by INTEGER REFERENCES status_snapshots (id),
  deleted_at TEXT
) STRICT;

-- 同一项目里同样的内容只存一份（包括回收站里的和被替换的），重复由导入逻辑先行识别。
CREATE UNIQUE INDEX status_snapshots_content ON status_snapshots (project_id, content_fingerprint);
CREATE INDEX status_snapshots_project_time ON status_snapshots (project_id, snapshot_at_utc_ms);
CREATE INDEX status_snapshots_batch ON status_snapshots (batch_id);
