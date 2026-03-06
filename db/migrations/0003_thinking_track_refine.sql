ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS parking_track_id TEXT;

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS milestone_node_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE thinking_space_meta
  ADD COLUMN IF NOT EXISTS track_direction_hints JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS thinking_node_links (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES thinking_spaces(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES thinking_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES thinking_nodes(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('related')),
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_thinking_node_links_pair
  ON thinking_node_links(space_id, source_node_id, target_node_id, link_type);

CREATE INDEX IF NOT EXISTS idx_thinking_node_links_source
  ON thinking_node_links(source_node_id);

CREATE INDEX IF NOT EXISTS idx_thinking_node_links_target
  ON thinking_node_links(target_node_id);
