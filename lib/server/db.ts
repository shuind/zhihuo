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
import { normalizeScope, tableLockKey, type ScopedTable } from "@/lib/server/db/postgres-scope";
import { persistScopedDbToPg, readScopedDbFromPg } from "@/lib/server/db/postgres-scoped";
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
