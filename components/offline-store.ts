"use client";

import type { ThinkingSpaceView } from "@/components/thinking-layer";
import type { LifeStore, ThinkingStore } from "@/components/zhihuo-model";

const DB_NAME = "zhihuo_offline_v1";
const DB_VERSION = 4;
const SNAPSHOT_STORE = "snapshot";
const QUEUE_STORE = "mutation_queue";
const MEDIA_STORE = "media_asset";
const SYNC_BACKUP_STORE = "sync_backup";
const SYNC_BACKUP_LIMIT = 5;
const LEGACY_SNAPSHOT_KEY = "main";
const LOCAL_PROFILE_STORAGE_KEY = "zhihuo_local_profile_v1";
const LAST_USER_STORAGE_KEY = "zhihuo_last_user_v1";

export type OfflineSnapshot = {
  lifeStore: LifeStore;
  thinkingStore: ThinkingStore;
  activeSpaceId: string | null;
  thinkingViews: Record<string, ThinkingSpaceView>;
  savedAt: string;
  meta: OfflineSnapshotMeta;
};

export type OfflineOwnerMode = "guest" | "user";

export type OfflineSyncState = {
  lastSyncedAt: string | null;
  hasLocalChanges: boolean;
  bindingRequired: boolean;
};

export type OfflineSnapshotCompleteness = "complete" | "partial" | "syncing" | "stale";

export type OfflineSnapshotMeta = {
  localProfileId: string;
  ownerMode: OfflineOwnerMode;
  boundUserId: string | null;
  revision: number | null;
  completeness: OfflineSnapshotCompleteness;
  lastAppliedLogId: string | null;
  syncState: OfflineSyncState;
};

export type OfflineOwnerRef =
  | {
      mode: "guest";
      localProfileId: string;
    }
  | {
      mode: "user";
      userId: string;
      localProfileId?: string | null;
    };

export type OfflineOwnerKey = `guest:${string}` | `user:${string}`;

export type QueuedMutation = {
  id: string;
  ownerKey: OfflineOwnerKey;
  deviceId: string;
  clientOrder: number;
  route: string;
  method: "POST" | "PUT" | "DELETE";
  op: string;
  entityType: "life" | "thinking" | "scratch" | "system";
  body: Record<string, unknown> | null;
  clientMutationId: string;
  clientUpdatedAt: string;
  baseRevision: number;
  status: "pending" | "acked" | "failed" | "dead_letter";
  ackedRevision: number | null;
  deadLetterReason?: string | null;
  createdAt: string;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
};

export type OfflineMediaAssetStatus = "pending" | "uploaded" | "dead_letter";

export type OfflineMediaAssetRecord = {
  id: string;
  ownerKey: OfflineOwnerKey;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  status: OfflineMediaAssetStatus;
  blob: Blob | null;
  remoteUrl: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedAt: string | null;
  deletedAt: string | null;
  lastError: string | null;
};

type SnapshotRecord = {
  key: string;
  value: OfflineSnapshot;
};

export type OfflineSnapshotRecord = {
  ownerKey: OfflineOwnerKey;
  savedAt: string;
  meta: OfflineSnapshotMeta;
};

export type OfflineSyncBackupMediaAsset = Omit<OfflineMediaAssetRecord, "blob"> & {
  hasBlob: boolean;
};

export type OfflineSyncBackupRecord = {
  id: string;
  ownerKey: OfflineOwnerKey;
  snapshot: OfflineSnapshot;
  mutations: QueuedMutation[];
  mediaAssets: OfflineSyncBackupMediaAsset[];
  createdAt: string;
  reason: string;
};

export type LastUserMarker = {
  userId: string;
  email: string;
  updatedAt: string;
};

function createLocalId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateLocalProfileId() {
  if (!canUseLocalStorage()) return createLocalId();
  const existing = window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
  if (existing && existing.trim()) return existing;
  const nextId = createLocalId();
  window.localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, nextId);
  return nextId;
}

