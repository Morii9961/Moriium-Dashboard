-- 暂停原因是 Morii 的安排，不改快照里的阶段（规划 01 F7）。
ALTER TABLE projects ADD COLUMN attention_note TEXT NOT NULL DEFAULT '';
