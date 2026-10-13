ALTER TABLE projects ADD COLUMN name_ja TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN name_en TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'research' CHECK(category IN ('research','website','creation','life','learning','exploration'));
ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('focus','normal','later'));
ALTER TABLE projects ADD COLUMN agent_assignments TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN repository_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN website_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN working_on TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN next_step TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN key_date TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN key_date_label TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN manual_lang TEXT NOT NULL DEFAULT 'zh-Hans' CHECK(manual_lang IN ('zh-Hans','ja','en'));
UPDATE projects SET category='website' WHERE id IN ('moriium.main','moriium.gallery');
CREATE TABLE manual_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  lang TEXT NOT NULL CHECK(lang IN ('zh-Hans','ja','en')),
  status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','blocked','done','unknown')),
  target_date TEXT,
  sort_order INTEGER NOT NULL,
  at TEXT NOT NULL
) STRICT;
