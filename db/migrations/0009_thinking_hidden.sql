UPDATE thinking_spaces
SET status = 'hidden'
WHERE status IN ('frozen', 'archived');

ALTER TABLE thinking_spaces
DROP CONSTRAINT IF EXISTS thinking_spaces_status_check;

ALTER TABLE thinking_spaces
ADD CONSTRAINT thinking_spaces_status_check
CHECK (status IN ('active', 'hidden'));
