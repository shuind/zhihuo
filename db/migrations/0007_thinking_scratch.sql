CREATE TABLE IF NOT EXISTS thinking_scratch (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  derived_space_id TEXT
);
