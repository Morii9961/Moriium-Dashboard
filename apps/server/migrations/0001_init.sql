-- 0001 · 骨架：设置与操作记录。
-- 项目、快照、导入记录等表在 P3 按需新增迁移，不在骨架里预先建好。

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- 导入、删除、恢复、验收等操作的记录（规划 05 第 7 节 audit_log）。
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  summary TEXT NOT NULL
) STRICT;

CREATE INDEX audit_log_at ON audit_log (at);
