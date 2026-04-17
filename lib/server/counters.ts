import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { logError, logWarn } from "@/lib/server/observability";

const DATA_DIR = path.join(process.cwd(), "data");
const COUNTERS_FILE = path.join(DATA_DIR, "counters.json");

const APK_DOWNLOAD_KEY = "apk_download_total";

const COUNTER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_counters (
  key TEXT PRIMARY KEY,
  total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`;

let counterPool: Pool | null = null;
let counterReadyPromise: Promise<void> | null = null;

function hasPg() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!hasPg()) return null;
  if (!counterPool) {
    counterPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return counterPool;
}

async function ensureCounterTable() {
  const pool = getPool();
  if (!pool) return;
  if (!counterReadyPromise) {
    counterReadyPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(COUNTER_TABLE_SQL);
      } finally {
        client.release();
      }
    })().catch((error) => {
      counterReadyPromise = null;
      throw error;
    });
  }
  await counterReadyPromise;
}

type CounterFile = Record<string, number>;

async function readCounterFile(): Promise<CounterFile> {
  try {
    const raw = await readFile(COUNTERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: CounterFile = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          result[key] = Math.max(0, Math.floor(value));
        }
      }
      return result;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logWarn("counters.read.file.failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {};
}

async function writeCounterFile(data: CounterFile) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(COUNTERS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getCounter(key: string): Promise<number> {
  try {
    if (hasPg()) {
      await ensureCounterTable();
      const pool = getPool();
      if (pool) {
        const result = await pool.query<{ total: string }>(
          "SELECT total FROM app_counters WHERE key = $1",
          [key]
        );
        const row = result.rows[0];
        if (!row) return 0;
        const value = Number(row.total);
        return Number.isFinite(value) ? value : 0;
      }
    }
  } catch (error) {
    logError("counters.get.pg.failed", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const file = await readCounterFile();
  return file[key] ?? 0;
}

export async function incrementCounter(key: string, amount = 1): Promise<number> {
  const delta = Math.max(1, Math.floor(amount));
  try {
    if (hasPg()) {
      await ensureCounterTable();
      const pool = getPool();
      if (pool) {
        const result = await pool.query<{ total: string }>(
          `INSERT INTO app_counters (key, total, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
             SET total = app_counters.total + EXCLUDED.total,
                 updated_at = NOW()
           RETURNING total`,
          [key, delta]
        );
        const row = result.rows[0];
        const value = Number(row?.total ?? 0);
        return Number.isFinite(value) ? value : 0;
      }
    }
  } catch (error) {
    logError("counters.increment.pg.failed", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const file = await readCounterFile();
  const next = (file[key] ?? 0) + delta;
  file[key] = next;
  try {
    await writeCounterFile(file);
  } catch (error) {
    logError("counters.increment.file.failed", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return next;
}

export async function getApkDownloadCount(): Promise<number> {
  return getCounter(APK_DOWNLOAD_KEY);
}

export async function recordApkDownload(): Promise<number> {
  return incrementCounter(APK_DOWNLOAD_KEY);
}
