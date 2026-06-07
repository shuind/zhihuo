import path from "node:path";

import type { DimensionKey } from "@/lib/server/types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_FILE = path.join(DATA_DIR, "zhihuo-db.json");
export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export const LEGACY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state JSONB NOT NULL
)
`;

export const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)
`;

export const DB_LOCK_KEY = 745101;
export const HOT_TABLE_LOCK_SEED = 991337;

export const MONITOR_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_MONITOR_RESPONSE_BYTES = Math.max(
  1,
  Number.parseInt(process.env.MONITOR_DEFAULT_RESPONSE_BYTES ?? "12288", 10) || 12288
);
export const MONITOR_RETENTION_DAYS = Math.max(
  1,
  Number.parseInt(process.env.MONITOR_TRAFFIC_RETENTION_DAYS ?? "7", 10) || 7
);
export const MONITOR_PRUNE_INTERVAL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.MONITOR_TRAFFIC_PRUNE_INTERVAL_MS ?? "1800000", 10) || 1_800_000
);

export const THINKING_DIMENSIONS: ReadonlySet<DimensionKey> = new Set([
  "definition",
  "resource",
  "risk",
  "value",
  "path",
  "evidence"
]);
