"use client";

import type { ThinkingSpaceView } from "@/components/thinking-layer";
import type { LifeStore, ThinkingStore } from "@/components/zhihuo-model";

const DB_NAME = "zhihuo_offline_v1";
const DB_VERSION = 2;
const SNAPSHOT_STORE = "snapshot";
const QUEUE_STORE = "mutation_queue";
const MEDIA_STORE = "media_asset";
const LEGACY_SNAPSHOT_KEY = "main";
const PIN_STORAGE_KEY = "zhihuo_pin_v1";
const LOCAL_PROFILE_STORAGE_KEY = "zhihuo_local_profile_v1";

type PinStorage = {
  pin_enabled: boolean;
  pin_hash: string;
  pin_salt: string;
  pin_failed_count: number;
  pin_locked_until: number;
};

export type PinStatus = {
  enabled: boolean;
  failedCount: number;
  lockedUntil: number;
};

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
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
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

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readPinStorage(): PinStorage {
  if (!canUseLocalStorage()) {
    return {
      pin_enabled: false,
      pin_hash: "",
      pin_salt: "",
      pin_failed_count: 0,
      pin_locked_until: 0
    };
  }
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) {
      return {
        pin_enabled: false,
        pin_hash: "",
        pin_salt: "",
        pin_failed_count: 0,
        pin_locked_until: 0
      };
    }
    const parsed = JSON.parse(raw) as Partial<PinStorage>;
    return {
      pin_enabled: parsed.pin_enabled === true,
      pin_hash: typeof parsed.pin_hash === "string" ? parsed.pin_hash : "",
      pin_salt: typeof parsed.pin_salt === "string" ? parsed.pin_salt : "",
      pin_failed_count: Number.isFinite(parsed.pin_failed_count) ? Math.max(0, Number(parsed.pin_failed_count)) : 0,
      pin_locked_until: Number.isFinite(parsed.pin_locked_until) ? Math.max(0, Number(parsed.pin_locked_until)) : 0
    };
  } catch {
    return {
      pin_enabled: false,
      pin_hash: "",
      pin_salt: "",
      pin_failed_count: 0,
      pin_locked_until: 0
    };
  }
}

function writePinStorage(next: PinStorage) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePin(raw: string) {
  return String(raw ?? "").replace(/\D+/g, "").slice(0, 12);
}

function lockDurationMsByFailedCount(failedCount: number) {
  if (failedCount < 5) return 0;
  const step = failedCount - 5;
  return Math.min(30 * 60 * 1000, 60 * 1000 * 2 ** step);
}

export function getPinStatus(): PinStatus {
  const state = readPinStorage();
  return {
    enabled: state.pin_enabled,
    failedCount: state.pin_failed_count,
    lockedUntil: state.pin_locked_until
  };
}

export async function enablePin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizePin(pin);
  if (normalized.length < 4 || normalized.length > 12) return { ok: false, error: "PIN 需为 4-12 位数字" };
  if (!crypto?.subtle) return { ok: false, error: "当前环境不支持 PIN 功能" };
  const salt = randomSaltHex();
  const hash = await sha256Hex(`${salt}:${normalized}`);
  writePinStorage({
    pin_enabled: true,
    pin_hash: hash,
    pin_salt: salt,
    pin_failed_count: 0,
    pin_locked_until: 0
  });
  return { ok: true };
}

export async function disablePin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const verified = await verifyPin(pin);
  if (!verified.ok) return verified;
  writePinStorage({
    pin_enabled: false,
    pin_hash: "",
    pin_salt: "",
    pin_failed_count: 0,
    pin_locked_until: 0
  });
  return { ok: true };
}

export async function verifyPin(pin: string): Promise<{ ok: boolean; error?: string; lockedUntil?: number }> {
  const state = readPinStorage();
  if (!state.pin_enabled) return { ok: true };
  const now = Date.now();
  if (state.pin_locked_until > now) {
    return { ok: false, error: "PIN 已临时锁定", lockedUntil: state.pin_locked_until };
  }
  const normalized = normalizePin(pin);
  if (!normalized) return { ok: false, error: "请输入 PIN" };
  const expected = state.pin_hash;
  const actual = await sha256Hex(`${state.pin_salt}:${normalized}`);
  if (expected && actual === expected) {
    writePinStorage({
      ...state,
      pin_failed_count: 0,
      pin_locked_until: 0
    });
    return { ok: true };
  }
  const nextFailed = state.pin_failed_count + 1;
  const lockMs = lockDurationMsByFailedCount(nextFailed);
  const lockedUntil = lockMs > 0 ? now + lockMs : 0;
  writePinStorage({
    ...state,
    pin_failed_count: nextFailed,
    pin_locked_until: lockedUntil
  });
  if (lockedUntil > now) {
    return { ok: false, error: "PIN 已临时锁定", lockedUntil };
  }
  return { ok: false, error: "PIN 错误" };
}

export async function changePin(currentPin: string, nextPin: string): Promise<{ ok: boolean; error?: string }> {
  const verified = await verifyPin(currentPin);
  if (!verified.ok) return { ok: false, error: verified.error };
  return enablePin(nextPin);
}

export function clearPinStatus() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(PIN_STORAGE_KEY);
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

async function saveSnapshotRow(key: string, snapshot: OfflineSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const normalized = normalizeOfflineSnapshot(snapshot);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    const store = tx.objectStore(SNAPSHOT_STORE);
    store.put({ key, value: cloneValue(normalized) } satisfies SnapshotRecord);
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

export async function saveOfflineSnapshotByOwner(ownerKey: OfflineOwnerKey, snapshot: OfflineSnapshot): Promise<void> {
  await saveSnapshotRow(ownerKey, snapshot);
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
    const req = store.getAll();
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
    const tx = db.transaction([SNAPSHOT_STORE, QUEUE_STORE, MEDIA_STORE], "readwrite");
    tx.objectStore(SNAPSHOT_STORE).clear();
    tx.objectStore(QUEUE_STORE).clear();
    tx.objectStore(MEDIA_STORE).clear();
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
    const req = store.getAll();
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const rows = (req.result as QueuedMutation[] | undefined) ?? [];
      const fallbackOwnerKey = ownerKey;
      resolve(
        rows
          .map((item) => normalizeQueuedMutation(item, fallbackOwnerKey))
          .filter((item) => item.ownerKey === ownerKey)
          .filter((item) => item.status === "dead_letter")
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
    const req = store.getAll();
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const rows = (req.result as QueuedMutation[] | undefined) ?? [];
      for (const row of rows) {
        if (row.ownerKey === ownerKey) store.delete(row.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function clearOfflineSnapshotByOwner(ownerKey: OfflineOwnerKey): Promise<void> {
  await deleteSnapshotRow(ownerKey);
}

export async function clearOfflineOwnerState(ownerKey: OfflineOwnerKey): Promise<void> {
  await Promise.all([
    clearOfflineSnapshotByOwner(ownerKey),
    clearOfflineMutationsByOwner(ownerKey),
    clearOfflineMediaAssetsByOwner(ownerKey)
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
    const req = store.getAll();
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
  const assets = await listOfflineMediaAssetsByOwner(ownerKey);
  return assets.filter((item) => item.status === "pending" && !item.deletedAt && item.blob);
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
    const req = store.getAll();
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const rows = (req.result as OfflineMediaAssetRecord[] | undefined) ?? [];
      for (const row of rows) {
        if (row.ownerKey === ownerKey) store.delete(row.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
