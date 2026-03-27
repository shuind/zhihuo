CREATE TABLE IF NOT EXISTS api_request_minute_stats (
  minute_key TEXT NOT NULL,
  date_key TEXT NOT NULL,
  route TEXT NOT NULL,
  status_class TEXT NOT NULL CHECK (status_class IN ('2xx', '4xx', '5xx')),
  request_count INTEGER NOT NULL DEFAULT 0,
  response_bytes_sum BIGINT NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (minute_key, route, status_class)
);

CREATE INDEX IF NOT EXISTS idx_api_request_minute_stats_date
  ON api_request_minute_stats (date_key);

CREATE INDEX IF NOT EXISTS idx_api_request_minute_stats_minute
  ON api_request_minute_stats (minute_key);

CREATE INDEX IF NOT EXISTS idx_api_request_minute_stats_route
  ON api_request_minute_stats (route);
