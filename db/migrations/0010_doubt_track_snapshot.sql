ALTER TABLE doubts
ADD COLUMN IF NOT EXISTS first_node_preview TEXT;

ALTER TABLE doubts
ADD COLUMN IF NOT EXISTS last_node_preview TEXT;