export function loadLastUserMarker(): LastUserMarker | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(LAST_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastUserMarker>;
    if (typeof parsed.userId !== "string" || !parsed.userId.trim()) return null;
    if (typeof parsed.email !== "string" || !parsed.email.trim()) return null;
    return {
      userId: parsed.userId,
      email: parsed.email,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function saveLastUserMarker(user: { userId: string; email: string }) {
  if (!canUseLocalStorage()) return;
  if (!user.userId.trim() || !user.email.trim()) return;
  window.localStorage.setItem(
    LAST_USER_STORAGE_KEY,
    JSON.stringify({
      userId: user.userId,
      email: user.email,
      updatedAt: new Date().toISOString()
    } satisfies LastUserMarker)
  );
}

export function clearLastUserMarker() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(LAST_USER_STORAGE_KEY);
}

export function createOfflineSnapshotMeta(localProfileId: string, options?: Partial<OfflineSnapshotMeta>): OfflineSnapshotMeta {
  return {
    localProfileId,
    ownerMode: options?.ownerMode === "user" ? "user" : "guest",
    boundUserId: typeof options?.boundUserId === "string" && options.boundUserId.trim() ? options.boundUserId : null,
    revision: typeof options?.revision === "number" && Number.isFinite(options.revision) ? options.revision : null,
    completeness:
      options?.completeness === "partial" ||
      options?.completeness === "syncing" ||
      options?.completeness === "complete" ||
      options?.completeness === "stale"
        ? options.completeness
        : "complete",
    lastAppliedLogId:
      typeof options?.lastAppliedLogId === "string" && options.lastAppliedLogId.trim() ? options.lastAppliedLogId : null,
    syncState: {
      lastSyncedAt:
        typeof options?.syncState?.lastSyncedAt === "string" && options.syncState.lastSyncedAt.trim()
          ? options.syncState.lastSyncedAt
          : null,
      hasLocalChanges: options?.syncState?.hasLocalChanges === true,
      bindingRequired: options?.syncState?.bindingRequired === true
    }
  };
}

export function getGuestOwnerKey(localProfileId: string): OfflineOwnerKey {
  return `guest:${localProfileId}`;
}

export function getUserOwnerKey(userId: string): OfflineOwnerKey {
  return `user:${userId}`;
}

export function ownerKeyFromRef(owner: OfflineOwnerRef): OfflineOwnerKey {
  return owner.mode === "guest" ? getGuestOwnerKey(owner.localProfileId) : getUserOwnerKey(owner.userId);
}

function normalizeOfflineSnapshot(raw: OfflineSnapshot): OfflineSnapshot {
  const localProfileId = getOrCreateLocalProfileId();
  return {
    lifeStore: cloneValue(raw.lifeStore),
    thinkingStore: cloneValue(raw.thinkingStore),
    activeSpaceId: raw.activeSpaceId ?? null,
    thinkingViews: cloneValue(raw.thinkingViews ?? {}),
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
    meta: createOfflineSnapshotMeta(localProfileId, raw.meta)
  };
}

function normalizeQueuedMutation(raw: QueuedMutation, fallbackOwnerKey: OfflineOwnerKey): QueuedMutation {
  const fallbackDeviceId =
    fallbackOwnerKey.startsWith("guest:") || fallbackOwnerKey.startsWith("user:")
      ? fallbackOwnerKey.slice(fallbackOwnerKey.indexOf(":") + 1)
      : getOrCreateLocalProfileId();
  const createdAtMs = new Date(typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()).getTime();
  return {
    ...cloneValue(raw),
    ownerKey: typeof raw.ownerKey === "string" && /^guest:|^user:/.test(raw.ownerKey) ? raw.ownerKey : fallbackOwnerKey,
    deviceId: typeof (raw as { deviceId?: unknown }).deviceId === "string" && String((raw as { deviceId?: unknown }).deviceId).trim()
      ? String((raw as { deviceId?: unknown }).deviceId)
      : fallbackDeviceId,
    clientOrder: Number.isFinite((raw as { clientOrder?: unknown }).clientOrder)
      ? Number((raw as { clientOrder?: unknown }).clientOrder)
      : Number.isFinite(createdAtMs)
        ? createdAtMs
        : Date.now(),
    op: typeof raw.op === "string" && raw.op.trim() ? raw.op : raw.route,
    entityType:
      raw.entityType === "life" || raw.entityType === "thinking" || raw.entityType === "scratch" || raw.entityType === "system"
        ? raw.entityType
        : raw.route.startsWith("/v1/doubts")
          ? "life"
          : raw.route.startsWith("/v1/thinking/scratch")
            ? "scratch"
            : raw.route.startsWith("/v1/thinking")
              ? "thinking"
              : "system",
    baseRevision: Number.isFinite(raw.baseRevision) ? Number(raw.baseRevision) : 0,
    status: raw.status === "acked" || raw.status === "failed" || raw.status === "dead_letter" ? raw.status : "pending",
    ackedRevision: Number.isFinite(raw.ackedRevision) ? Number(raw.ackedRevision) : null,
    deadLetterReason: typeof raw.deadLetterReason === "string" && raw.deadLetterReason.trim() ? raw.deadLetterReason : null
  };
}

function normalizeOfflineMediaAsset(raw: OfflineMediaAssetRecord, fallbackOwnerKey: OfflineOwnerKey): OfflineMediaAssetRecord {
  return {
    ...raw,
    ownerKey: typeof raw.ownerKey === "string" && /^guest:|^user:/.test(raw.ownerKey) ? raw.ownerKey : fallbackOwnerKey,
    fileName: typeof raw.fileName === "string" ? raw.fileName : "image",
    mimeType: typeof raw.mimeType === "string" && raw.mimeType.trim() ? raw.mimeType : "application/octet-stream",
    byteSize: Number.isFinite(raw.byteSize) ? Math.max(0, Number(raw.byteSize)) : 0,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : "",
    width: Number.isFinite(raw.width) ? Number(raw.width) : null,
    height: Number.isFinite(raw.height) ? Number(raw.height) : null,
    status: raw.status === "uploaded" || raw.status === "dead_letter" ? raw.status : "pending",
    blob: raw.blob instanceof Blob ? raw.blob : null,
    remoteUrl: typeof raw.remoteUrl === "string" && raw.remoteUrl.trim() ? raw.remoteUrl : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    uploadedAt: typeof raw.uploadedAt === "string" ? raw.uploadedAt : null,
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : null,
    lastError: typeof raw.lastError === "string" && raw.lastError.trim() ? raw.lastError : null
  };
}

function toBackupMediaAsset(raw: OfflineMediaAssetRecord, fallbackOwnerKey: OfflineOwnerKey): OfflineSyncBackupMediaAsset {
  const normalized = normalizeOfflineMediaAsset(raw, fallbackOwnerKey);
  const { blob: _blob, ...withoutBlob } = normalized;
  return {
    ...withoutBlob,
    hasBlob: Boolean(normalized.blob)
  };
}

function normalizeOfflineSyncBackup(raw: OfflineSyncBackupRecord, fallbackOwnerKey: OfflineOwnerKey): OfflineSyncBackupRecord {
  const ownerKey = typeof raw.ownerKey === "string" && /^guest:|^user:/.test(raw.ownerKey) ? raw.ownerKey : fallbackOwnerKey;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : createLocalId(),
    ownerKey,
    snapshot: normalizeOfflineSnapshot(raw.snapshot),
    mutations: Array.isArray(raw.mutations)
      ? raw.mutations.map((item) => normalizeQueuedMutation(item, ownerKey))
      : [],
    mediaAssets: Array.isArray(raw.mediaAssets)
      ? raw.mediaAssets.map((item) => ({
          ...toBackupMediaAsset({ ...item, blob: null }, ownerKey),
          hasBlob: item.hasBlob === true
        }))
      : [],
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason : "manual"
  };
}

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
        const tx = request.transaction;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(SYNC_BACKUP_STORE)) {
          db.createObjectStore(SYNC_BACKUP_STORE, { keyPath: "id" });
        }
        if (tx) {
          const queue = tx.objectStore(QUEUE_STORE);
          if (!queue.indexNames.contains("ownerKey")) queue.createIndex("ownerKey", "ownerKey", { unique: false });
          if (!queue.indexNames.contains("ownerStatus")) {
            queue.createIndex("ownerStatus", ["ownerKey", "status"], { unique: false });
          }
          const media = tx.objectStore(MEDIA_STORE);
          if (!media.indexNames.contains("ownerKey")) media.createIndex("ownerKey", "ownerKey", { unique: false });
          if (!media.indexNames.contains("ownerStatus")) {
            media.createIndex("ownerStatus", ["ownerKey", "status"], { unique: false });
          }
          const backups = tx.objectStore(SYNC_BACKUP_STORE);
          if (!backups.indexNames.contains("ownerKey")) backups.createIndex("ownerKey", "ownerKey", { unique: false });
          if (!backups.indexNames.contains("ownerCreatedAt")) {
            backups.createIndex("ownerCreatedAt", ["ownerKey", "createdAt"], { unique: false });
          }
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

function cloneMediaAssetRecord<T extends OfflineMediaAssetRecord>(input: T): T {
  if (typeof structuredClone === "function") return structuredClone(input) as T;
  return {
    ...input,
    blob: input.blob ?? null
  };
}

function toTimeMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function shouldKeepExistingSnapshot(existing: OfflineSnapshot | undefined, incoming: OfflineSnapshot): boolean {
  if (!existing) return false;
  const existingMeta = createOfflineSnapshotMeta(getOrCreateLocalProfileId(), existing.meta);
  const incomingMeta = incoming.meta;
  if (existingMeta.ownerMode === "guest" && incomingMeta.ownerMode === "guest") {
    const existingItemCount =
      existing.lifeStore.doubts.length +
      existing.lifeStore.notes.length +
      existing.thinkingStore.spaces.length +
      existing.thinkingStore.nodes.length +
      existing.thinkingStore.scratch.length +
      existing.thinkingStore.mediaAssets.length;
    const incomingItemCount =
      incoming.lifeStore.doubts.length +
      incoming.lifeStore.notes.length +
      incoming.thinkingStore.spaces.length +
      incoming.thinkingStore.nodes.length +
      incoming.thinkingStore.scratch.length +
      incoming.thinkingStore.mediaAssets.length;
    if (existingItemCount > 0 && incomingItemCount === 0) return true;
    if (
      existingMeta.completeness === "complete" &&
      (incomingMeta.completeness === "syncing" || incomingMeta.completeness === "stale")
    ) {
      return true;
    }
  }
  if (
    existingMeta.ownerMode !== "user" ||
    incomingMeta.ownerMode !== "user" ||
    existingMeta.boundUserId !== incomingMeta.boundUserId
  ) {
    return false;
  }
  if (typeof existingMeta.revision !== "number" || typeof incomingMeta.revision !== "number") return false;
  if (!Number.isFinite(existingMeta.revision) || !Number.isFinite(incomingMeta.revision)) return false;
  if (incomingMeta.revision < existingMeta.revision) return true;
  if (incomingMeta.revision > existingMeta.revision) return false;

  const existingSyncedAt = toTimeMs(existingMeta.syncState.lastSyncedAt);
  const incomingSyncedAt = toTimeMs(incomingMeta.syncState.lastSyncedAt);
  if (existingSyncedAt !== null && incomingSyncedAt === null) return true;
  return existingSyncedAt !== null && incomingSyncedAt !== null && incomingSyncedAt < existingSyncedAt;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

async function loadSnapshotRow(key: string): Promise<SnapshotRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const req = store.get(key);
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve((req.result as SnapshotRecord | undefined) ?? null);
  });
}

