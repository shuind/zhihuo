import type { PoolClient } from "pg";

import { DB_LOCK_KEY } from "@/lib/server/db/config";
import { readDbFromJson, updateDbJson } from "@/lib/server/db/json-store";
import { applyMigrations, ensureMigrationTables, migrateLegacyBlobIfNeeded } from "@/lib/server/db/migrations";
import {
  readMonitorTrafficMetrics as readMonitorTrafficMetricsFromPg,
  recordApiMinuteStat as recordApiMinuteStatToPg
} from "@/lib/server/db/monitor-stats";
import { EMPTY_DB } from "@/lib/server/db/normalize";
import { persistDbToPg, readDbFromPg } from "@/lib/server/db/postgres-full";
import { getPool, shouldUsePostgres, withPgRetry } from "@/lib/server/db/postgres-runtime";
import { ALL_USER_SCOPED_TABLES, normalizeScope, tableLockKey, type ScopedTable } from "@/lib/server/db/postgres-scope";
import { persistScopedDbToPg, readScopedDbFromPg } from "@/lib/server/db/postgres-scoped";
import { deleteMarkedThinkingMediaFiles, deleteThinkingMediaAssetFiles } from "@/lib/server/media";
import type { DbState } from "@/lib/server/types";

let pgReadyPromise: Promise<void> | null = null;

export type { MonitorTrafficMetrics } from "@/lib/server/db/monitor-stats";

async function ensurePgReady() {
  const pool = getPool();
  if (!pool) return;
  if (!pgReadyPromise) {
    pgReadyPromise = withPgRetry("ensure-pg-ready", async () => {
      const client = await pool.connect();
      try {
        await ensureMigrationTables(client);
        await applyMigrations(client);
        await migrateLegacyBlobIfNeeded(client, persistDbToPg);
      } finally {
        client.release();
      }
    }).catch((error) => {
      pgReadyPromise = null;
      throw error;
    });
  }
  await pgReadyPromise;
}

export async function readDb(): Promise<DbState> {
  if (shouldUsePostgres()) {
    const pool = getPool();
    if (!pool) return { ...EMPTY_DB };
    await ensurePgReady();
    return withPgRetry("readDb", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [DB_LOCK_KEY]);
        const db = await readDbFromPg(client);
        await client.query("COMMIT");
        return db;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }

  return readDbFromJson();
}

