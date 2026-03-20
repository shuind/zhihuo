ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS pending_track_id TEXT;
