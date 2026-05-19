ALTER TABLE thinking_spaces
  ADD COLUMN IF NOT EXISTS last_activity_at TEXT;

WITH activity AS (
  SELECT
    s.id,
    GREATEST(
      s.created_at,
      COALESCE(s.frozen_at, s.created_at),
      COALESCE(MAX(n.created_at) FILTER (WHERE n.state = 'normal'), s.created_at)
    ) AS last_activity_at
  FROM thinking_spaces s
  LEFT JOIN thinking_nodes n ON n.space_id = s.id
  GROUP BY s.id, s.created_at, s.frozen_at
)
UPDATE thinking_spaces s
SET last_activity_at = activity.last_activity_at
FROM activity
WHERE s.id = activity.id
  AND (s.last_activity_at IS NULL OR s.last_activity_at < activity.last_activity_at);

CREATE INDEX IF NOT EXISTS idx_thinking_spaces_user_last_activity
  ON thinking_spaces(user_id, last_activity_at DESC);