async function saveSnapshotRow(key: string, snapshot: OfflineSnapshot, options?: { force?: boolean }): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const normalized = normalizeOfflineSnapshot(snapshot);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    if (options?.force === true) {
      store.put({ key, value: cloneValue(normalized) } satisfies SnapshotRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      return;
    }
    const req = store.get(key);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const current = req.result as SnapshotRecord | undefined;
      if (shouldKeepExistingSnapshot(current?.value, normalized)) return;
      store.put({ key, value: cloneValue(normalized) } satisfies SnapshotRecord);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function deleteSnapshotRow(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function ensureLegacySnapshotMigrated(): Promise<void> {
  const legacy = await loadSnapshotRow(LEGACY_SNAPSHOT_KEY);
  if (!legacy?.value) return;
  const normalized = normalizeOfflineSnapshot(legacy.value);
  const fallbackOwnerKey =
    normalized.meta.ownerMode === "user" && normalized.meta.boundUserId
      ? getUserOwnerKey(normalized.meta.boundUserId)
      : getGuestOwnerKey(normalized.meta.localProfileId);
  const existing = await loadSnapshotRow(fallbackOwnerKey);
  if (!existing?.value) {
    await saveSnapshotRow(fallbackOwnerKey, normalized);
  }
  await deleteSnapshotRow(LEGACY_SNAPSHOT_KEY);
}

export async function loadOfflineSnapshotByOwner(ownerKey: OfflineOwnerKey): Promise<OfflineSnapshot | null> {
  await ensureLegacySnapshotMigrated();
  const row = await loadSnapshotRow(ownerKey);
  return row?.value ? normalizeOfflineSnapshot(row.value) : null;
}

export async function loadOfflineSnapshot(): Promise<OfflineSnapshot | null> {
  await ensureLegacySnapshotMigrated();
  const localProfileId = getOrCreateLocalProfileId();
  return loadOfflineSnapshotByOwner(getGuestOwnerKey(localProfileId));
}

export async function saveOfflineSnapshotByOwner(
  ownerKey: OfflineOwnerKey,
  snapshot: OfflineSnapshot,
  options?: { force?: boolean }
): Promise<void> {
  await saveSnapshotRow(ownerKey, snapshot, options);
}

export async function saveOfflineSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  await ensureLegacySnapshotMigrated();
  const inferredOwnerKey =
    snapshot.meta.ownerMode === "user" && snapshot.meta.boundUserId
      ? getUserOwnerKey(snapshot.meta.boundUserId)
      : getGuestOwnerKey(snapshot.meta.localProfileId);
  await saveSnapshotRow(inferredOwnerKey, snapshot);
}

export async function listOfflineSnapshotRecords(): Promise<OfflineSnapshotRecord[]> {
  await ensureLegacySnapshotMigrated();
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const req = store.getAll();
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as SnapshotRecord[] | undefined) ?? [];
      resolve(
        rows
          .filter((row) => row.key !== LEGACY_SNAPSHOT_KEY && row.value)
          .map((row) => {
            const snapshot = normalizeOfflineSnapshot(row.value);
            return {
              ownerKey: row.key as OfflineOwnerKey,
              savedAt: snapshot.savedAt,
              meta: snapshot.meta
            } satisfies OfflineSnapshotRecord;
          })
          .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      );
    };
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

