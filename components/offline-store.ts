"use client";

import type { ThinkingSpaceView } from "@/components/thinking-layer";
import type { LifeStore, ThinkingStore } from "@/components/zhihuo-model";

const DB_NAME = "zhihuo_offline_v1";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshot";
const QUEUE_STORE = "mutation_queue";
const SNAPSHOT_KEY = "main";

export type OfflineSnapshot = {
  lifeStore: LifeStore;
  thinkingStore: ThinkingStore;
  activeSpaceId: string | null;
  thinkingViews: Record<string, ThinkingSpaceView>;
  savedAt: string;
};

export type QueuedMutation = {
  id: string;
  route: string;
  method: "POST" | "PUT" | "DELETE";
  body: Record<string, unknown> | null;
  clientMutationId: string;
  clientUpdatedAt: string;
  createdAt: string;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
};

type SnapshotRecord = {
  key: string;
  value: OfflineSnapshot;
};

function canUseIdb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIdb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    } catch {
      resolve(null);
    }
  });
}

function cloneValue<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

export async function loadOfflineSnapshot(): Promise<OfflineSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const req = store.get(SNAPSHOT_KEY);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const row = req.result as SnapshotRecord | undefined;
      resolve(row?.value ? cloneValue(row.value) : null);
    };
  });
}

export async function saveOfflineSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    store.put({ key: SNAPSHOT_KEY, value: cloneValue(snapshot) } satisfies SnapshotRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function enqueueOfflineMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    store.put(cloneValue(mutation));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function listOfflineMutations(now = Date.now()): Promise<QueuedMutation[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.getAll();
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as QueuedMutation[] | undefined) ?? [];
      resolve(
        rows
          .filter((item) => Number.isFinite(item.nextRetryAt) && item.nextRetryAt <= now)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    };
  });
}

export async function removeOfflineMutation(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function updateOfflineMutation(
  id: string,
  patch: Partial<Pick<QueuedMutation, "retryCount" | "nextRetryAt" | "lastError">>
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const getReq = store.get(id);
    getReq.onerror = () => resolve();
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedMutation | undefined;
      if (!item) {
        resolve();
        return;
      }
      store.put({
        ...item,
        ...patch
      } satisfies QueuedMutation);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export function isOfflineNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /network|failed to fetch|load failed|fetch/i.test(message);
}

export async function clearOfflineState(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction([SNAPSHOT_STORE, QUEUE_STORE], "readwrite");
    tx.objectStore(SNAPSHOT_STORE).clear();
    tx.objectStore(QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
