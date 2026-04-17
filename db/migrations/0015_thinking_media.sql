ALTER TABLE thinking_nodes
  ADD COLUMN IF NOT EXISTS image_asset_id TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS background_asset_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS background_selected_asset_id TEXT;

CREATE TABLE IF NOT EXISTS thinking_media_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  uploaded_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_thinking_nodes_image_asset_id
  ON thinking_nodes(image_asset_id);

CREATE INDEX IF NOT EXISTS idx_thinking_media_assets_user_created_at
  ON thinking_media_assets(user_id, created_at DESC);