export async function runPgTransaction<T>(
  name: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T | null> {
  if (!shouldUsePostgres()) return null;
  const pool = getPool();
  if (!pool) return null;
  await ensurePgReady();
  return withPgRetry(name, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [DB_LOCK_KEY]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function recordApiMinuteStat(args: { route: string; status: number; responseBytes?: number | null }) {
  await recordApiMinuteStatToPg(args, ensurePgReady);
}

export async function readMonitorTrafficMetrics() {
  return readMonitorTrafficMetricsFromPg(ensurePgReady);
}

export async function pingDb() {
  if (!shouldUsePostgres()) {
    await readDbFromJson();
    return;
  }
  const pool = getPool();
  if (!pool) throw new Error("PostgreSQL pool unavailable");
  await ensurePgReady();
  await withPgRetry("pingDb", async () => {
    await pool.query("SELECT 1");
  });
}

export async function findActiveUserByEmail(email: string): Promise<DbState["users"][number] | null> {
  if (!shouldUsePostgres()) {
    const db = await readDbFromJson();
    return db.users.find((user) => user.email === email && !user.deleted_at) ?? null;
  }
  const pool = getPool();
  if (!pool) return null;
  await ensurePgReady();
  return withPgRetry("findActiveUserByEmail", async () => {
    const { rows } = await pool.query(
      "SELECT id, email, password_hash, created_at, deleted_at FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1",
      [email]
    );
    return (rows[0] as DbState["users"][number] | undefined) ?? null;
  });
}

export async function updateDbScoped(
  scope: ScopedTable[],
  mutator: (db: DbState) => void | Promise<void>
): Promise<DbState> {
  if (!shouldUsePostgres()) {
    return updateDb(mutator);
  }
  const pool = getPool();
  if (!pool) return { ...EMPTY_DB };
  const normalizedScope = normalizeScope([...scope, "user_sync_state", "applied_client_mutations", "sync_operation_log", "sync_repair_items"]);
  if (!normalizedScope.length) return { ...EMPTY_DB };

  await ensurePgReady();
  return withPgRetry("updateDbScoped", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Global lock keeps scoped writes and full writes in one serial lane.
      await client.query("SELECT pg_advisory_xact_lock($1)", [DB_LOCK_KEY]);
      for (const table of normalizedScope) {
        await client.query("SELECT pg_advisory_xact_lock($1)", [tableLockKey(table)]);
      }
      const db = await readScopedDbFromPg(client, normalizedScope);
      await mutator(db);
      await persistScopedDbToPg(client, db, normalizedScope);
      await client.query("COMMIT");
      return db;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function runUserPgTransaction<T>(
  userId: string,
  name: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T | null> {
  if (!shouldUsePostgres()) return null;
  const pool = getPool();
  if (!pool) return null;
  await ensurePgReady();
  return withPgRetry(name, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock_shared($1)", [DB_LOCK_KEY]);
      await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [DB_LOCK_KEY, userId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function readUserDb(userId: string, scope: ScopedTable[] = ALL_USER_SCOPED_TABLES): Promise<DbState> {
  if (!shouldUsePostgres()) return readDb();
  const pool = getPool();
  if (!pool) return { ...EMPTY_DB };
  const normalizedScope = normalizeScope(scope);
  await ensurePgReady();
  return withPgRetry("readUserDb", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const db = await readScopedDbFromPg(client, normalizedScope, userId);
      await client.query("COMMIT");
      return db;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function updateUserDbScoped(
  userId: string,
  scope: ScopedTable[],
  mutator: (db: DbState) => void | Promise<void>
): Promise<DbState> {
  const mediaMayBecomeUnreferenced = scope.some(
    (table) => table === "thinking_nodes" || table === "thinking_spaces" || table === "thinking_space_meta"
  );
  const requestedScope = mediaMayBecomeUnreferenced && !scope.includes("thinking_media_assets")
    ? [...scope, "thinking_media_assets" as const]
    : scope;
  let removedMediaAssetIds: string[] = [];
  if (!shouldUsePostgres()) {
    const db = await updateDb(async (current) => {
      const beforeIds = new Set(
        current.thinking_media_assets.filter((asset) => asset.user_id === userId).map((asset) => asset.id)
      );
      await mutator(current);
      const afterIds = new Set(
        current.thinking_media_assets.filter((asset) => asset.user_id === userId).map((asset) => asset.id)
      );
      removedMediaAssetIds = [...beforeIds].filter((assetId) => !afterIds.has(assetId));
    });
    if (mediaMayBecomeUnreferenced || requestedScope.includes("thinking_media_assets")) {
      await deleteThinkingMediaAssetFiles(userId, removedMediaAssetIds);
      await deleteMarkedThinkingMediaFiles(userId, db.thinking_media_assets);
    }
    return db;
  }
  const pool = getPool();
  if (!pool) return { ...EMPTY_DB };
  const normalizedScope = normalizeScope([
    ...requestedScope,
    "user_sync_state",
    "applied_client_mutations",
    "sync_operation_log",
    "sync_repair_items"
  ]);
  if (!normalizedScope.length) return { ...EMPTY_DB };

  await ensurePgReady();
  const db = await withPgRetry("updateUserDbScoped", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // User writes share the global lane, so rare full imports can still acquire it exclusively.
      await client.query("SELECT pg_advisory_xact_lock_shared($1)", [DB_LOCK_KEY]);
      await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [DB_LOCK_KEY, userId]);
      const db = await readScopedDbFromPg(client, normalizedScope, userId);
      const beforeMediaAssetIds = new Set(db.thinking_media_assets.map((asset) => asset.id));
      await mutator(db);
      const afterMediaAssetIds = new Set(db.thinking_media_assets.map((asset) => asset.id));
      removedMediaAssetIds = [...beforeMediaAssetIds].filter((assetId) => !afterMediaAssetIds.has(assetId));
      await persistScopedDbToPg(client, db, normalizedScope, userId);
      await client.query("COMMIT");
      return db;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  if (normalizedScope.includes("thinking_media_assets")) {
    await deleteThinkingMediaAssetFiles(userId, removedMediaAssetIds);
    await deleteMarkedThinkingMediaFiles(userId, db.thinking_media_assets);
  }
  return db;
}

export async function updateDb(mutator: (db: DbState) => void | Promise<void>): Promise<DbState> {
  if (shouldUsePostgres()) {
    const pool = getPool();
    if (!pool) return { ...EMPTY_DB };
    await ensurePgReady();
    return withPgRetry("updateDb", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [DB_LOCK_KEY]);
        const db = await readDbFromPg(client);
        await mutator(db);
        await persistDbToPg(client, db);
        await client.query("COMMIT");
        return db;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }

  return updateDbJson(mutator);
}
