CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS doubts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS doubt_notes (
  id TEXT PRIMARY KEY,
  doubt_id TEXT NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thinking_spaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_question_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'hidden')),
  created_at TEXT NOT NULL,
  frozen_at TEXT,
  source_time_doubt_id TEXT
);

CREATE TABLE IF NOT EXISTS thinking_nodes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES thinking_spaces(id) ON DELETE CASCADE,
  parent_node_id TEXT,
  raw_question_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_suggested BOOLEAN NOT NULL DEFAULT false,
  state TEXT NOT NULL CHECK (state IN ('normal', 'hidden')),
  dimension TEXT NOT NULL CHECK (dimension IN ('definition', 'resource', 'risk', 'value', 'path', 'evidence'))
);

CREATE TABLE IF NOT EXISTS thinking_inbox (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES thinking_spaces(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thinking_space_meta (
  space_id TEXT PRIMARY KEY REFERENCES thinking_spaces(id) ON DELETE CASCADE,
  user_freeze_note TEXT,
  export_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doubts_user_created_at ON doubts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thinking_spaces_user_created_at ON thinking_spaces(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thinking_nodes_space_order ON thinking_nodes(space_id, order_index);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at DESC);
