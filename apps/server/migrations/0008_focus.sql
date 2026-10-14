-- Only one day is retained. Energy is a choice, not a historical metric.
CREATE TABLE focus_day (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  date TEXT NOT NULL,
  energy TEXT CHECK (energy IN ('high', 'normal', 'low', 'rest')),
  entries TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
