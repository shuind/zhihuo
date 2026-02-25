import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { mockCandidateLinks, mockClusters, mockDoubts } from "@/lib/mock-data";
import { CandidateLink, Doubt, DoubtCluster, Layer } from "@/lib/types";

interface CursorShape {
  createdAt: string;
  id: string;
}

interface UserData {
  doubts: Doubt[];
  clusters: DoubtCluster[];
  candidateLinks: CandidateLink[];
  updatedAt: string;
}

interface DatabaseSchema {
  version: 1;
  users: Record<string, UserData>;
}

interface ListDoubtsParams {
  limit?: number;
  cursor?: string | null;
}

interface ListTimelineParams {
  year?: number;
  clusterId?: string;
  limit?: number;
}

const DEFAULT_USER_ID = "user-demo-001";
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "zhihuo-db.json");

let databaseCache: DatabaseSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortDoubtsDesc(left: Doubt, right: Doubt): number {
  const timeDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.id.localeCompare(left.id);
}

function sortDoubtsAsc(left: Doubt, right: Doubt): number {
  const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.id.localeCompare(right.id);
}

function encodeCursor(doubt: Doubt): string {
  const payload: CursorShape = { createdAt: doubt.createdAt, id: doubt.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): CursorShape | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorShape;
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createDefaultUserData(): UserData {
  return {
    doubts: clone(mockDoubts),
    clusters: clone(mockClusters),
    candidateLinks: clone(mockCandidateLinks),
    updatedAt: new Date().toISOString()
  };
}

function createDefaultDatabase(): DatabaseSchema {
  return {
    version: 1,
    users: {
      [DEFAULT_USER_ID]: createDefaultUserData()
    }
  };
}

async function writeDatabaseFile(database: DatabaseSchema): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(database, null, 2), "utf8");
}

async function readDatabase(): Promise<DatabaseSchema> {
  if (databaseCache) {
    return databaseCache;
  }

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed?.users) {
      throw new Error("invalid database");
    }
    databaseCache = parsed;
    return databaseCache;
  } catch {
    const initial = createDefaultDatabase();
    databaseCache = initial;
    await writeDatabaseFile(initial);
    return initial;
  }
}

function getUserData(database: DatabaseSchema, userId: string): UserData {
  if (!database.users[userId]) {
    database.users[userId] = createDefaultUserData();
  }

  return database.users[userId];
}

async function withWriteLock<T>(mutator: (database: DatabaseSchema) => T | Promise<T>): Promise<T> {
  let result: T;

  writeQueue = writeQueue.then(async () => {
    const database = await readDatabase();
    result = await mutator(database);
    await writeDatabaseFile(database);
  });

  await writeQueue;
  return result!;
}

export async function getBootstrap(userId: string): Promise<{
  doubts: Doubt[];
  clusters: DoubtCluster[];
  candidateLinks: CandidateLink[];
}> {
  return withWriteLock((database) => {
    const user = getUserData(database, userId);
    return {
      doubts: clone(user.doubts),
      clusters: clone(user.clusters),
      candidateLinks: clone(user.candidateLinks)
    };
  });
}

export async function listDoubts(userId: string, params: ListDoubtsParams): Promise<{
  items: Doubt[];
  nextCursor: string | null;
}> {
  const database = await readDatabase();
  const user = getUserData(database, userId);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const cursor = decodeCursor(params.cursor);

  let sorted = [...user.doubts].sort(sortDoubtsDesc);
  if (cursor) {
    sorted = sorted.filter((doubt) => {
      if (doubt.createdAt < cursor.createdAt) {
        return true;
      }

      if (doubt.createdAt === cursor.createdAt && doubt.id < cursor.id) {
        return true;
      }

      return false;
    });
  }

  const items = sorted.slice(0, limit);
  const nextCursor = items.length === limit ? encodeCursor(items[items.length - 1]) : null;
  return { items: clone(items), nextCursor };
}

export async function createDoubt(
  userId: string,
  payload: { rawText: string; layer?: Layer }
): Promise<Doubt> {
  return withWriteLock((database) => {
    const user = getUserData(database, userId);
    const createdAt = new Date().toISOString();

    const created: Doubt = {
      id: `d-${randomUUID()}`,
      userId,
      layer: payload.layer ?? "life",
      rawText: payload.rawText,
      createdAt,
      clusterId: "chaos-zone",
      importance: 0.62,
      recency: 1,
      growth: 0.52
    };

    user.doubts.push(created);
    user.updatedAt = createdAt;
    return clone(created);
  });
}

export async function listClusters(userId: string): Promise<DoubtCluster[]> {
  const database = await readDatabase();
  const user = getUserData(database, userId);
  return clone(user.clusters);
}

export async function listTimeline(userId: string, params: ListTimelineParams): Promise<Doubt[]> {
  const database = await readDatabase();
  const user = getUserData(database, userId);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);

  const filtered = user.doubts
    .filter((doubt) => {
      if (params.year && new Date(doubt.createdAt).getFullYear() !== params.year) {
        return false;
      }
      if (params.clusterId && doubt.clusterId !== params.clusterId) {
        return false;
      }
      return true;
    })
    .sort(sortDoubtsAsc)
    .slice(-limit);

  return clone(filtered);
}

export async function suppressLink(userId: string, linkId: string): Promise<CandidateLink | null> {
  return withWriteLock((database) => {
    const user = getUserData(database, userId);
    const target = user.candidateLinks.find((link) => link.id === linkId);
    if (!target) {
      return null;
    }

    target.suppressed = true;
    user.updatedAt = new Date().toISOString();
    return clone(target);
  });
}
