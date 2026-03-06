ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS track_direction_hints JSONB NOT NULL DEFAULT '{}'::jsonb;
