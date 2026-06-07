import { mkdir, readFile, writeFile } from "node:fs/promises";

import { DATA_DIR, DB_FILE } from "@/lib/server/db/config";
import { EMPTY_DB, normalizeDb } from "@/lib/server/db/normalize";
import type { DbState } from "@/lib/server/types";

let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readDbFromJson(): Promise<DbState> {
  await ensureDataDir();
  try {
    const raw = await readFile(DB_FILE, "utf8");
    return normalizeDb(JSON.parse(raw) as Partial<DbState>);
  } catch {
    return { ...EMPTY_DB };
  }
}

export async function updateDbJson(mutator: (db: DbState) => void | Promise<void>): Promise<DbState> {
  let nextState: DbState = { ...EMPTY_DB };
  const queuedWrite = writeQueue.catch(() => undefined).then(async () => {
    const db = await readDbFromJson();
    await mutator(db);
    await ensureDataDir();
    await writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    nextState = db;
  });
  writeQueue = queuedWrite;
  await queuedWrite;
  return nextState;
}
