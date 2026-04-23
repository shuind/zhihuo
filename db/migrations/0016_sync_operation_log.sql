ALTER TABLE user_sync_state
  ADD COLUMN IF NOT EXISTS last_sequence BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sync_operation_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  client_order BIGINT NOT NULL DEFAULT 0,
  client_updated_at TEXT,
  op TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_revision INTEGER NOT NULL DEFAULT 0,
  server_sequence BIGINT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_operation_log_user_client_mutation
  ON sync_operation_log(user_id, client_mutation_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_operation_log_user_sequence
  ON sync_operation_log(user_id, server_sequence);

CREATE TABLE IF NOT EXISTS sync_repair_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  destination_class TEXT,
  original_target_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_repair_items_user_created
  ON sync_repair_items(user_id, created_at DESC);
