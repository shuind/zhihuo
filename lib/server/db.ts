import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { logError, logInfo, logWarn } from "@/lib/server/observability";
import type { DbState } from "@/lib/server/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "zhihuo-db.json");
const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const LEGACY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state JSONB NOT NULL
)
`;
const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)
`;
const DB_LOCK_KEY = 745101;

const EMPTY_DB: DbState = {
  doubts: [],
  doubt_notes: [],
  thinking_spaces: [],
  thinking_nodes: [],
  thinking_inbox: [],
  thinking_space_meta: [],
  thinking_node_links: [],
  users: [],
  audit_logs: []
};

let writeQueue: Promise<void> = Promise.resolve();
let pgPool: Pool | null = null;
let pgReadyPromise: Promise<void> | null = null;

function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return pgPool;
}

function normalizeDb(input: Partial<DbState> | null | undefined): DbState {
  return {
    doubts: Array.isArray(input?.doubts) ? input.doubts : [],
    doubt_notes: Array.isArray(input?.doubt_notes) ? input.doubt_notes : [],
    thinking_spaces: Array.isArray(input?.thinking_spaces) ? input.thinking_spaces : [],
    thinking_nodes: Array.isArray(input?.thinking_nodes)
      ? input.thinking_nodes.map((row) => ({
          ...row,
          note_text: typeof row.note_text === "string" ? row.note_text : null
        }))
      : [],
    thinking_inbox: Array.isArray(input?.thinking_inbox) ? input.thinking_inbox : [],
    thinking_space_meta: Array.isArray(input?.thinking_space_meta)
      ? input.thinking_space_meta.map((row) => ({
          ...row,
          background_text: typeof row.background_text === "string" ? row.background_text : null,
          background_version: Number.isFinite(row.background_version) ? Number(row.background_version) : 0,
          suggestion_decay: Number.isFinite(row.suggestion_decay) ? Number(row.suggestion_decay) : 0,
          last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
          last_organized_order: Number.isFinite(row.last_organized_order) ? Number(row.last_organized_order) : -1,
          parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
          milestone_node_ids: Array.isArray(row.milestone_node_ids)
            ? row.milestone_node_ids.filter((id) => typeof id === "string")
            : [],
          track_direction_hints:
            row.track_direction_hints && typeof row.track_direction_hints === "object" && !Array.isArray(row.track_direction_hints)
              ? Object.fromEntries(
                  Object.entries(row.track_direction_hints).filter(
                    ([trackId, hint]) =>
                      typeof trackId === "string" &&
                      (hint === null ||
                        hint === "hypothesis" ||
                        hint === "memory" ||
                        hint === "counterpoint" ||
                        hint === "worry" ||
                        hint === "constraint" ||
                        hint === "aside")
                  )
                )
              : {}
        }))
      : [],
    thinking_node_links: Array.isArray(input?.thinking_node_links)
      ? input.thinking_node_links
          .map((row) => ({
            ...row,
            link_type: "related" as const,
            score: Number.isFinite(row.score) ? Number(row.score) : 0
          }))
          .filter(
            (row) =>
              typeof row.id === "string" &&
              typeof row.space_id === "string" &&
              typeof row.source_node_id === "string" &&
              typeof row.target_node_id === "string"
          )
      : [],
    users: Array.isArray(input?.users) ? input.users : [],
    audit_logs: Array.isArray(input?.audit_logs) ? input.audit_logs : []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function isRetryablePgError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "40001" || code === "40P01" || code === "53300" || code === "57P01";
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withPgRetry<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const maxAttempts = Math.max(1, Number.parseInt(process.env.DB_RETRY_ATTEMPTS ?? "3", 10) || 3);
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const canRetry = isRetryablePgError(error) && attempt < maxAttempts;
      logWarn("db.retry", {
        op: name,
        attempt,
        maxAttempts,
        retrying: canRetry,
        error: error instanceof Error ? error.message : String(error)
      });
      if (!canRetry) throw error;
      await sleep(attempt * 50);
    }
  }
  throw new Error(`${name} failed after retries`);
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensurePgReady() {
  const pool = getPool();
  if (!pool) return;
  if (!pgReadyPromise) {
    pgReadyPromise = withPgRetry("ensure-pg-ready", async () => {
      const client = await pool.connect();
      try {
        await client.query(MIGRATION_TABLE_SQL);
        await client.query(LEGACY_TABLE_SQL);
        await applyMigrations(client);
        await migrateLegacyBlobIfNeeded(client);
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

async function applyMigrations(client: PoolClient) {
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

async function migrateLegacyBlobIfNeeded(client: PoolClient) {
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

async function readDbFromPg(client: PoolClient): Promise<DbState> {
  const [users, doubts, doubtNotes, spaces, nodes, inbox, spaceMeta, nodeLinks, auditLogs] = await Promise.all([
    client.query("SELECT id, email, password_hash, created_at, deleted_at FROM users"),
    client.query("SELECT id, user_id, raw_text, created_at, archived_at, deleted_at FROM doubts"),
    client.query("SELECT id, doubt_id, note_text, created_at FROM doubt_notes"),
    client.query(
      "SELECT id, user_id, root_question_text, status, created_at, frozen_at, source_time_doubt_id FROM thinking_spaces"
    ),
    client.query(
      "SELECT id, space_id, parent_node_id, raw_question_text, note_text, created_at, order_index, is_suggested, state, dimension FROM thinking_nodes"
    ),
    client.query("SELECT id, space_id, raw_text, created_at FROM thinking_inbox"),
    client.query(
      "SELECT space_id, user_freeze_note, export_version, background_text, background_version, suggestion_decay, last_track_id, last_organized_order, parking_track_id, milestone_node_ids, track_direction_hints FROM thinking_space_meta"
    ),
    client.query(
      "SELECT id, space_id, source_node_id, target_node_id, link_type, score, created_at FROM thinking_node_links"
    ),
    client.query("SELECT id, user_id, action, target_type, target_id, detail, created_at FROM audit_logs")
  ]);

  return normalizeDb({
    users: users.rows as DbState["users"],
    doubts: doubts.rows as DbState["doubts"],
    doubt_notes: doubtNotes.rows as DbState["doubt_notes"],
    thinking_spaces: spaces.rows as DbState["thinking_spaces"],
    thinking_nodes: nodes.rows.map((row) => ({
      ...row,
      order_index: Number(row.order_index),
      is_suggested: Boolean(row.is_suggested),
      note_text: typeof row.note_text === "string" ? row.note_text : null
    })) as DbState["thinking_nodes"],
    thinking_inbox: inbox.rows as DbState["thinking_inbox"],
    thinking_space_meta: spaceMeta.rows.map((row) => ({
      ...row,
      export_version: Number(row.export_version),
      background_text: typeof row.background_text === "string" ? row.background_text : null,
      background_version: Number(row.background_version ?? 0),
      suggestion_decay: Number(row.suggestion_decay ?? 0),
      last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
      last_organized_order: Number(row.last_organized_order ?? -1),
      parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
      milestone_node_ids: Array.isArray(row.milestone_node_ids)
        ? row.milestone_node_ids.filter((id: unknown) => typeof id === "string")
        : [],
      track_direction_hints:
        row.track_direction_hints && typeof row.track_direction_hints === "object" && !Array.isArray(row.track_direction_hints)
          ? Object.fromEntries(
              Object.entries(row.track_direction_hints).filter(
                ([trackId, hint]) =>
                  typeof trackId === "string" &&
                  (hint === null ||
                    hint === "hypothesis" ||
                    hint === "memory" ||
                    hint === "counterpoint" ||
                    hint === "worry" ||
                    hint === "constraint" ||
                    hint === "aside")
              )
            )
          : {}
    })) as DbState["thinking_space_meta"],
    thinking_node_links: nodeLinks.rows.map((row) => ({
      ...row,
      link_type: "related" as const,
      score: Number(row.score ?? 0)
    })) as DbState["thinking_node_links"],
    audit_logs: auditLogs.rows as DbState["audit_logs"]
  });
}

async function replaceTable(client: PoolClient, table: string, columns: string[], rows: unknown[][]) {
  await client.query(`DELETE FROM ${table}`);
  if (!rows.length) return;

  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowPlaceholders: string[] = [];
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      params.push(row[columnIndex] ?? null);
      rowPlaceholders.push(`$${params.length}`);
    }
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  }
  await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`, params);
}

async function persistDbToPg(client: PoolClient, db: DbState) {
  await replaceTable(
    client,
    "users",
    ["id", "email", "password_hash", "created_at", "deleted_at"],
    db.users.map((row) => [row.id, row.email, row.password_hash, row.created_at, row.deleted_at])
  );
  await replaceTable(
    client,
    "doubts",
    ["id", "user_id", "raw_text", "created_at", "archived_at", "deleted_at"],
    db.doubts.map((row) => [row.id, row.user_id, row.raw_text, row.created_at, row.archived_at, row.deleted_at])
  );
  await replaceTable(
    client,
    "doubt_notes",
    ["id", "doubt_id", "note_text", "created_at"],
    db.doubt_notes.map((row) => [row.id, row.doubt_id, row.note_text, row.created_at])
  );
  await replaceTable(
    client,
    "thinking_spaces",
    ["id", "user_id", "root_question_text", "status", "created_at", "frozen_at", "source_time_doubt_id"],
    db.thinking_spaces.map((row) => [
      row.id,
      row.user_id,
      row.root_question_text,
      row.status,
      row.created_at,
      row.frozen_at,
      row.source_time_doubt_id
    ])
  );
  await replaceTable(
    client,
    "thinking_space_meta",
    [
      "space_id",
      "user_freeze_note",
      "export_version",
      "background_text",
      "background_version",
      "suggestion_decay",
      "last_track_id",
      "last_organized_order",
      "parking_track_id",
      "milestone_node_ids",
      "track_direction_hints"
    ],
    db.thinking_space_meta.map((row) => [
      row.space_id,
      row.user_freeze_note,
      row.export_version,
      row.background_text ?? null,
      row.background_version ?? 0,
      row.suggestion_decay ?? 0,
      row.last_track_id ?? null,
      row.last_organized_order ?? -1,
      row.parking_track_id ?? null,
      row.milestone_node_ids ?? [],
      row.track_direction_hints ?? {}
    ])
  );
  await replaceTable(
    client,
    "thinking_nodes",
    ["id", "space_id", "parent_node_id", "raw_question_text", "note_text", "created_at", "order_index", "is_suggested", "state", "dimension"],
    db.thinking_nodes.map((row) => [
      row.id,
      row.space_id,
      row.parent_node_id,
      row.raw_question_text,
      row.note_text ?? null,
      row.created_at,
      row.order_index,
      row.is_suggested,
      row.state,
      row.dimension
    ])
  );
  await replaceTable(
    client,
    "thinking_inbox",
    ["id", "space_id", "raw_text", "created_at"],
    db.thinking_inbox.map((row) => [row.id, row.space_id, row.raw_text, row.created_at])
  );
  await replaceTable(
    client,
    "thinking_node_links",
    ["id", "space_id", "source_node_id", "target_node_id", "link_type", "score", "created_at"],
    db.thinking_node_links.map((row) => [
      row.id,
      row.space_id,
      row.source_node_id,
      row.target_node_id,
      row.link_type,
      row.score,
      row.created_at
    ])
  );
  await replaceTable(
    client,
    "audit_logs",
    ["id", "user_id", "action", "target_type", "target_id", "detail", "created_at"],
    db.audit_logs.map((row) => [row.id, row.user_id, row.action, row.target_type, row.target_id, row.detail, row.created_at])
  );
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

  await ensureDataDir();
  try {
    const raw = await readFile(DB_FILE, "utf8");
    return normalizeDb(JSON.parse(raw) as Partial<DbState>);
  } catch {
    return { ...EMPTY_DB };
  }
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

  let nextState: DbState = { ...EMPTY_DB };
  writeQueue = writeQueue.then(async () => {
    const db = await readDb();
    await mutator(db);
    await ensureDataDir();
    await writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    nextState = db;
  });
  await writeQueue;
  return nextState;
}