export async function listOfflineMutationsByOwner(ownerKey: OfflineOwnerKey, now = Date.now()): Promise<QueuedMutation[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.index("ownerKey").getAll(ownerKey);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as QueuedMutation[] | undefined) ?? [];
      const fallbackOwnerKey = ownerKey;
      resolve(
        rows
          .map((item) => normalizeQueuedMutation(item, fallbackOwnerKey))
          .filter((item) => item.ownerKey === ownerKey)
          .filter((item) => item.status !== "acked" && item.status !== "dead_letter")
          .filter((item) => Number.isFinite(item.nextRetryAt) && item.nextRetryAt <= now)
          .sort((a, b) => a.clientOrder - b.clientOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    };
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
          .map((item) => normalizeQueuedMutation(item, getGuestOwnerKey(getOrCreateLocalProfileId())))
          .filter((item) => item.status !== "acked" && item.status !== "dead_letter")
          .filter((item) => Number.isFinite(item.nextRetryAt) && item.nextRetryAt <= now)
          .sort((a, b) => a.clientOrder - b.clientOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
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
  patch: Partial<
    Pick<
      QueuedMutation,
      "retryCount" | "nextRetryAt" | "lastError" | "status" | "ackedRevision" | "baseRevision" | "deadLetterReason"
    >
  >
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
    const tx = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, MEDIA_STORE, SYNC_BACKUP_STORE], "readwrite");
    tx.objectStore(SNAPSHOT_STORE).clear();
    tx.objectStore(QUEUE_STORE).clear();
    tx.objectStore(MEDIA_STORE).clear();
    tx.objectStore(SYNC_BACKUP_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function listDeadLetterMutationsByOwner(ownerKey: OfflineOwnerKey): Promise<QueuedMutation[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.index("ownerStatus").getAll([ownerKey, "dead_letter"]);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as QueuedMutation[] | undefined) ?? [];
      const fallbackOwnerKey = ownerKey;
      resolve(
        rows
          .map((item) => normalizeQueuedMutation(item, fallbackOwnerKey))
          .filter((item) => item.ownerKey === ownerKey && item.status === "dead_letter")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    };
  });
}

