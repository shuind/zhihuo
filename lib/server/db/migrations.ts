import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PoolClient } from "pg";

import {
  LEGACY_TABLE_SQL,
  MIGRATION_TABLE_SQL,
  MIGRATIONS_DIR
} from "@/lib/server/db/config";
import { normalizeDb, nowIso } from "@/lib/server/db/normalize";
import { logError, logInfo } from "@/lib/server/observability";
import type { DbState } from "@/lib/server/types";

export async function ensureMigrationTables(client: PoolClient) {
  await client.query(MIGRATION_TABLE_SQL);
  await client.query(LEGACY_TABLE_SQL);
}

export async function applyMigrations(client: PoolClient) {
  let entries: string[] = [];
  try {
    entries = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  } catch {
    return;
  }
  for (const version of entries) {
    const existing = await client.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version = $1", [version]);
    if (existing.rows[0]) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, version), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [version, nowIso()]);
      await client.query("COMMIT");
      logInfo("db.migration.applied", { version });
    } catch (error) {
      await client.query("ROLLBACK");
      logError("db.migration.failed", {
        version,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

export async function migrateLegacyBlobIfNeeded(
  client: PoolClient,
  persistDbToPg: (client: PoolClient, db: DbState) => Promise<void>
) {
  const hasLegacy = await client.query<{ exists: string }>("SELECT to_regclass('public.app_state') AS exists");
  if (!hasLegacy.rows[0]?.exists) return;

  const counts = await client.query<{ users: string; doubts: string; spaces: string }>(`
    SELECT
      (SELECT COUNT(*)::text FROM users) AS users,
      (SELECT COUNT(*)::text FROM doubts) AS doubts,
      (SELECT COUNT(*)::text FROM thinking_spaces) AS spaces
  `);
  const summary = counts.rows[0];
  const hasAnyData = Number(summary?.users ?? 0) > 0 || Number(summary?.doubts ?? 0) > 0 || Number(summary?.spaces ?? 0) > 0;
  if (hasAnyData) return;

  const legacy = await client.query<{ state: Partial<DbState> }>("SELECT state FROM app_state WHERE id = 1 LIMIT 1");
  if (!legacy.rows[0]?.state) return;

  const db = normalizeDb(legacy.rows[0].state);
  await persistDbToPg(client, db);
  logInfo("db.legacy.migrated", {
    users: db.users.length,
    doubts: db.doubts.length,
    spaces: db.thinking_spaces.length
  });
}
