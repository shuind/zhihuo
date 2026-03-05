ALTER TABLE thinking_nodes
  ADD COLUMN IF NOT EXISTS note_text TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS background_text TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS background_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS suggestion_decay INTEGER NOT NULL DEFAULT 0;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS last_track_id TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS last_organized_order INTEGER NOT NULL DEFAULT -1;
