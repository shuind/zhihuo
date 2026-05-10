ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_scene_signature TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_curated_scene JSONB;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_curated_at TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_star_placements JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_placements_signature TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS star_map_placements_updated_at TEXT;
