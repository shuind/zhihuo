import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { logError, logInfo, logWarn } from "@/lib/server/observability";
import type { DbState, DimensionKey } from "@/lib/server/types";

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
const HOT_TABLE_LOCK_SEED = 991337;
const MONITOR_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_MONITOR_RESPONSE_BYTES = Math.max(
  1,
  Number.parseInt(process.env.MONITOR_DEFAULT_RESPONSE_BYTES ?? "12288", 10) || 12288
);
const THINKING_DIMENSIONS: ReadonlySet<DimensionKey> = new Set(["definition", "resource", "risk", "value", "path", "evidence"]);

function normalizeDimension(input: unknown): DimensionKey {
  return THINKING_DIMENSIONS.has(input as DimensionKey) ? (input as DimensionKey) : "definition";
}

const EMPTY_DB: DbState = {
  doubts: [],
  doubt_notes: [],
  thinking_spaces: [],
  thinking_nodes: [],
  thinking_inbox: [],
  thinking_scratch: [],
  thinking_space_meta: [],
  thinking_node_links: [],
  email_verification_codes: [],
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
    doubts: Array.isArray(input?.doubts)
      ? input.doubts.map((row) => ({
          ...row,
          first_node_preview: typeof row.first_node_preview === "string" ? row.first_node_preview : null,
          last_node_preview: typeof row.last_node_preview === "string" ? row.last_node_preview : null
        }))
      : [],
    doubt_notes: Array.isArray(input?.doubt_notes) ? input.doubt_notes : [],
    thinking_spaces: Array.isArray(input?.thinking_spaces) ? input.thinking_spaces : [],
    thinking_nodes: Array.isArray(input?.thinking_nodes)
      ? input.thinking_nodes.map((row) => ({
          ...row,
          note_text: typeof row.note_text === "string" ? row.note_text : null,
          answer_text: typeof row.answer_text === "string" ? row.answer_text : null,
          order_index: Number.isFinite(row.order_index) ? Number(row.order_index) : 0,
          is_suggested: row.is_suggested === true,
          state: row.state === "hidden" ? "hidden" : "normal",
          dimension: normalizeDimension(row.dimension)
        }))
      : [],
    thinking_inbox: Array.isArray(input?.thinking_inbox) ? input.thinking_inbox : [],
    thinking_scratch: Array.isArray(input?.thinking_scratch)
      ? input.thinking_scratch.map((row) => ({
          ...row,
          updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso(),
          archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
          deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
          derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
          fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
        }))
      : [],
    thinking_space_meta: Array.isArray(input?.thinking_space_meta)
      ? input.thinking_space_meta.map((row) => ({
          ...row,
          background_text: typeof row.background_text === "string" ? row.background_text : null,
          background_version: Number.isFinite(row.background_version) ? Number(row.background_version) : 0,
          suggestion_decay: Number.isFinite(row.suggestion_decay) ? Number(row.suggestion_decay) : 0,
          last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
          last_organized_order: Number.isFinite(row.last_organized_order) ? Number(row.last_organized_order) : -1,
          parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
          pending_track_id: typeof row.pending_track_id === "string" ? row.pending_track_id : null,
          empty_track_ids: Array.isArray(row.empty_track_ids) ? row.empty_track_ids.filter((id) => typeof id === "string") : [],
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
    email_verification_codes: Array.isArray(input?.email_verification_codes)
      ? input.email_verification_codes.map((row) => ({
          ...row,
          consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
          send_count: Number.isFinite(row.send_count) ? Number(row.send_count) : 1
        }))
      : [],
    users: Array.isArray(input?.users) ? input.users : [],
    audit_logs: Array.isArray(input?.audit_logs) ? input.audit_logs : []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function toDateKeyInTimeZone(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function recentDateKeys(days: number) {
  const today = toDateKeyInTimeZone(Date.now(), MONITOR_TIME_ZONE);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(shiftDateKey(today, -i));
  return keys;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
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
  const [users, doubts, doubtNotes, spaces, nodes, inbox, scratch, spaceMeta, nodeLinks, emailVerificationCodes, auditLogs] = await Promise.all([
    client.query("SELECT id, email, password_hash, created_at, deleted_at FROM users"),
    client.query("SELECT id, user_id, raw_text, first_node_preview, last_node_preview, created_at, archived_at, deleted_at FROM doubts"),
    client.query("SELECT id, doubt_id, note_text, created_at FROM doubt_notes"),
    client.query(
      "SELECT id, user_id, root_question_text, status, created_at, frozen_at, source_time_doubt_id FROM thinking_spaces"
    ),
    client.query(
      "SELECT id, space_id, parent_node_id, raw_question_text, note_text, created_at, order_index, is_suggested, state, dimension FROM thinking_nodes"
    ),
    client.query("SELECT id, space_id, raw_text, created_at FROM thinking_inbox"),
    client.query("SELECT id, user_id, raw_text, created_at, updated_at, archived_at, deleted_at, derived_space_id, fed_time_doubt_id FROM thinking_scratch"),
    client.query(
      "SELECT space_id, user_freeze_note, export_version, background_text, background_version, suggestion_decay, last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids, milestone_node_ids, track_direction_hints FROM thinking_space_meta"
    ),
    client.query(
      "SELECT id, space_id, source_node_id, target_node_id, link_type, score, created_at FROM thinking_node_links"
    ),
    client.query(
      "SELECT id, email, purpose, code_hash, expires_at, consumed_at, created_at, last_sent_at, send_count FROM email_verification_codes"
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
    thinking_scratch: scratch.rows.map((row) => ({
      ...row,
      archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
      deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
      derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
      fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
    })) as DbState["thinking_scratch"],
    thinking_space_meta: spaceMeta.rows.map((row) => ({
      ...row,
      export_version: Number(row.export_version),
      background_text: typeof row.background_text === "string" ? row.background_text : null,
      background_version: Number(row.background_version ?? 0),
      suggestion_decay: Number(row.suggestion_decay ?? 0),
      last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
      last_organized_order: Number(row.last_organized_order ?? -1),
      parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
      pending_track_id: typeof row.pending_track_id === "string" ? row.pending_track_id : null,
      empty_track_ids: Array.isArray(row.empty_track_ids) ? row.empty_track_ids.filter((id: unknown) => typeof id === "string") : [],
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
    email_verification_codes: emailVerificationCodes.rows.map((row) => ({
      ...row,
      purpose: "register" as const,
      consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
      send_count: Number(row.send_count ?? 1)
    })) as DbState["email_verification_codes"],
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

async function upsertTable(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumns: string[]
) {
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

  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const updateClause =
    updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`
      : "DO NOTHING";

  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT (${conflictColumns.join(", ")}) ${updateClause}`,
    params
  );
}

async function deleteRowsNotInSet(client: PoolClient, table: string, idColumn: string, ids: string[]) {
  if (!ids.length) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  await client.query(`DELETE FROM ${table} WHERE NOT (${idColumn} = ANY($1::text[]))`, [ids]);
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
    ["id", "user_id", "raw_text", "first_node_preview", "last_node_preview", "created_at", "archived_at", "deleted_at"],
    db.doubts.map((row) => [
      row.id,
      row.user_id,
      row.raw_text,
      row.first_node_preview ?? null,
      row.last_node_preview ?? null,
      row.created_at,
      row.archived_at,
      row.deleted_at
    ])
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
      "pending_track_id",
      "empty_track_ids",
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
      row.pending_track_id ?? null,
      row.empty_track_ids ?? [],
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
    "thinking_scratch",
    ["id", "user_id", "raw_text", "created_at", "updated_at", "archived_at", "deleted_at", "derived_space_id", "fed_time_doubt_id"],
    db.thinking_scratch.map((row) => [
      row.id,
      row.user_id,
      row.raw_text,
      row.created_at,
      row.updated_at,
      row.archived_at,
      row.deleted_at,
      row.derived_space_id,
      row.fed_time_doubt_id
    ])
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
    "email_verification_codes",
    ["id", "email", "purpose", "code_hash", "expires_at", "consumed_at", "created_at", "last_sent_at", "send_count"],
    db.email_verification_codes.map((row) => [
      row.id,
      row.email,
      row.purpose,
      row.code_hash,
      row.expires_at,
      row.consumed_at,
      row.created_at,
      row.last_sent_at,
      row.send_count
    ])
  );
  await replaceTable(
    client,
    "audit_logs",
    ["id", "user_id", "action", "target_type", "target_id", "detail", "created_at"],
    db.audit_logs.map((row) => [row.id, row.user_id, row.action, row.target_type, row.target_id, row.detail, row.created_at])
  );
}

type ScopedTable =
  | "doubts"
  | "doubt_notes"
  | "thinking_spaces"
  | "thinking_space_meta"
  | "thinking_nodes"
  | "thinking_inbox"
  | "thinking_scratch"
  | "thinking_node_links"
  | "audit_logs";

function createEmptyDbState(): DbState {
  return {
    doubts: [],
    doubt_notes: [],
    thinking_spaces: [],
    thinking_nodes: [],
    thinking_inbox: [],
    thinking_scratch: [],
    thinking_space_meta: [],
    thinking_node_links: [],
    email_verification_codes: [],
    users: [],
    audit_logs: []
  };
}

function normalizeScope(scope: ScopedTable[]) {
  return Array.from(new Set(scope)).sort();
}

function tableLockKey(table: ScopedTable) {
  let hash = HOT_TABLE_LOCK_SEED;
  for (let i = 0; i < table.length; i += 1) {
    hash = (hash * 33 + table.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function readScopedDbFromPg(client: PoolClient, scope: ScopedTable[]): Promise<DbState> {
  const state = createEmptyDbState();
  for (const table of scope) {
    if (table === "doubts") {
      const { rows } = await client.query(
        "SELECT id, user_id, raw_text, first_node_preview, last_node_preview, created_at, archived_at, deleted_at FROM doubts"
      );
      state.doubts = rows as DbState["doubts"];
      continue;
    }
    if (table === "doubt_notes") {
      const { rows } = await client.query("SELECT id, doubt_id, note_text, created_at FROM doubt_notes");
      state.doubt_notes = rows as DbState["doubt_notes"];
      continue;
    }
    if (table === "thinking_spaces") {
      const { rows } = await client.query(
        "SELECT id, user_id, root_question_text, status, created_at, frozen_at, source_time_doubt_id FROM thinking_spaces"
      );
      state.thinking_spaces = rows as DbState["thinking_spaces"];
      continue;
    }
    if (table === "thinking_space_meta") {
      const { rows } = await client.query(
        "SELECT space_id, user_freeze_note, export_version, background_text, background_version, suggestion_decay, last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids, milestone_node_ids, track_direction_hints FROM thinking_space_meta"
      );
      state.thinking_space_meta = rows.map((row) => ({
        ...row,
        export_version: Number(row.export_version),
        background_text: typeof row.background_text === "string" ? row.background_text : null,
        background_version: Number(row.background_version ?? 0),
        suggestion_decay: Number(row.suggestion_decay ?? 0),
        last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
        last_organized_order: Number(row.last_organized_order ?? -1),
        parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
        pending_track_id: typeof row.pending_track_id === "string" ? row.pending_track_id : null,
        empty_track_ids: Array.isArray(row.empty_track_ids) ? row.empty_track_ids.filter((id: unknown) => typeof id === "string") : [],
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
      })) as DbState["thinking_space_meta"];
      continue;
    }
    if (table === "thinking_nodes") {
      const { rows } = await client.query(
        "SELECT id, space_id, parent_node_id, raw_question_text, note_text, created_at, order_index, is_suggested, state, dimension FROM thinking_nodes"
      );
      state.thinking_nodes = rows.map((row) => ({
        ...row,
        order_index: Number(row.order_index),
        is_suggested: Boolean(row.is_suggested),
        note_text: typeof row.note_text === "string" ? row.note_text : null
      })) as DbState["thinking_nodes"];
      continue;
    }
    if (table === "thinking_inbox") {
      const { rows } = await client.query("SELECT id, space_id, raw_text, created_at FROM thinking_inbox");
      state.thinking_inbox = rows as DbState["thinking_inbox"];
      continue;
    }
    if (table === "thinking_scratch") {
      const { rows } = await client.query(
        "SELECT id, user_id, raw_text, created_at, updated_at, archived_at, deleted_at, derived_space_id, fed_time_doubt_id FROM thinking_scratch"
      );
      state.thinking_scratch = rows.map((row) => ({
        ...row,
        archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
        deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
        derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
        fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
      })) as DbState["thinking_scratch"];
      continue;
    }
    if (table === "thinking_node_links") {
      const { rows } = await client.query(
        "SELECT id, space_id, source_node_id, target_node_id, link_type, score, created_at FROM thinking_node_links"
      );
      state.thinking_node_links = rows.map((row) => ({
        ...row,
        link_type: "related" as const,
        score: Number(row.score ?? 0)
      })) as DbState["thinking_node_links"];
      continue;
    }
    if (table === "audit_logs") {
      const { rows } = await client.query("SELECT id, user_id, action, target_type, target_id, detail, created_at FROM audit_logs");
      state.audit_logs = rows as DbState["audit_logs"];
    }
  }
  return normalizeDb(state);
}

async function persistScopedDbToPg(client: PoolClient, db: DbState, scope: ScopedTable[]) {
  type ScopedSyncPlan = {
    table: string;
    idColumn: string;
    columns: string[];
    conflictColumns: string[];
    rows: unknown[][];
  };

  const planByScope = new Map<ScopedTable, ScopedSyncPlan>();

  for (const item of scope) {
    if (item === "doubts") {
      planByScope.set(item, {
        table: "doubts",
        idColumn: "id",
        columns: ["id", "user_id", "raw_text", "first_node_preview", "last_node_preview", "created_at", "archived_at", "deleted_at"],
        conflictColumns: ["id"],
        rows: db.doubts.map((row) => [
          row.id,
          row.user_id,
          row.raw_text,
          row.first_node_preview ?? null,
          row.last_node_preview ?? null,
          row.created_at,
          row.archived_at,
          row.deleted_at
        ])
      });
      continue;
    }
    if (item === "doubt_notes") {
      planByScope.set(item, {
        table: "doubt_notes",
        idColumn: "id",
        columns: ["id", "doubt_id", "note_text", "created_at"],
        conflictColumns: ["id"],
        rows: db.doubt_notes.map((row) => [row.id, row.doubt_id, row.note_text, row.created_at])
      });
      continue;
    }
    if (item === "thinking_spaces") {
      planByScope.set(item, {
        table: "thinking_spaces",
        idColumn: "id",
        columns: ["id", "user_id", "root_question_text", "status", "created_at", "frozen_at", "source_time_doubt_id"],
        conflictColumns: ["id"],
        rows: db.thinking_spaces.map((row) => [
          row.id,
          row.user_id,
          row.root_question_text,
          row.status,
          row.created_at,
          row.frozen_at,
          row.source_time_doubt_id
        ])
      });
      continue;
    }
    if (item === "thinking_space_meta") {
      planByScope.set(item, {
        table: "thinking_space_meta",
        idColumn: "space_id",
        columns: [
          "space_id",
          "user_freeze_note",
          "export_version",
          "background_text",
          "background_version",
          "suggestion_decay",
          "last_track_id",
          "last_organized_order",
          "parking_track_id",
          "pending_track_id",
          "empty_track_ids",
          "milestone_node_ids",
          "track_direction_hints"
        ],
        conflictColumns: ["space_id"],
        rows: db.thinking_space_meta.map((row) => [
          row.space_id,
          row.user_freeze_note,
          row.export_version,
          row.background_text ?? null,
          row.background_version ?? 0,
          row.suggestion_decay ?? 0,
          row.last_track_id ?? null,
          row.last_organized_order ?? -1,
          row.parking_track_id ?? null,
          row.pending_track_id ?? null,
          row.empty_track_ids ?? [],
          row.milestone_node_ids ?? [],
          row.track_direction_hints ?? {}
        ])
      });
      continue;
    }
    if (item === "thinking_nodes") {
      planByScope.set(item, {
        table: "thinking_nodes",
        idColumn: "id",
        columns: ["id", "space_id", "parent_node_id", "raw_question_text", "note_text", "created_at", "order_index", "is_suggested", "state", "dimension"],
        conflictColumns: ["id"],
        rows: db.thinking_nodes.map((row) => [
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
      });
      continue;
    }
    if (item === "thinking_inbox") {
      planByScope.set(item, {
        table: "thinking_inbox",
        idColumn: "id",
        columns: ["id", "space_id", "raw_text", "created_at"],
        conflictColumns: ["id"],
        rows: db.thinking_inbox.map((row) => [row.id, row.space_id, row.raw_text, row.created_at])
      });
      continue;
    }
    if (item === "thinking_scratch") {
      planByScope.set(item, {
        table: "thinking_scratch",
        idColumn: "id",
        columns: ["id", "user_id", "raw_text", "created_at", "updated_at", "archived_at", "deleted_at", "derived_space_id", "fed_time_doubt_id"],
        conflictColumns: ["id"],
        rows: db.thinking_scratch.map((row) => [
          row.id,
          row.user_id,
          row.raw_text,
          row.created_at,
          row.updated_at,
          row.archived_at,
          row.deleted_at,
          row.derived_space_id,
          row.fed_time_doubt_id
        ])
      });
      continue;
    }
    if (item === "thinking_node_links") {
      planByScope.set(item, {
        table: "thinking_node_links",
        idColumn: "id",
        columns: ["id", "space_id", "source_node_id", "target_node_id", "link_type", "score", "created_at"],
        conflictColumns: ["id"],
        rows: db.thinking_node_links.map((row) => [
          row.id,
          row.space_id,
          row.source_node_id,
          row.target_node_id,
          row.link_type,
          row.score,
          row.created_at
        ])
      });
      continue;
    }
    if (item === "audit_logs") {
      planByScope.set(item, {
        table: "audit_logs",
        idColumn: "id",
        columns: ["id", "user_id", "action", "target_type", "target_id", "detail", "created_at"],
        conflictColumns: ["id"],
        rows: db.audit_logs.map((row) => [row.id, row.user_id, row.action, row.target_type, row.target_id, row.detail, row.created_at])
      });
    }
  }

  const upsertOrder: ScopedTable[] = [
    "doubts",
    "thinking_spaces",
    "thinking_scratch",
    "audit_logs",
    "doubt_notes",
    "thinking_space_meta",
    "thinking_nodes",
    "thinking_inbox",
    "thinking_node_links"
  ];
  for (const table of upsertOrder) {
    const plan = planByScope.get(table);
    if (!plan) continue;
    await upsertTable(client, plan.table, plan.columns, plan.rows, plan.conflictColumns);
  }

  const deleteOrder: ScopedTable[] = [
    "thinking_node_links",
    "thinking_inbox",
    "thinking_nodes",
    "thinking_space_meta",
    "thinking_spaces",
    "doubt_notes",
    "doubts",
    "thinking_scratch",
    "audit_logs"
  ];
  for (const table of deleteOrder) {
    const plan = planByScope.get(table);
    if (!plan) continue;
    const ids = [...new Set(plan.rows.map((row) => String(row[0])))];
    await deleteRowsNotInSet(client, plan.table, plan.idColumn, ids);
  }
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
  if (!shouldUsePostgres()) return;
  const pool = getPool();
  if (!pool) return;
  await ensurePgReady();

  const statusClass = args.status >= 500 ? "5xx" : args.status >= 400 ? "4xx" : "2xx";
  const responseBytes =
    typeof args.responseBytes === "number" && Number.isFinite(args.responseBytes) && args.responseBytes > 0
      ? Math.round(args.responseBytes)
      : DEFAULT_MONITOR_RESPONSE_BYTES;

  await withPgRetry("recordApiMinuteStat", async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO api_request_minute_stats (
           minute_key, date_key, route, status_class, request_count, response_bytes_sum, updated_at
         ) VALUES (
           to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD HH24:MI'),
           to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD'),
           $1, $2, 1, $3, $4
         )
         ON CONFLICT (minute_key, route, status_class) DO UPDATE
         SET request_count = api_request_minute_stats.request_count + 1,
             response_bytes_sum = api_request_minute_stats.response_bytes_sum + EXCLUDED.response_bytes_sum,
             updated_at = EXCLUDED.updated_at`,
        [args.route, statusClass, responseBytes, nowIso()]
      );
    } finally {
      client.release();
    }
  });
}

export type MonitorTrafficMetrics = {
  traffic_now: { qps_1m: number; bandwidth_mbps_est_1m: number };
  traffic_peak_3d: Array<{ date: string; peak_qps: number; p95_minute_qps: number; peak_bandwidth_mbps_est: number }>;
};

export async function readMonitorTrafficMetrics(): Promise<MonitorTrafficMetrics> {
  const days = recentDateKeys(3);
  const empty: MonitorTrafficMetrics = {
    traffic_now: { qps_1m: 0, bandwidth_mbps_est_1m: 0 },
    traffic_peak_3d: days.map((date) => ({
      date,
      peak_qps: 0,
      p95_minute_qps: 0,
      peak_bandwidth_mbps_est: 0
    }))
  };

  if (!shouldUsePostgres()) return empty;
  const pool = getPool();
  if (!pool) return empty;
  await ensurePgReady();

  const { minuteRows, nowRow } = await withPgRetry("readMonitorTrafficMetrics", async () => {
    const client = await pool.connect();
    try {
      const minuteRowsResult = await client.query<{
        date_key: string;
        minute_key: string;
        total_count: string;
        total_bytes: string;
      }>(
        `SELECT
           date_key,
           minute_key,
           SUM(request_count)::text AS total_count,
           SUM(response_bytes_sum)::text AS total_bytes
         FROM api_request_minute_stats
         WHERE date_key = ANY($1)
           AND route LIKE '/v1/%'
           AND route <> '/v1/health'
         GROUP BY date_key, minute_key
         ORDER BY date_key, minute_key`,
        [days]
      );

      const nowRowResult = await client.query<{ total_count: string; total_bytes: string }>(
        `SELECT
           COALESCE(SUM(request_count), 0)::text AS total_count,
           COALESCE(SUM(response_bytes_sum), 0)::text AS total_bytes
         FROM api_request_minute_stats
         WHERE minute_key = to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD HH24:MI')
           AND route LIKE '/v1/%'
           AND route <> '/v1/health'`
      );
      return { minuteRows: minuteRowsResult.rows, nowRow: nowRowResult.rows[0] ?? { total_count: "0", total_bytes: "0" } };
    } finally {
      client.release();
    }
  });

  const byDate = new Map<string, Array<{ count: number; bytes: number }>>();
  for (const row of minuteRows) {
    const count = Number(row.total_count ?? "0");
    const bytes = Number(row.total_bytes ?? "0");
    if (!byDate.has(row.date_key)) byDate.set(row.date_key, []);
    byDate.get(row.date_key)!.push({
      count: Number.isFinite(count) ? count : 0,
      bytes: Number.isFinite(bytes) ? bytes : 0
    });
  }

  const trafficPeak3d = days.map((date) => {
    const samples = byDate.get(date) ?? [];
    if (!samples.length) {
      return { date, peak_qps: 0, p95_minute_qps: 0, peak_bandwidth_mbps_est: 0 };
    }

    const minuteQps = samples.map((item) => item.count / 60);
    const peakQps = Math.max(...minuteQps, 0);
    const p95Qps = percentile(minuteQps, 95);
    const totalCount = samples.reduce((sum, item) => sum + item.count, 0);
    const totalBytes = samples.reduce((sum, item) => sum + item.bytes, 0);
    const avgResponseBytes = totalCount > 0 ? totalBytes / totalCount : DEFAULT_MONITOR_RESPONSE_BYTES;
    const peakBandwidthMbps = (peakQps * avgResponseBytes * 8) / 1_000_000;

    return {
      date,
      peak_qps: Number(peakQps.toFixed(3)),
      p95_minute_qps: Number(p95Qps.toFixed(3)),
      peak_bandwidth_mbps_est: Number(peakBandwidthMbps.toFixed(3))
    };
  });

  const nowCount = Number(nowRow.total_count ?? "0");
  const nowBytes = Number(nowRow.total_bytes ?? "0");
  const qpsNow = (Number.isFinite(nowCount) ? nowCount : 0) / 60;
  const bandwidthNow = ((Number.isFinite(nowBytes) ? nowBytes : 0) / 60) * 8 / 1_000_000;

  return {
    traffic_now: {
      qps_1m: Number(qpsNow.toFixed(3)),
      bandwidth_mbps_est_1m: Number(bandwidthNow.toFixed(3))
    },
    traffic_peak_3d: trafficPeak3d
  };
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
  const normalizedScope = normalizeScope(scope);
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