export async function clearOfflineMutationsByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.index("ownerKey").openKeyCursor(ownerKey);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function clearOfflineSnapshotByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  await deleteSnapshotRow(ownerKey);
}

export async function clearOfflineWorkingStateByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  await Promise.all([
    clearOfflineSnapshotByOwner(ownerKey),
    clearOfflineMutationsByOwner(ownerKey),
    clearOfflineMediaAssetsByOwner(ownerKey)
  ]);
}

export async function clearOfflineOwnerState(ownerKey: OfflineOwnerKey): Promise<void> {
  await Promise.all([
    clearOfflineWorkingStateByOwner(ownerKey),
    clearOfflineSyncBackupsByOwner(ownerKey)
  ]);
}

export async function saveOfflineMediaAsset(asset: OfflineMediaAssetRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const normalized = normalizeOfflineMediaAsset(asset, asset.ownerKey);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).put(cloneMediaAssetRecord(normalized));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function loadOfflineMediaAssetById(assetId: string): Promise<OfflineMediaAssetRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readonly");
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.get(assetId);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const row = req.result as OfflineMediaAssetRecord | undefined;
      resolve(row ? cloneMediaAssetRecord(row) : null);
    };
  });
}

export async function listOfflineMediaAssetsByOwner(ownerKey: OfflineOwnerKey): Promise<OfflineMediaAssetRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readonly");
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.index("ownerKey").getAll(ownerKey);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as OfflineMediaAssetRecord[] | undefined) ?? [];
      resolve(
        rows
          .map((item) => normalizeOfflineMediaAsset(item, ownerKey))
          .filter((item) => item.ownerKey === ownerKey)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    };
  });
}

