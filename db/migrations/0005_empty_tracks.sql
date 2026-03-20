ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS empty_track_ids TEXT[] NOT NULL DEFAULT '{}';
