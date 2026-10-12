-- 0002 · 项目登记表（规划 05 第 7 节 projects，P3.1）。
-- 只建 MVP 用得到的列；手动项目的「正在」「下一步」、关键日期、链接等在用到时再加迁移。

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- 跟踪方式：protocol（靠快照）或 manual（手动维护，P4 起可用）。
  tracking TEXT NOT NULL DEFAULT 'protocol' CHECK (tracking IN ('protocol', 'manual')),
  -- 关注状态（02 第 5.3 节）：进行中、等待中、酝酿中、已暂停、已归档。
  attention TEXT NOT NULL DEFAULT 'active'
    CHECK (attention IN ('active', 'waiting', 'incubating', 'paused', 'archived')),
  -- 报告超过多少天算过期（04 第 11 节），默认 14。
  freshness_days INTEGER NOT NULL DEFAULT 14 CHECK (freshness_days BETWEEN 1 AND 365),
  -- 核心里程碑 ID 列表（JSON 数组），卡片上只显示这些（02 第 5.4 节）。
  core_milestones TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- 首批登记的六个项目（03 第 8 节）。只在建表时写入一次：以后删改都以数据库为准。
INSERT INTO projects (id, name, sort_order, created_at, updated_at) VALUES
  ('moriium.main', 'Moriium 主站', 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('moriium.gallery', 'Moriium Gallery', 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('mori.meta', 'MoriMeta', 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('enouia.memory', 'Enouia Memory', 40, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('enouia.runtime', 'Enouia Runtime', 50, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('morii.dashboard', 'Moriium Dashboard', 60, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