export async function listPendingOfflineMediaAssetsByOwner(ownerKey: OfflineOwnerKey): Promise<OfflineMediaAssetRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readonly");
    const req = tx.objectStore(MEDIA_STORE).index("ownerStatus").getAll([ownerKey, "pending"]);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as OfflineMediaAssetRecord[] | undefined) ?? [];
      resolve(
        rows
          .map((item) => normalizeOfflineMediaAsset(item, ownerKey))
          .filter((item) => item.ownerKey === ownerKey && item.status === "pending" && !item.deletedAt && item.blob)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    };
  });
}

export async function updateOfflineMediaAsset(
  assetId: string,
  patch: Partial<
    Pick<
      OfflineMediaAssetRecord,
      "status" | "remoteUrl" | "uploadedAt" | "deletedAt" | "lastError" | "updatedAt" | "blob" | "byteSize" | "sha256"
    >
  >
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.get(assetId);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const item = req.result as OfflineMediaAssetRecord | undefined;
      if (!item) {
        resolve();
        return;
      }
      store.put(
        cloneMediaAssetRecord({
          ...item,
          ...patch,
          updatedAt: patch.updatedAt ?? new Date().toISOString()
        })
      );
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function removeOfflineMediaAsset(assetId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).delete(assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function clearOfflineMediaAssetsByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.index("ownerKey").openKeyCursor(ownerKey);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function createOfflineSyncBackup(ownerKey: OfflineOwnerKey, reason: string): Promise<OfflineSyncBackupRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, MEDIA_STORE, SYNC_BACKUP_STORE], "readwrite");
    const snapshotStore = tx.objectStore(SNAPSHOT_STORE);
    const queueStore = tx.objectStore(QUEUE_STORE);
    const mediaStore = tx.objectStore(MEDIA_STORE);
    const backupStore = tx.objectStore(SYNC_BACKUP_STORE);
    const snapshotReq = snapshotStore.get(ownerKey);
    const queueReq = queueStore.index("ownerKey").getAll(ownerKey);
    const mediaReq = mediaStore.index("ownerKey").getAll(ownerKey);
    const backupsReq = backupStore.index("ownerKey").getAll(ownerKey);
    let backup: OfflineSyncBackupRecord | null = null;

    tx.oncomplete = () => resolve(backup);
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);

    backupsReq.onsuccess = () => {
      const snapshotRow = snapshotReq.result as SnapshotRecord | undefined;
      if (!snapshotRow?.value) return;
      const allMutations = (queueReq.result as QueuedMutation[] | undefined) ?? [];
      const allMediaAssets = (mediaReq.result as OfflineMediaAssetRecord[] | undefined) ?? [];
      const normalized: OfflineSyncBackupRecord = {
        id: createLocalId(),
        ownerKey,
        snapshot: normalizeOfflineSnapshot(snapshotRow.value),
        mutations: allMutations
          .map((item) => normalizeQueuedMutation(item, ownerKey))
          .filter((item) => item.ownerKey === ownerKey && item.status !== "acked"),
        mediaAssets: allMediaAssets
          .map((item) => toBackupMediaAsset(item, ownerKey))
          .filter((item) => item.ownerKey === ownerKey),
        createdAt: new Date().toISOString(),
        reason: reason.trim() || "manual"
      };
      backup = normalized;
      backupStore.put(cloneValue(normalized));

      const existingBackups = ((backupsReq.result as OfflineSyncBackupRecord[] | undefined) ?? [])
        .map((item) => normalizeOfflineSyncBackup(item, ownerKey))
        .filter((item) => item.ownerKey === ownerKey)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const stale of existingBackups.slice(Math.max(0, SYNC_BACKUP_LIMIT - 1))) {
        backupStore.delete(stale.id);
      }
    };
  });
}

export async function listOfflineSyncBackupsByOwner(ownerKey: OfflineOwnerKey): Promise<OfflineSyncBackupRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(SYNC_BACKUP_STORE, "readonly");
    const req = tx.objectStore(SYNC_BACKUP_STORE).index("ownerKey").getAll(ownerKey);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as OfflineSyncBackupRecord[] | undefined) ?? [];
      resolve(
        rows
          .map((item) => normalizeOfflineSyncBackup(item, ownerKey))
          .filter((item) => item.ownerKey === ownerKey)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    };
  });
}

export async function loadLatestOfflineSyncBackupByOwner(ownerKey: OfflineOwnerKey): Promise<OfflineSyncBackupRecord | null> {
  const backups = await listOfflineSyncBackupsByOwner(ownerKey);
  return backups[0] ?? null;
}

export async function restoreOfflineSyncBackup(backupId: string): Promise<OfflineSyncBackupRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, SYNC_BACKUP_STORE], "readwrite");
    const backupStore = tx.objectStore(SYNC_BACKUP_STORE);
    const snapshotStore = tx.objectStore(SNAPSHOT_STORE);
    const queueStore = tx.objectStore(QUEUE_STORE);
    const getReq = backupStore.get(backupId);
    let restored: OfflineSyncBackupRecord | null = null;

    getReq.onsuccess = () => {
      const raw = getReq.result as OfflineSyncBackupRecord | undefined;
      if (!raw) return;
      const ownerKey =
        typeof raw.ownerKey === "string" && /^guest:|^user:/.test(raw.ownerKey)
          ? raw.ownerKey
          : getGuestOwnerKey(getOrCreateLocalProfileId());
      const normalized = normalizeOfflineSyncBackup(raw, ownerKey);
      restored = normalized;
      snapshotStore.put({
        key: normalized.ownerKey,
        value: cloneValue(normalized.snapshot)
      } satisfies SnapshotRecord);
      const queueReq = queueStore.index("ownerKey").openKeyCursor(normalized.ownerKey);
      queueReq.onsuccess = () => {
        const cursor = queueReq.result;
        if (cursor) {
          queueStore.delete(cursor.primaryKey);
          cursor.continue();
          return;
        }
        for (const mutation of normalized.mutations) {
          if (mutation.status !== "acked") queueStore.put(cloneValue(mutation));
        }
      };
    };

    tx.oncomplete = () => resolve(restored);
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
}

export async function clearOfflineSyncBackupsByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SYNC_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(SYNC_BACKUP_STORE);
    const req = store.index("ownerKey").openKeyCursor(ownerKey);
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
