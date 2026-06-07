"use client";

import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LifeLayer } from "@/components/life-layer";
import { SettingsLayer } from "@/components/settings-layer";
import { AuthDialog, BindingDialog, PinGate } from "@/components/time-archive/auth";
import { useAuthGate, type SessionUser } from "@/components/time-archive/use-auth-gate";
import {
  AUTO_SEAL_SNOOZE_MS,
  isAutoSealSnoozed,
  loadAutoSealPreferences,
  pruneAutoSealPreferences,
  saveAutoSealPreferences,
  type AutoSealPreferences
} from "@/components/time-archive/auto-seal-preferences";
import { blobToBase64, readImageDimensions, sha256Hex, sha256HexForBlob } from "@/components/time-archive/browser-utils";
import { MobileBottomTab, TopTab } from "@/components/time-archive/navigation";
import { areOfflineMetaEqual } from "@/components/time-archive/offline-snapshot-meta";
import {
  canStartGlobalPullRefresh,
  PULL_REFRESH_MAX_DISTANCE_PX,
  PULL_REFRESH_THRESHOLD_PX
} from "@/components/time-archive/pull-refresh";
import { PullRefreshIndicator } from "@/components/time-archive/pull-refresh-indicator";
import type {
  BackupPreviewState,
  SyncRepairItemSummary,
  SyncRepairSummary,
  SyncStateResponse
} from "@/components/time-archive/sync-diagnostics-types";
import {
  getSyncModeLabel,
  getSyncPhaseLabel,
  getSyncSummary,
  type OfflineRuntimeState,
  type SyncSummary,
  type SyncPhase
} from "@/components/time-archive/sync-status";
import { SyncStatusPill } from "@/components/time-archive/sync-status-pill";
import {
  mapApiLifeDoubt,
  mapApiLifeNote,
  mapApiThinkingMeta,
  mapApiThinkingScratch,
  mapApiThinkingSpace,
  mapApiThinkingView,
  mapSyncSnapshotThinking,
  type ApiLifeDoubt,
  type ApiLifeNote,
  type ApiThinkingScratch,
  type ApiThinkingSpace,
  type ApiThinkingSpaceMeta,
  type ApiThinkingSpaceView,
  type SyncSnapshotResponse
} from "@/components/time-archive/api-mappers";
import {
  getPreferredSpaceIdForQueuedMutation,
  hasMeaningfulLocalData,
  normalizeStarPlacements,
  stableStringify,
  type UserExportPayload
} from "@/components/time-archive/sync-payload";
import {
  buildLocalSpaceExportMarkdown,
  buildSettleLetterLinesFromView,
  buildSpaceViewFromStore,
  collectUnreferencedMediaAssetIds,
  computeSpaceActivityIso,
  fromTrackParentId,
  getIncompleteSpaceIdsForExport,
  getSpaceLatestActivityTime,
  isSpaceViewConsistentWithStore,
  normalizeTrackList,
  normalizeThinkingMultilineText,
  sortSpacesByLatestActivity,
  syncStoreNodesFromView,
  withComputedSpaceActivity
} from "@/components/time-archive/thinking-view-store";
import type { StarMapStatePatch } from "@/components/thinking/star-map";
import { ThinkingLayer, type ThinkingSpaceView } from "@/components/thinking-layer";
import {
  clearLastUserMarker,
  clearOfflineOwnerState,
  clearOfflineMutationsByOwner,
  clearOfflineSnapshotByOwner,
  clearOfflineState,
  createOfflineSyncBackup,
  createOfflineSnapshotMeta,
  enqueueOfflineMutation,
  getGuestOwnerKey,
  getOrCreateLocalProfileId,
  getUserOwnerKey,
  isOfflineNetworkError,
  loadLastUserMarker,
  listDeadLetterMutationsByOwner,
  listOfflineMutationsByOwner,
  loadOfflineSnapshotByOwner,
  loadLatestOfflineSyncBackupByOwner,
  listOfflineMediaAssetsByOwner,
  listPendingOfflineMediaAssetsByOwner,
  removeOfflineMutation,
  saveLastUserMarker,
  saveOfflineSnapshotByOwner,
  saveOfflineMediaAsset,
  updateOfflineMutation,
  updateOfflineMediaAsset,
  type OfflineOwnerKey,
  type OfflineMediaAssetRecord,
  type OfflineSnapshot,
  type OfflineSnapshotMeta,
  type OfflineSyncBackupRecord,
  type QueuedMutation
} from "@/components/offline-store";
import { canUseCloudSync, isNativeAppRuntime } from "@/lib/capabilities";
import { API_CONNECTIVITY_EVENT, apiFetch, buildApiUrl } from "@/lib/api-client";
import {
  type LayerTab,
  type LifeDoubt,
  type LifeNoteSaveOptions,
  type ThinkingMediaAsset,
  type ThinkingSpace,
  type ThinkingSpaceMeta,
  type ThinkingStore,
  EMPTY_LIFE_STORE,
  EMPTY_THINKING_STORE,
  LIFE_STORAGE_KEY,
  MAX_ACTIVE_SPACES,
  OPENING_MS,
  THINKING_STORAGE_KEY,
  classifyDimension,
  createId,
  createStars,
  persistLifeStore,
  persistThinkingStore,
  pickDefaultSpaceId,
  normalizeThinkingStore,
  sanitizeTimeZone
} from "@/components/zhihuo-model";

type ThinkingJumpTarget = {
  spaceId: string;
  mode: "root";
  trackId?: string | null;
  nodeId?: string | null;
  doubtId?: string;
};

type BindingDialogState = {
  cloudPayload: UserExportPayload;
  submitting: boolean;
};

const RESTORE_OVER_LIMIT_NOTICE = "当前已有 7 个活跃空间，请先封存或删除一个活跃空间，再恢复这段思考";
const OFFLINE_RETRY_BASE_MS = 1200;
const CLOUD_SYNC_CHECK_INTERVAL_MS = 30 * 1000;
const AUTO_SEAL_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function TimeArchive() {
  const [tab, setTab] = useState<LayerTab>("life");
  const [hydrated, setHydrated] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [lifeStore, setLifeStore] = useState(EMPTY_LIFE_STORE);
  const [thinkingStore, setThinkingStore] = useState(EMPTY_THINKING_STORE);
  const [thinkingView, setThinkingView] = useState<ThinkingSpaceView | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [openingPhase, setOpeningPhase] = useState<"black" | "stars" | "text" | "ready">("black");
  const [lifeReady, setLifeReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [offlineSnapshotExists, setOfflineSnapshotExists] = useState(false);
  const [offlineMeta, setOfflineMeta] = useState<OfflineSnapshotMeta | null>(null);
  const [offlineRuntimeState, setOfflineRuntimeState] = useState<OfflineRuntimeState>("signed_out");
  const [activeOwnerKey, setActiveOwnerKey] = useState<OfflineOwnerKey | null>(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [thinkingFocusMode, setThinkingFocusMode] = useState(false);
  const [thinkingViewMode, setThinkingViewMode] = useState<"spaces" | "detail">("spaces");
  const [thinkingJumpTarget, setThinkingJumpTarget] = useState<ThinkingJumpTarget | null>(null);
  const [bindingDialog, setBindingDialog] = useState<BindingDialogState | null>(null);
  const [deadLetterMutations, setDeadLetterMutations] = useState<QueuedMutation[]>([]);
  const [offlineMediaAssets, setOfflineMediaAssets] = useState<OfflineMediaAssetRecord[]>([]);
  const [mediaAssetSources, setMediaAssetSources] = useState<Record<string, string>>({});
  const [pendingMutationCount, setPendingMutationCount] = useState(0);
  const [cloudRevision, setCloudRevision] = useState<number | null>(null);
  const [cloudServerTime, setCloudServerTime] = useState<string | null>(null);
  const [lastCloudCheckedAt, setLastCloudCheckedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [nextSyncRetryAt, setNextSyncRetryAt] = useState<number | null>(null);
  const [cloudLastSequence, setCloudLastSequence] = useState<number | null>(null);
  const [cloudRepairCount, setCloudRepairCount] = useState(0);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [lastCanonicalSyncError, setLastCanonicalSyncError] = useState<string | null>(null);
  const [lastRepairSummary, setLastRepairSummary] = useState<SyncRepairSummary | null>(null);
  const [serverRepairItems, setServerRepairItems] = useState<SyncRepairItemSummary[]>([]);
  const [lastOverwriteSummary, setLastOverwriteSummary] = useState<{
    revision: number | null;
    lastSequence: number | null;
    overwrittenAt: string;
    overwritten: { life: number; thinking: number; scratch: number } | null;
    verify: unknown;
  } | null>(null);
  const [latestSyncBackup, setLatestSyncBackup] = useState<OfflineSyncBackupRecord | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreviewState | null>(null);
  const [autoSealPreferences, setAutoSealPreferences] = useState<AutoSealPreferences>(() => loadAutoSealPreferences());
  const [autoSealPrompt, setAutoSealPrompt] = useState<{ spaceId: string; title: string; inactiveDays: number } | null>(null);
  const [autoSealBusySpaceId, setAutoSealBusySpaceId] = useState<string | null>(null);
  const [startupRecovering, setStartupRecovering] = useState(true);
  const [pullRefresh, setPullRefresh] = useState<{
    phase: "idle" | "pulling" | "ready" | "refreshing" | "done" | "offline";
    distance: number;
    message: string;
  }>({ phase: "idle", distance: 0, message: "" });

  const noticeTimerRef = useRef<number | null>(null);
  const thinkingViewCacheRef = useRef<Record<string, ThinkingSpaceView>>({});
  const offlineSyncingRef = useRef(false);
  const autoCloudRefreshInFlightRef = useRef(false);
  const userBootstrapRef = useRef<string | null>(null);
  const localProfileIdRef = useRef("");
  const mutationOrderRef = useRef(0);
  const bindingCheckUserIdRef = useRef<string | null>(null);
  const activeSpaceIdRef = useRef<string | null>(null);
  const latestRevisionRef = useRef<number | null>(null);
  const isOnlineRef = useRef(isOnline);
  const mediaObjectUrlsRef = useRef<string[]>([]);
  const pullRefreshStartYRef = useRef<number | null>(null);
  const pullRefreshActiveRef = useRef(false);
  const pullRefreshTriggeredRef = useRef(false);
  const [stars] = useState(() => createStars(36));

  const activeThinkingSpaceOptions = useMemo(
    () =>
      [...thinkingStore.spaces]
        .filter((space) => space.status === "active")
        .sort(sortSpacesByLatestActivity)
        .map((space) => ({ id: space.id, title: space.rootQuestionText })),
    [thinkingStore.spaces]
  );

  const showNotice = useCallback((message: string, duration = 1800) => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, duration);
  }, []);

  const markUnauthorizedSyncError = useCallback(() => {
    setLastSyncError("unauthorized");
  }, []);

  const {
    authReady,
    setAuthReady,
    sessionUser,
    setSessionUser,
    cloudSessionEnabled,
    setCloudSessionEnabled,
    pinReady,
    pinEnabled,
    pinLockedUntil,
    pinUnlocked,
    authDialogOpen,
    handleUnauthorized,
    handlePinVerified,
    handleEnablePin,
    handleDisablePin,
    handleChangePin,
    resetPinAfterForgot,
    openAuthDialog,
    closeAuthDialog
  } = useAuthGate({
    showNotice,
    onUnauthorized: markUnauthorizedSyncError
  });

  const updateAutoSealPreferences = useCallback((updater: (current: AutoSealPreferences) => AutoSealPreferences) => {
    setAutoSealPreferences((current) => {
      const next = updater(current);
      saveAutoSealPreferences(next);
      return next;
    });
  }, []);

  const setAutoSealRemindersDisabled = useCallback(
    (disabled: boolean) => {
      updateAutoSealPreferences((current) => ({
        ...current,
        disabled
      }));
      if (disabled) setAutoSealPrompt(null);
    },
    [updateAutoSealPreferences]
  );

  const snoozeAutoSealPrompt = useCallback(
    (spaceId: string) => {
      if (!spaceId) return;
      updateAutoSealPreferences((current) => ({
        ...current,
        snoozedUntilBySpaceId: {
          ...current.snoozedUntilBySpaceId,
          [spaceId]: new Date(Date.now() + AUTO_SEAL_SNOOZE_MS).toISOString()
        }
      }));
      setAutoSealPrompt((current) => (current?.spaceId === spaceId ? null : current));
      showNotice("已延后 7 天提醒");
    },
    [showNotice, updateAutoSealPreferences]
  );

  const disableAutoSealPrompts = useCallback(() => {
    updateAutoSealPreferences((current) => ({
      ...current,
      disabled: true
    }));
    setAutoSealPrompt(null);
    showNotice("自动封存提醒已关闭");
  }, [showNotice, updateAutoSealPreferences]);

  const applyOnlineState = useCallback((online: boolean) => {
    setIsOnline((current) => (current === online ? current : online));
  }, []);

  useEffect(() => {
    const nativeApp = isNativeAppRuntime();
    setIsNativeApp(nativeApp);
    setCloudSessionEnabled(true);
    setRuntimeReady(true);
  }, [setCloudSessionEnabled]);

  useEffect(() => {
    setAutoSealPreferences(loadAutoSealPreferences());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const activeSpaceIds = thinkingStore.spaces.filter((space) => space.status === "active").map((space) => space.id);
    updateAutoSealPreferences((current) => pruneAutoSealPreferences(current, activeSpaceIds));
  }, [hydrated, thinkingStore.spaces, updateAutoSealPreferences]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const cloudSyncEnabled = cloudSessionEnabled && canUseCloudSync(sessionUser);
  const guestOwnerKey = getGuestOwnerKey(localProfileIdRef.current || getOrCreateLocalProfileId());
  const currentUserOwnerKey = sessionUser ? getUserOwnerKey(sessionUser.userId) : null;
  const cloudSyncReady =
    cloudSyncEnabled &&
    offlineRuntimeState === "user_sync_ready" &&
    offlineMeta?.ownerMode === "user" &&
    offlineMeta.boundUserId === sessionUser?.userId &&
    activeOwnerKey === currentUserOwnerKey;
  const isBackupPreviewing = backupPreview !== null;
  const editingLocked =
    isBackupPreviewing ||
    offlineRuntimeState === "user_bootstrapping" ||
    offlineRuntimeState === "user_syncing" ||
    offlineRuntimeState === "binding_required" ||
    offlineRuntimeState === "switching_account";
  const hasTrackedLocalChanges = offlineMeta?.syncState.hasLocalChanges === true;
  const hasUnqueuedLocalChanges = hasTrackedLocalChanges && pendingMutationCount === 0;
  const syncModeLabel = useMemo(
    () =>
      getSyncModeLabel({
        cloudSyncReady,
        deadLetterCount: deadLetterMutations.length,
        hasTrackedLocalChanges,
        isBackupPreviewing,
        isOnline,
        lastSyncError,
        offlineRuntimeState,
        pendingMutationCount,
        sessionEmail: sessionUser?.email ?? null,
        syncPhase
      }),
    [
      cloudSyncReady,
      deadLetterMutations.length,
      hasTrackedLocalChanges,
      isBackupPreviewing,
      isOnline,
      lastSyncError,
      offlineRuntimeState,
      pendingMutationCount,
      sessionUser,
      syncPhase
    ]
  );
  const syncPhaseLabel = useMemo(() => getSyncPhaseLabel(syncPhase), [syncPhase]);
  const syncSummary = useMemo<SyncSummary>(
    () =>
      getSyncSummary({
        cloudSyncReady,
        deadLetterCount: deadLetterMutations.length,
        hasTrackedLocalChanges,
        isBackupPreviewing,
        isOnline,
        lastSyncError,
        offlineRuntimeState,
        pendingMutationCount,
        sessionEmail: sessionUser?.email ?? null,
        syncPhase
      }),
    [
      cloudSyncReady,
      deadLetterMutations.length,
      hasTrackedLocalChanges,
      isBackupPreviewing,
      isOnline,
      lastSyncError,
      offlineRuntimeState,
      pendingMutationCount,
      sessionUser?.email,
      syncPhase
    ]
  );
  const syncIssueMutations = deadLetterMutations;
  const syncWarning = useMemo(() => {
    if (hasUnqueuedLocalChanges) {
      return "本机有改动还没有准备好同步。已先保留在本机，可在高级同步诊断里查看。";
    }
    if (lastSyncError === "unauthorized") return "登录已过期，需要重新登录";
    if (lastSyncError) {
      const retryText =
        typeof nextSyncRetryAt === "number" && Number.isFinite(nextSyncRetryAt)
          ? `，将在 ${new Date(nextSyncRetryAt).toLocaleTimeString("zh-CN")} 后重试`
          : "";
      return `云端暂时连不上${retryText}。本机内容会先保留。`;
    }
    if (lastCanonicalSyncError) return "云端整理时遇到异常，本机内容会先保留。";
    if (
      cloudSyncReady &&
      typeof cloudRevision === "number" &&
      typeof offlineMeta?.revision === "number" &&
      cloudRevision !== offlineMeta.revision &&
      offlineMeta.syncState.hasLocalChanges !== true
    ) {
      return "云端有新内容，系统会继续尝试整理同步。";
    }
    if (
      cloudSyncReady &&
      pendingMutationCount > 0 &&
      offlineMeta?.syncState.lastSyncedAt &&
      Date.now() - new Date(offlineMeta.syncState.lastSyncedAt).getTime() > 60 * 1000
    ) {
      return `有 ${pendingMutationCount} 条改动还没同步，连上网后会自动处理。`;
    }
    return null;
  }, [
    cloudRevision,
    cloudSyncReady,
    hasUnqueuedLocalChanges,
    lastCanonicalSyncError,
    lastSyncError,
    nextSyncRetryAt,
    offlineMeta,
    pendingMutationCount
  ]);
  const syncDiagnosticsReport = useMemo(
    () =>
      JSON.stringify(
        {
          mode: syncModeLabel,
          runtime_state: offlineRuntimeState,
          active_owner_key: activeOwnerKey,
          current_user_owner_key: currentUserOwnerKey,
          cloud_sync_enabled: cloudSyncEnabled,
          cloud_sync_ready: cloudSyncReady,
          phase_label: syncPhaseLabel,
          local_revision: offlineMeta?.revision ?? null,
          cloud_revision: cloudRevision,
          cloud_last_sequence: cloudLastSequence,
          cloud_repair_count: cloudRepairCount,
          cloud_server_time: cloudServerTime,
          last_cloud_checked_at: lastCloudCheckedAt,
          pending_mutations: pendingMutationCount,
          visible_pending_changes: pendingMutationCount > 0 ? pendingMutationCount : hasTrackedLocalChanges ? 1 : 0,
          unqueued_local_changes: hasUnqueuedLocalChanges,
          offline_media_pending: offlineMediaAssets.filter((asset) => asset.status === "pending").length,
          dead_letters: deadLetterMutations.length,
          unmerged_items: serverRepairItems.map((item) => ({
            id: item.id,
            op: item.op,
            reason: item.reason,
            created_at: item.createdAt,
            client_mutation_id: item.clientMutationId,
            payload: item.payload
          })),
          last_synced_at: offlineMeta?.syncState.lastSyncedAt ?? null,
          has_local_changes: offlineMeta?.syncState.hasLocalChanges === true,
          sync_phase: syncPhase,
          warning: syncWarning,
          last_sync_error: lastSyncError,
          next_retry_at:
            typeof nextSyncRetryAt === "number" && Number.isFinite(nextSyncRetryAt)
              ? new Date(nextSyncRetryAt).toISOString()
              : null,
          latest_backup: latestSyncBackup
            ? {
                id: latestSyncBackup.id,
                created_at: latestSyncBackup.createdAt,
                reason: latestSyncBackup.reason,
                mutation_count: latestSyncBackup.mutations.length,
                media_count: latestSyncBackup.mediaAssets.length
              }
            : null,
          last_overwrite: lastOverwriteSummary,
          last_repair: lastRepairSummary
        },
        null,
        2
      ),
    [
      cloudLastSequence,
      cloudRepairCount,
      cloudRevision,
      cloudServerTime,
      activeOwnerKey,
      cloudSyncEnabled,
      cloudSyncReady,
      currentUserOwnerKey,
      hasTrackedLocalChanges,
      hasUnqueuedLocalChanges,
      lastCloudCheckedAt,
      lastOverwriteSummary,
      lastRepairSummary,
      lastSyncError,
      latestSyncBackup,
      nextSyncRetryAt,
      offlineMeta,
      offlineMediaAssets,
      offlineRuntimeState,
      pendingMutationCount,
      deadLetterMutations.length,
      serverRepairItems,
      syncModeLabel,
      syncPhaseLabel,
      syncPhase,
      syncWarning
    ]
  );

  const updateOfflineMeta = useCallback((updater: (current: OfflineSnapshotMeta) => OfflineSnapshotMeta) => {
    setOfflineMeta((current) => {
      const fallback = createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId());
      const base = current ?? fallback;
      const next = updater(base);
      return areOfflineMetaEqual(base, next) ? base : next;
    });
  }, []);

  useEffect(() => {
    if (typeof offlineMeta?.revision === "number" && Number.isFinite(offlineMeta.revision)) {
      latestRevisionRef.current = offlineMeta.revision;
    }
  }, [offlineMeta?.revision]);

  const markLocalChange = useCallback(() => {
    updateOfflineMeta((current) => ({
      ...current,
      syncState: {
        ...current.syncState,
        hasLocalChanges: true
      }
    }));
  }, [updateOfflineMeta]);

  const refreshLatestSyncBackup = useCallback(async (ownerKey: OfflineOwnerKey | null = activeOwnerKey) => {
    if (!ownerKey) {
      setLatestSyncBackup(null);
      return null;
    }
    const backup = await loadLatestOfflineSyncBackupByOwner(ownerKey);
    setLatestSyncBackup(backup);
    return backup;
  }, [activeOwnerKey]);

  useEffect(() => {
    void refreshLatestSyncBackup(activeOwnerKey);
  }, [activeOwnerKey, refreshLatestSyncBackup]);

  const refreshPendingMutationCount = useCallback(async (ownerKey: OfflineOwnerKey | null, includeDeferred = true) => {
    if (!ownerKey) {
      setPendingMutationCount(0);
      setNextSyncRetryAt(null);
      return 0;
    }
    const items = await listOfflineMutationsByOwner(ownerKey, includeDeferred ? Number.MAX_SAFE_INTEGER : Date.now());
    setPendingMutationCount(items.length);
    const now = Date.now();
    const retryAt =
      items
        .map((item) => item.nextRetryAt)
        .filter((value) => Number.isFinite(value) && value > now && value < Number.MAX_SAFE_INTEGER)
        .sort((a, b) => a - b)[0] ?? null;
    setNextSyncRetryAt(retryAt);
    return items.length;
  }, []);

  const refreshDeadLetterMutations = useCallback(async (ownerKey: OfflineOwnerKey | null) => {
    if (!ownerKey) {
      setDeadLetterMutations([]);
      return;
    }
    const items = await listDeadLetterMutationsByOwner(ownerKey);
    setDeadLetterMutations(items);
  }, []);

  const refreshOfflineMediaAssets = useCallback(async (ownerKey: OfflineOwnerKey | null) => {
    if (!ownerKey) {
      setOfflineMediaAssets([]);
      return [];
    }
    const items = await listOfflineMediaAssetsByOwner(ownerKey);
    setOfflineMediaAssets(items);
    return items;
  }, []);

  const syncThinkingMediaAssetState = useCallback((asset: ThinkingMediaAsset) => {
    setThinkingStore((prev) => {
      const index = prev.mediaAssets.findIndex((item) => item.id === asset.id);
      const nextMediaAssets = [...prev.mediaAssets];
      if (index >= 0) nextMediaAssets[index] = asset;
      else nextMediaAssets.unshift(asset);
      return { ...prev, mediaAssets: nextMediaAssets };
    });
  }, []);

  const markMediaAssetsDeletedLocally = useCallback(
    async (assetIds: string[]) => {
      const uniqueAssetIds = [...new Set(assetIds.filter((assetId) => typeof assetId === "string" && assetId.trim()))];
      if (!uniqueAssetIds.length) return;
      const deletedAt = new Date().toISOString();
      await Promise.all(uniqueAssetIds.map((assetId) => updateOfflineMediaAsset(assetId, { deletedAt })));
      await refreshOfflineMediaAssets(activeOwnerKey);
    },
    [activeOwnerKey, refreshOfflineMediaAssets]
  );

  const uploadThinkingMediaAssetBinary = useCallback(
    async (
      file: Blob,
      options: { assetId: string; fileName: string; mimeType: string; width: number | null; height: number | null }
    ) => {
      const formData = new FormData();
      formData.append("file", file, options.fileName);
      formData.append("asset_id", options.assetId);
      formData.append("file_name", options.fileName);
      formData.append("mime_type", options.mimeType);
      if (typeof options.width === "number") formData.append("width", String(options.width));
      if (typeof options.height === "number") formData.append("height", String(options.height));
      const response = await apiFetch("/v1/thinking/media/upload", {
        method: "POST",
        body: formData
      });
      if (handleUnauthorized(response)) return null;
      if (!response.ok) return null;
      const payload = (await response.json().catch(() => ({}))) as {
        asset_id?: string;
        file_name?: string;
        mime_type?: string;
        byte_size?: number;
        sha256?: string;
        width?: number | null;
        height?: number | null;
        uploaded_at?: string;
      };
      if (typeof payload.asset_id !== "string") return null;
      return {
        id: payload.asset_id,
        fileName: typeof payload.file_name === "string" ? payload.file_name : options.fileName,
        mimeType: typeof payload.mime_type === "string" ? payload.mime_type : options.mimeType,
        byteSize: Number.isFinite(payload.byte_size) ? Number(payload.byte_size) : file.size,
        sha256: typeof payload.sha256 === "string" ? payload.sha256 : "",
        width: Number.isFinite(payload.width) ? Number(payload.width) : options.width,
        height: Number.isFinite(payload.height) ? Number(payload.height) : options.height,
        createdAt: new Date().toISOString(),
        uploadedAt: typeof payload.uploaded_at === "string" ? payload.uploaded_at : new Date().toISOString(),
        deletedAt: null
      } satisfies ThinkingMediaAsset;
    },
    [handleUnauthorized]
  );

  const syncPendingOfflineMediaAssets = useCallback(
    async (ownerKey: OfflineOwnerKey | null) => {
      if (!ownerKey || !ownerKey.startsWith("user:")) return true;
      const pendingAssets = await listPendingOfflineMediaAssetsByOwner(ownerKey);
      for (const asset of pendingAssets) {
        if (!asset.blob) continue;
        try {
          const uploadedAsset = await uploadThinkingMediaAssetBinary(asset.blob, {
            assetId: asset.id,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height
          });
          if (!uploadedAsset) {
            await updateOfflineMediaAsset(asset.id, {
              status: "dead_letter",
              lastError: "upload_rejected"
            });
            continue;
          }
          await updateOfflineMediaAsset(asset.id, {
            status: "uploaded",
            remoteUrl: buildApiUrl(`/v1/thinking/media/${uploadedAsset.id}`),
            uploadedAt: uploadedAsset.uploadedAt,
            lastError: null,
            blob: null,
            byteSize: uploadedAsset.byteSize,
            sha256: uploadedAsset.sha256
          });
          syncThinkingMediaAssetState(uploadedAsset);
        } catch (error) {
          await updateOfflineMediaAsset(asset.id, {
            lastError: error instanceof Error ? error.message : String(error)
          });
          return false;
        }
      }
      await refreshOfflineMediaAssets(ownerKey);
      return true;
    },
    [refreshOfflineMediaAssets, syncThinkingMediaAssetState, uploadThinkingMediaAssetBinary]
  );

  useEffect(() => {
    if (!hydrated) return;
    void refreshOfflineMediaAssets(activeOwnerKey);
  }, [activeOwnerKey, hydrated, refreshOfflineMediaAssets]);

  useEffect(() => {
    for (const url of mediaObjectUrlsRef.current) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    const nextSources: Record<string, string> = {};
    const nextObjectUrls: string[] = [];
    const seenAssetIds = new Set<string>();
    const mediaAssets = Array.isArray(thinkingStore.mediaAssets) ? thinkingStore.mediaAssets : [];
    for (const asset of offlineMediaAssets) {
      if (asset.deletedAt) continue;
      seenAssetIds.add(asset.id);
      if (asset.blob) {
        const url = URL.createObjectURL(asset.blob);
        nextSources[asset.id] = url;
        nextObjectUrls.push(url);
        continue;
      }
      nextSources[asset.id] = asset.remoteUrl ?? buildApiUrl(`/v1/thinking/media/${asset.id}`);
    }
    for (const asset of mediaAssets) {
      if (asset.deletedAt || seenAssetIds.has(asset.id)) continue;
      nextSources[asset.id] = buildApiUrl(`/v1/thinking/media/${asset.id}`);
    }
    mediaObjectUrlsRef.current = nextObjectUrls;
    setMediaAssetSources(nextSources);
    return () => {
      for (const url of nextObjectUrls) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, [offlineMediaAssets, thinkingStore.mediaAssets]);

  const syncRevisionFromServer = useCallback(
    async (userId?: string | null) => {
      if (!userId) return null;
      try {
        const response = await apiFetch("/v1/sync/state", { method: "GET", cache: "no-store" });
        setLastCloudCheckedAt(new Date().toISOString());
        if (!response.ok) {
          setLastSyncError(`state_status_${response.status}`);
          return null;
        }
        const payload = (await response.json()) as SyncStateResponse;
        const revision = Number.isFinite(payload.revision) ? Number(payload.revision) : null;
        setCloudRevision(revision);
        setCloudLastSequence(Number.isFinite(payload.lastSequence) ? Number(payload.lastSequence) : null);
        setCloudRepairCount(Number.isFinite(payload.repairCount) ? Number(payload.repairCount) : 0);
        setCloudServerTime(
          typeof payload.server_time === "string"
            ? payload.server_time
            : typeof payload.serverTime === "string"
              ? payload.serverTime
              : null
        );
        setLastSyncError(null);
        if (revision === null) return null;
        updateOfflineMeta((current) => ({
          ...current,
          ownerMode: "user",
          boundUserId: userId,
          revision,
          completeness: current.completeness === "complete" ? "complete" : current.completeness
        }));
        return revision;
      } catch {
        return null;
      }
    },
    [updateOfflineMeta]
  );

  const refreshCloudSyncState = useCallback(
    async (userId?: string | null, options?: { showCheckingPhase?: boolean }) => {
      if (!userId) {
        setCloudRevision(null);
        setCloudLastSequence(null);
        setCloudRepairCount(0);
        setCloudServerTime(null);
        setLastCloudCheckedAt(null);
        return null;
      }
      try {
        if (options?.showCheckingPhase) {
          setSyncPhase((current) =>
            current === "push" || current === "bootstrap" || current === "repairing" || current === "conflict" ? current : "checking"
          );
        }
        const response = await apiFetch("/v1/sync/state", { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) {
          setLastSyncError("unauthorized");
          setSyncPhase("error");
          return null;
        }
        if (!response.ok) {
          setLastCloudCheckedAt(new Date().toISOString());
          setLastSyncError(`state_status_${response.status}`);
          setNextSyncRetryAt(Date.now() + CLOUD_SYNC_CHECK_INTERVAL_MS);
          setSyncPhase("error");
          return null;
        }
        const payload = (await response.json().catch(() => null)) as SyncStateResponse | null;
        setLastCloudCheckedAt(new Date().toISOString());
        if (!payload) {
          setLastSyncError("state_payload_invalid");
          setNextSyncRetryAt(Date.now() + CLOUD_SYNC_CHECK_INTERVAL_MS);
          setSyncPhase("error");
          return null;
        }
        const nextRevision = Number.isFinite(payload.revision) ? Number(payload.revision) : null;
        setCloudRevision(nextRevision);
        setCloudLastSequence(Number.isFinite(payload.lastSequence) ? Number(payload.lastSequence) : null);
        setCloudRepairCount(Number.isFinite(payload.repairCount) ? Number(payload.repairCount) : 0);
        setCloudServerTime(
          typeof payload.server_time === "string"
            ? payload.server_time
            : typeof payload.serverTime === "string"
              ? payload.serverTime
              : null
        );
        setLastSyncError(null);
        return nextRevision;
      } catch (error) {
        setLastCloudCheckedAt(new Date().toISOString());
        setLastSyncError(error instanceof Error ? error.message : String(error));
        setNextSyncRetryAt(Date.now() + CLOUD_SYNC_CHECK_INTERVAL_MS);
        setSyncPhase("error");
        return null;
      }
    },
    [handleUnauthorized]
  );

  const markCloudSynced = useCallback(
    (userId?: string | null, revision?: number | null, options?: { hasLocalChanges?: boolean }) => {
      const nextRevision =
        typeof revision === "number" && Number.isFinite(revision)
          ? revision
          : userId
            ? Math.max(0, latestRevisionRef.current ?? 0) + 1
            : latestRevisionRef.current;
      if (typeof nextRevision === "number" && Number.isFinite(nextRevision)) {
        latestRevisionRef.current = nextRevision;
      }
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: userId ? "user" : current.ownerMode,
        boundUserId: userId ?? current.boundUserId,
        revision: typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : current.revision,
        completeness: "complete",
        syncState: {
          ...current.syncState,
          lastSyncedAt: new Date().toISOString(),
          hasLocalChanges: options?.hasLocalChanges === true,
          bindingRequired: false
        }
      }));
      if (userId && (typeof revision !== "number" || !Number.isFinite(revision))) {
        void syncRevisionFromServer(userId);
      }
    },
    [syncRevisionFromServer, updateOfflineMeta]
  );

  const setRevisionBaseline = useCallback(
    (userId: string, revision: number) => {
      if (!Number.isFinite(revision)) return;
      latestRevisionRef.current = revision;
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: "user",
        boundUserId: userId,
        revision,
        completeness: current.syncState.hasLocalChanges ? "partial" : current.completeness
      }));
    },
    [updateOfflineMeta]
  );

  const applySnapshotToState = useCallback(
    (snapshot: {
      lifeStore: typeof EMPTY_LIFE_STORE;
      thinkingStore: ThinkingStore;
      activeSpaceId: string | null;
      thinkingViews?: Record<string, ThinkingSpaceView>;
      meta: OfflineSnapshotMeta;
    }) => {
      const normalizedThinkingStore = normalizeThinkingStore(snapshot.thinkingStore);
      const initialSpaceId = snapshot.activeSpaceId ?? pickDefaultSpaceId(normalizedThinkingStore.spaces);
      const cachedInitialView = initialSpaceId ? snapshot.thinkingViews?.[initialSpaceId] ?? null : null;
      const initialView = isSpaceViewConsistentWithStore(normalizedThinkingStore, initialSpaceId ?? "", cachedInitialView)
        ? cachedInitialView
        : initialSpaceId
          ? buildSpaceViewFromStore(normalizedThinkingStore, initialSpaceId)
          : null;
      setLifeStore(snapshot.lifeStore);
      setThinkingStore(normalizedThinkingStore);
      setActiveSpaceId(initialSpaceId);
      thinkingViewCacheRef.current = snapshot.thinkingViews ?? {};
      if (initialSpaceId && initialView) thinkingViewCacheRef.current[initialSpaceId] = initialView;
      setThinkingView(initialView);
      setOfflineMeta(snapshot.meta);
      setOfflineSnapshotExists(
        hasMeaningfulLocalData(snapshot.lifeStore, normalizedThinkingStore) ||
          Object.keys(snapshot.thinkingViews ?? {}).length > 0
      );
    },
    []
  );

  const resetArchiveState = useCallback(
    (ownerMeta: OfflineSnapshotMeta) => {
      thinkingViewCacheRef.current = {};
      setThinkingView(null);
      setActiveSpaceId(null);
      setLifeStore((prev) => ({ ...EMPTY_LIFE_STORE, meta: prev.meta }));
      setThinkingStore((prev) => ({
        ...EMPTY_THINKING_STORE,
        timezone: prev.timezone,
        fixedTopSpacesEnabled: prev.fixedTopSpacesEnabled,
        fixedTopSpaceIds: []
      }));
      setOfflineMeta(ownerMeta);
      setOfflineSnapshotExists(false);
    },
    []
  );

  const loadOwnerSnapshot = useCallback(
    async (ownerKey: OfflineOwnerKey, fallbackMeta: OfflineSnapshotMeta) => {
      const snapshot = await loadOfflineSnapshotByOwner(ownerKey);
      if (snapshot) {
        applySnapshotToState({
          ...snapshot,
          meta: snapshot.meta ?? fallbackMeta
        });
        return snapshot;
      }
      resetArchiveState(fallbackMeta);
      return null;
    },
    [applySnapshotToState, resetArchiveState]
  );

  const buildLocalExportPayload = useCallback(
    async (user: SessionUser, ownerKey: OfflineOwnerKey | null): Promise<UserExportPayload> => {
      const storedMediaAssets = ownerKey ? await listOfflineMediaAssetsByOwner(ownerKey) : offlineMediaAssets;
      const mediaAssetsById = new Map(storedMediaAssets.map((asset) => [asset.id, asset]));
      const fallbackOwnerKey = ownerKey ?? getUserOwnerKey(user.userId);
      for (const asset of thinkingStore.mediaAssets) {
        if (mediaAssetsById.has(asset.id)) continue;
        mediaAssetsById.set(asset.id, {
          id: asset.id,
          ownerKey: fallbackOwnerKey,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          status: "uploaded",
          blob: null,
          remoteUrl: buildApiUrl(`/v1/thinking/media/${asset.id}`),
          createdAt: asset.createdAt,
          updatedAt: asset.uploadedAt ?? asset.createdAt,
          uploadedAt: asset.uploadedAt ?? asset.createdAt,
          deletedAt: asset.deletedAt,
          lastError: null
        });
      }
      const mediaAssets = [...mediaAssetsById.values()];
      const serializableMediaAssets = await Promise.all(
        mediaAssets
          .filter((asset) => !asset.deletedAt)
          .map(async (asset) => {
            let blob = asset.blob;
            if (!blob && asset.remoteUrl) {
              try {
                const response = await apiFetch(asset.remoteUrl, { method: "GET", cache: "no-store" });
                if (response.ok) blob = await response.blob();
              } catch {
                blob = null;
              }
            }
            if (!blob && asset.status === "pending" && !asset.remoteUrl && !asset.uploadedAt) return null;
            return {
              id: asset.id,
              user_id: user.userId,
              file_name: asset.fileName,
              mime_type: asset.mimeType,
              byte_size: asset.byteSize,
              sha256: asset.sha256,
              width: asset.width,
              height: asset.height,
              created_at: asset.createdAt,
              uploaded_at: asset.uploadedAt,
              deleted_at: asset.deletedAt,
              content_base64: blob ? await blobToBase64(blob) : ""
            };
          })
      );
      const viewNodeById = new Map<string, { noteText?: string | null; answerText?: string | null }>();
      for (const view of Object.values(thinkingViewCacheRef.current)) {
        for (const track of view.tracks) {
          for (const node of track.nodes) {
            viewNodeById.set(node.id, { noteText: node.noteText, answerText: node.answerText });
          }
        }
      }

      return {
        version: "2026-03-03",
        exported_at: new Date().toISOString(),
        user_id: user.userId,
        user_email: user.email,
        life: {
          doubts: lifeStore.doubts.map((item) => ({
            id: item.id,
            raw_text: item.rawText,
            first_node_preview: item.firstNodePreview,
            last_node_preview: item.lastNodePreview,
            letter_title: item.letterTitle ?? null,
            letter_lines: item.letterLines ?? [],
            letter_variant: item.letterVariant ?? null,
            letter_seal_text: item.letterSealText ?? null,
            created_at: item.createdAt,
            archived_at: item.archivedAt,
            deleted_at: item.deletedAt
          })),
          notes: lifeStore.notes.map((item) => ({
            id: item.id,
            doubt_id: item.doubtId,
            note_text: item.noteText,
            created_at: item.createdAt
          }))
        },
        thinking: {
          spaces: thinkingStore.spaces.map((item) => ({
            id: item.id,
            userId: user.userId,
            rootQuestionText: item.rootQuestionText,
            status: item.status,
            createdAt: item.createdAt,
            lastActivityAt: item.lastActivityAt ?? computeSpaceActivityIso(item, thinkingStore.nodes),
            writtenToTimeAt: item.writtenToTimeAt,
            sourceTimeDoubtId: item.sourceTimeDoubtId
          })),
          nodes: thinkingStore.nodes.map((item) => ({
            id: item.id,
            spaceId: item.spaceId,
            parentNodeId: item.parentNodeId,
            rawQuestionText: item.rawQuestionText,
            imageAssetId: item.imageAssetId ?? null,
            noteText: viewNodeById.get(item.id)?.noteText ?? null,
            answerText: viewNodeById.get(item.id)?.answerText ?? null,
            createdAt: item.createdAt,
            orderIndex: item.orderIndex,
            isSuggested: item.isSuggested,
            state: item.state,
            dimension: item.dimension
          })),
          space_meta: thinkingStore.spaceMeta.map((item) => ({
            spaceId: item.spaceId,
            exportVersion: item.exportVersion,
            backgroundText: item.backgroundText ?? null,
            backgroundVersion: item.backgroundVersion ?? 0,
            backgroundAssetIds: item.backgroundAssetIds ?? [],
            backgroundSelectedAssetId: item.backgroundSelectedAssetId ?? null,
            suggestionDecay: item.suggestionDecay ?? 0,
            lastTrackId: item.lastTrackId ?? null,
            lastOrganizedOrder: item.lastOrganizedOrder ?? -1,
            parkingTrackId: item.parkingTrackId ?? null,
            pendingTrackId: item.pendingTrackId ?? null,
            emptyTrackIds: item.emptyTrackIds ?? [],
            starMapSceneSignature: item.starMapSceneSignature ?? null,
            starMapCuratedScene: item.starMapCuratedScene ?? null,
            starMapCuratedAt: item.starMapCuratedAt ?? null,
            starMapStarPlacements: item.starMapStarPlacements ?? {},
            starMapPlacementsSignature: item.starMapPlacementsSignature ?? null,
            starMapPlacementsUpdatedAt: item.starMapPlacementsUpdatedAt ?? null
          })),
          inbox: thinkingStore.inbox,
          scratch: thinkingStore.scratch.map((item) => ({
            id: item.id,
            userId: user.userId,
            rawText: item.rawText,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            archivedAt: item.archivedAt,
            deletedAt: item.deletedAt,
            derivedSpaceId: item.derivedSpaceId,
            fedTimeDoubtId: item.fedTimeDoubtId
          })),
          media_assets: serializableMediaAssets.filter(
            (item): item is NonNullable<(typeof serializableMediaAssets)[number]> => Boolean(item)
          )
        },
        audit: []
      };
    },
    [
      lifeStore.doubts,
      lifeStore.notes,
      offlineMediaAssets,
      thinkingStore.inbox,
      thinkingStore.mediaAssets,
      thinkingStore.nodes,
      thinkingStore.scratch,
      thinkingStore.spaceMeta,
      thinkingStore.spaces
    ]
  );

  const getLocalSpaceView = useCallback(
    (spaceId: string) => {
      const cached = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (isSpaceViewConsistentWithStore(thinkingStore, spaceId, cached)) return cached;
      const rebuilt = buildSpaceViewFromStore(thinkingStore, spaceId);
      if (rebuilt) thinkingViewCacheRef.current[spaceId] = rebuilt;
      else delete thinkingViewCacheRef.current[spaceId];
      return rebuilt;
    },
    [thinkingStore, thinkingView]
  );

  const commitLocalSpaceView = useCallback(
    (spaceId: string, nextView: ThinkingSpaceView | null) => {
      if (nextView && nextView.spaceId !== spaceId) return;
      if (nextView) thinkingViewCacheRef.current[spaceId] = nextView;
      else delete thinkingViewCacheRef.current[spaceId];
      if ((thinkingView?.spaceId === spaceId || activeSpaceId === spaceId) && nextView !== thinkingView) {
        setThinkingView(nextView);
      }
      if (!nextView && (thinkingView?.spaceId === spaceId || activeSpaceId === spaceId)) {
        setThinkingView(null);
      }
    },
    [activeSpaceId, thinkingView]
  );

  const syncAuth = useCallback(async () => {
    try {
      const response = await apiFetch("/v1/auth/me", { method: "GET", cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          setSessionUser(null);
          clearLastUserMarker();
          setOfflineRuntimeState("guest_ready");
        }
        setAuthReady(true);
        return false;
      }
      const payload = (await response.json()) as { user_id?: string; email?: string };
      if (typeof payload.user_id !== "string" || typeof payload.email !== "string") {
        setSessionUser(null);
        clearLastUserMarker();
        setAuthReady(true);
        return false;
      }
      const nextUser = { userId: payload.user_id, email: payload.email };
      setSessionUser(nextUser);
      saveLastUserMarker(nextUser);
      setLastSyncError((current) => (current === "unauthorized" ? null : current));
      setAuthReady(true);
      return true;
    } catch (error) {
      if (!isOfflineNetworkError(error)) {
        setSessionUser(null);
      } else {
        setOfflineRuntimeState((current) =>
          current === "user_sync_ready" || current === "user_syncing" || current === "user_bootstrapping"
            ? "user_offline_ready"
            : current
        );
      }
      setAuthReady(true);
      return false;
    }
  }, [setAuthReady, setSessionUser]);

  const _syncLifeFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/doubts?range=all&include_notes=true", {
          method: "GET",
          cache: "no-store"
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          if (!silent) showNotice("时间档案同步失败");
          return false;
        }
        const payload = (await response.json()) as { doubts?: ApiLifeDoubt[]; notes?: ApiLifeNote[] };
        const nextDoubts = Array.isArray(payload.doubts) ? payload.doubts.map(mapApiLifeDoubt) : [];
        const nextNotes = Array.isArray(payload.notes) ? payload.notes.map(mapApiLifeNote) : [];
        setLifeStore((prev) => ({
          ...prev,
          doubts: nextDoubts,
          notes: nextNotes
        }));
        return true;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice]
  );

  const _syncThinkingSpacesFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/thinking/spaces", { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) {
          if (!silent) showNotice("思考空间同步失败");
          return [];
        }
        const payload = (await response.json()) as {
          spaces?: ApiThinkingSpace[];
          space_meta?: ApiThinkingSpaceMeta[];
        };
        const spaces = Array.isArray(payload.spaces) ? payload.spaces.map(mapApiThinkingSpace) : [];
        const spaceMeta = Array.isArray(payload.space_meta) ? payload.space_meta.map(mapApiThinkingMeta) : [];
        setThinkingStore((prev) => ({
          ...prev,
          spaces,
          spaceMeta
        }));
        return spaces;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return [];
      }
    },
    [handleUnauthorized, showNotice]
  );

  const _syncThinkingScratchFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/thinking/scratch", { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) {
          if (!silent) showNotice("随记同步失败");
          return [];
        }
        const payload = (await response.json()) as { scratch?: ApiThinkingScratch[] };
        const scratch = Array.isArray(payload.scratch) ? payload.scratch.map(mapApiThinkingScratch) : [];
        setThinkingStore((prev) => ({
          ...prev,
          scratch
        }));
        return scratch;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return [];
      }
    },
    [handleUnauthorized, showNotice]
  );

  const _loadThinkingViewFromApi = useCallback(
    async (spaceId: string, silent = false) => {
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          if (response.status === 404 && activeSpaceIdRef.current === spaceId) setThinkingView(null);
          else if (!silent) showNotice("思考详情加载失败");
          return false;
        }
        const payload = (await response.json()) as ApiThinkingSpaceView;
        const mappedView = mapApiThinkingView(payload);
        thinkingViewCacheRef.current[mappedView.spaceId] = mappedView;
        if (activeSpaceIdRef.current === mappedView.spaceId) {
          setThinkingView(mappedView);
        }
        const latestSpace = mapApiThinkingSpace(payload.root);
        setThinkingStore((prev) => {
          const index = prev.spaces.findIndex((space) => space.id === latestSpace.id);
          const nextSpaces = [...prev.spaces];
          if (index >= 0) {
            nextSpaces[index] = {
              ...nextSpaces[index],
              ...latestSpace
            };
          } else {
            nextSpaces.unshift(latestSpace);
          }
          const viewNodeIds = new Set<string>();
          const nextNodes = prev.nodes.filter((node) => {
            if (node.spaceId !== mappedView.spaceId) return true;
            return false;
          });
          for (const track of mappedView.tracks) {
            for (let indexWithinTrack = 0; indexWithinTrack < track.nodes.length; indexWithinTrack += 1) {
              const node = track.nodes[indexWithinTrack];
              if (viewNodeIds.has(node.id)) continue;
              viewNodeIds.add(node.id);
              nextNodes.push({
                id: node.id,
                spaceId: mappedView.spaceId,
                parentNodeId: `track:${track.id}`,
                rawQuestionText: node.questionText,
                imageAssetId: node.imageAssetId ?? null,
                createdAt: node.createdAt ?? new Date().toISOString(),
                orderIndex: indexWithinTrack,
                isSuggested: node.isSuggested,
                state: "normal",
                dimension: node.dimension
              });
            }
          }
          return {
            ...prev,
            spaces: nextSpaces,
            nodes: nextNodes
          };
        });
        return true;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice]
  );

  const _fetchCloudExport = useCallback(async () => {
    const response = await apiFetch("/v1/system/export", { method: "GET", cache: "no-store" });
    if (handleUnauthorized(response) || !response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { payload?: UserExportPayload; checksum?: string } | null;
    if (!payload?.payload || typeof payload.checksum !== "string") return null;
    return payload;
  }, [handleUnauthorized]);

  const fetchSyncSnapshot = useCallback(async () => {
    const response = await apiFetch("/v1/sync/snapshot", { method: "GET", cache: "no-store" });
    if (handleUnauthorized(response) || !response.ok) return null;
    const payload = (await response.json().catch(() => null)) as SyncSnapshotResponse | null;
    if (!payload) return null;
    return payload;
  }, [handleUnauthorized]);

  const refreshServerRepairItems = useCallback(async () => {
    const payload = await fetchSyncSnapshot();
    if (!payload) return null;
    const nextRepairItems: SyncRepairItemSummary[] = Array.isArray(payload.repairItems)
      ? payload.repairItems
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: item.id as string,
            clientMutationId: typeof item.clientMutationId === "string" ? item.clientMutationId : item.id as string,
            op: typeof item.op === "string" ? item.op : "",
            payload: item.payload && typeof item.payload === "object" ? item.payload : {},
            reason: typeof item.reason === "string" ? item.reason : "repair_required",
            destinationClass: typeof item.destinationClass === "string" ? item.destinationClass : null,
            originalTargetId: typeof item.originalTargetId === "string" ? item.originalTargetId : null,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
          }))
      : [];
    setServerRepairItems(nextRepairItems);
    setCloudRepairCount(nextRepairItems.length);
    return nextRepairItems;
  }, [fetchSyncSnapshot]);

  const refreshFromCloud = useCallback(
    async (preferredSpaceId?: string | null, userId?: string | null, options?: { allowLocalOverwrite?: boolean }) => {
      const targetUserId = userId ?? sessionUser?.userId ?? null;
      const targetOwnerKey = targetUserId ? getUserOwnerKey(targetUserId) : null;
      setSyncPhase((current) => (current === "repairing" ? current : targetUserId ? "bootstrap" : current));
      setLastCanonicalSyncError(null);
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: targetUserId ? "user" : current.ownerMode,
        boundUserId: targetUserId ?? current.boundUserId,
        completeness: "syncing"
      }));
      const payload = await fetchSyncSnapshot();
      if (!payload) {
        setLastCanonicalSyncError("snapshot_unavailable");
        setLastSyncError("snapshot_unavailable");
        setSyncPhase("error");
        updateOfflineMeta((current) => ({
          ...current,
          completeness: current.syncState.hasLocalChanges ? "partial" : "stale"
        }));
        return;
      }
      try {
        setLastCloudCheckedAt(new Date().toISOString());
        const snapshotRepairItems: SyncRepairItemSummary[] = Array.isArray(payload.repairItems)
          ? payload.repairItems
              .filter((item) => item && typeof item.id === "string")
              .map((item) => ({
                id: item.id as string,
                clientMutationId: typeof item.clientMutationId === "string" ? item.clientMutationId : item.id as string,
                op: typeof item.op === "string" ? item.op : "",
                payload: item.payload && typeof item.payload === "object" ? item.payload : {},
                reason: typeof item.reason === "string" ? item.reason : "repair_required",
                destinationClass: typeof item.destinationClass === "string" ? item.destinationClass : null,
                originalTargetId: typeof item.originalTargetId === "string" ? item.originalTargetId : null,
                createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
              }))
          : [];
        const nextRevision = Number.isFinite(payload.revision) ? Number(payload.revision) : offlineMeta?.revision ?? null;
        const nextLastSequence = Number.isFinite(payload.lastSequence) ? Number(payload.lastSequence) : null;
        const nextLifeStore = {
          ...EMPTY_LIFE_STORE,
          doubts: Array.isArray(payload.life?.doubts) ? payload.life.doubts.map(mapApiLifeDoubt) : [],
          notes: Array.isArray(payload.life?.notes) ? payload.life.notes.map(mapApiLifeNote) : [],
          meta: lifeStore.meta
        };
        const nextThinkingStore = {
          ...withComputedSpaceActivity(mapSyncSnapshotThinking(payload.thinking)),
          timezone: thinkingStore.timezone,
          fixedTopSpacesEnabled: thinkingStore.fixedTopSpacesEnabled,
          fixedTopSpaceIds: thinkingStore.fixedTopSpaceIds
        };
        const nextThinkingViews = Object.fromEntries(
          Object.entries(payload.thinking_views ?? {}).map(([spaceId, view]) => [spaceId, mapApiThinkingView(view)])
        );
        const nextActive =
          (preferredSpaceId && nextThinkingStore.spaces.some((space) => space.id === preferredSpaceId) ? preferredSpaceId : null) ??
          pickDefaultSpaceId(nextThinkingStore.spaces);
        const pendingCount = await refreshPendingMutationCount(targetOwnerKey, true);
        const hasUnqueuedChangesBeforePull =
          offlineMeta?.syncState.hasLocalChanges === true && pendingCount === 0 && options?.allowLocalOverwrite !== true;
        if (hasUnqueuedChangesBeforePull) {
          setLastCanonicalSyncError("local_changes_without_queue");
          setLastSyncError("local_changes_without_queue");
          setSyncPhase("error");
          updateOfflineMeta((current) => ({
            ...current,
            completeness: "partial",
            syncState: {
              ...current.syncState,
              hasLocalChanges: true
            }
          }));
          return;
        }
        setSyncPhase((current) => (current === "repairing" ? current : "pull"));
        const hasPendingLocalChanges = pendingCount > 0;
        const pulledAt = new Date().toISOString();
        const nextMeta = createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId(), {
          ownerMode: targetUserId ? "user" : offlineMeta?.ownerMode,
          boundUserId: targetUserId ?? offlineMeta?.boundUserId ?? null,
          revision: nextRevision,
          completeness: hasPendingLocalChanges ? "partial" : "complete",
          lastAppliedLogId: nextLastSequence !== null ? String(nextLastSequence) : offlineMeta?.lastAppliedLogId ?? null,
          syncState: {
            lastSyncedAt: pulledAt,
            hasLocalChanges: hasPendingLocalChanges,
            bindingRequired: false
          }
        });
        const nextSnapshot: OfflineSnapshot = {
          lifeStore: nextLifeStore,
          thinkingStore: nextThinkingStore,
          activeSpaceId: nextActive,
          thinkingViews: nextThinkingViews,
          savedAt: pulledAt,
          meta: nextMeta
        };
        applySnapshotToState(nextSnapshot);
        persistLifeStore(nextLifeStore);
        persistThinkingStore(nextThinkingStore);
        if (targetOwnerKey) {
          await saveOfflineSnapshotByOwner(targetOwnerKey, nextSnapshot, { force: true });
        }
        setCloudRevision(nextRevision);
        setCloudLastSequence(nextLastSequence);
        setCloudRepairCount(snapshotRepairItems.length);
        setServerRepairItems(snapshotRepairItems);
        setLastSyncError(null);
        markCloudSynced(targetUserId, nextRevision, {
          hasLocalChanges: hasPendingLocalChanges
        });
        setSyncPhase(hasPendingLocalChanges ? "push" : "ready");
        if (targetUserId) {
          setOfflineRuntimeState("user_sync_ready");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastCanonicalSyncError(message);
        setLastSyncError(message);
        setSyncPhase("error");
        updateOfflineMeta((current) => ({
          ...current,
          completeness: current.syncState.hasLocalChanges ? "partial" : "stale"
        }));
      }
    },
    [
      applySnapshotToState,
      fetchSyncSnapshot,
      refreshPendingMutationCount,
      lifeStore,
      markCloudSynced,
      offlineMeta?.boundUserId,
      offlineMeta?.lastAppliedLogId,
      offlineMeta?.ownerMode,
      offlineMeta?.revision,
      offlineMeta?.syncState.hasLocalChanges,
      thinkingStore,
      updateOfflineMeta,
      sessionUser?.userId
    ]
  );

  const importLocalPayloadToCloud = useCallback(
    async (user: SessionUser) => {
      if (offlineMeta?.completeness !== "complete") {
        showNotice("本地快照未完整同步，已阻止覆盖云端");
        return false;
      }
      const incompleteSpaceIds = getIncompleteSpaceIdsForExport(thinkingStore, thinkingViewCacheRef.current);
      if (incompleteSpaceIds.length > 0) {
        showNotice("本地想一想内容未完整加载，已阻止覆盖云端");
        return false;
      }
      const payload = await buildLocalExportPayload(user, activeOwnerKey);
      const checksum = await sha256Hex(stableStringify(payload));
      const response = await apiFetch("/v1/system/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, checksum, mode: "replace" })
      });
      if (handleUnauthorized(response)) return false;
      const responseBody = (await response.json().catch(() => ({}))) as { error?: string; revision?: number };
      if (!response.ok) {
        showNotice(typeof responseBody.error === "string" ? responseBody.error : "本地数据绑定失败，请稍后再试");
        return false;
      }
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: "user",
        boundUserId: user.userId,
        revision: Number.isFinite(responseBody.revision) ? Number(responseBody.revision) : current.revision,
        completeness: "complete",
        syncState: {
          lastSyncedAt: new Date().toISOString(),
          hasLocalChanges: false,
          bindingRequired: false
        }
      }));
      await refreshFromCloud(null, user.userId, { allowLocalOverwrite: true });
      return true;
    },
    [activeOwnerKey, buildLocalExportPayload, handleUnauthorized, offlineMeta?.completeness, refreshFromCloud, showNotice, thinkingStore, updateOfflineMeta]
  );

  const overwriteCloudWithLocalSnapshot = useCallback(
    async (user: SessionUser, ownerKey: OfflineOwnerKey, reason: string) => {
      const incompleteSpaceIds = getIncompleteSpaceIdsForExport(thinkingStore, thinkingViewCacheRef.current);
      if (incompleteSpaceIds.length > 0) {
        return { ok: false as const, error: "本地想一想内容未完整加载，已阻止覆盖云端" };
      }
      const snapshotMeta = createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId(), {
        ownerMode: "user",
        boundUserId: user.userId,
        revision: offlineMeta?.revision ?? latestRevisionRef.current,
        completeness: offlineMeta?.completeness ?? "complete",
        lastAppliedLogId: offlineMeta?.lastAppliedLogId ?? null,
        syncState: {
          lastSyncedAt: offlineMeta?.syncState.lastSyncedAt ?? null,
          hasLocalChanges: offlineMeta?.syncState.hasLocalChanges === true,
          bindingRequired: false
        }
      });
      if (thinkingView) {
        thinkingViewCacheRef.current[thinkingView.spaceId] = thinkingView;
      }
      await saveOfflineSnapshotByOwner(ownerKey, {
        lifeStore,
        thinkingStore,
        activeSpaceId,
        thinkingViews: thinkingViewCacheRef.current,
        savedAt: new Date().toISOString(),
        meta: snapshotMeta
      });
      const backup = await createOfflineSyncBackup(ownerKey, reason);
      if (backup) setLatestSyncBackup(backup);

      const payload = await buildLocalExportPayload(user, ownerKey);
      const checksum = await sha256Hex(stableStringify(payload));
      const response = await apiFetch("/v1/sync/overwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          checksum,
          client_updated_at: new Date().toISOString(),
          reason
        })
      });
      if (handleUnauthorized(response)) {
        return { ok: false as const, error: "登录已失效，请重新登录" };
      }
      const responseBody = (await response.json().catch(() => ({}))) as {
        error?: string;
        revision?: number;
        lastSequence?: number;
        overwrittenAt?: string;
        overwritten?: { life: number; thinking: number; scratch: number };
        verify?: unknown;
      };
      if (!response.ok) {
        return { ok: false as const, error: typeof responseBody.error === "string" ? responseBody.error : "本地覆盖云端失败" };
      }

      const nextRevision = Number.isFinite(responseBody.revision) ? Number(responseBody.revision) : latestRevisionRef.current;
      const nextLastSequence = Number.isFinite(responseBody.lastSequence) ? Number(responseBody.lastSequence) : cloudLastSequence;
      const overwrittenAt = new Date().toISOString();
      const syncedMeta = createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId(), {
        ownerMode: "user",
        boundUserId: user.userId,
        revision: typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : snapshotMeta.revision,
        completeness: "complete",
        lastAppliedLogId:
          typeof nextLastSequence === "number" && Number.isFinite(nextLastSequence)
            ? String(nextLastSequence)
            : snapshotMeta.lastAppliedLogId,
        syncState: {
          lastSyncedAt: overwrittenAt,
          hasLocalChanges: false,
          bindingRequired: false
        }
      });
      const overwrittenAssetIds = new Set(
        (payload.thinking.media_assets ?? [])
          .map((asset) => asset.id)
          .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0)
      );
      await Promise.all(
        [...overwrittenAssetIds].map((assetId) =>
          updateOfflineMediaAsset(assetId, {
            status: "uploaded",
            remoteUrl: buildApiUrl(`/v1/thinking/media/${assetId}`),
            uploadedAt: overwrittenAt,
            lastError: null,
            blob: null
          })
        )
      );
      await clearOfflineMutationsByOwner(ownerKey);
      await refreshPendingMutationCount(ownerKey, true);
      await refreshDeadLetterMutations(ownerKey);
      await refreshOfflineMediaAssets(ownerKey);
      await saveOfflineSnapshotByOwner(ownerKey, {
        lifeStore,
        thinkingStore,
        activeSpaceId,
        thinkingViews: thinkingViewCacheRef.current,
        savedAt: overwrittenAt,
        meta: syncedMeta
      });
      setCloudRevision(typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : null);
      if (typeof nextLastSequence === "number" && Number.isFinite(nextLastSequence)) {
        setCloudLastSequence(nextLastSequence);
      }
      setLastCloudCheckedAt(new Date().toISOString());
      setLastOverwriteSummary({
        revision: typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : null,
        lastSequence: typeof nextLastSequence === "number" && Number.isFinite(nextLastSequence) ? nextLastSequence : null,
        overwrittenAt: typeof responseBody.overwrittenAt === "string" ? responseBody.overwrittenAt : overwrittenAt,
        overwritten: responseBody.overwritten ?? null,
        verify: responseBody.verify ?? null
      });
      setLastSyncError(null);
      setLastCanonicalSyncError(null);
      markCloudSynced(user.userId, typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : null, {
        hasLocalChanges: false
      });
      setOfflineRuntimeState("user_sync_ready");
      return { ok: true as const, backupCreated: Boolean(backup) };
    },
    [
      buildLocalExportPayload,
      cloudLastSequence,
      handleUnauthorized,
      activeSpaceId,
      lifeStore,
      markCloudSynced,
      offlineMeta,
      refreshDeadLetterMutations,
      refreshOfflineMediaAssets,
      refreshPendingMutationCount,
      thinkingStore,
      thinkingView
    ]
  );

  const _syncQueuedMutations = useCallback(async (ownerKey: OfflineOwnerKey | null) => {
    if (!ownerKey || !ownerKey.startsWith("user:")) return;
    if (offlineSyncingRef.current) return;
    if (!isOnline) return;
    offlineSyncingRef.current = true;
    try {
      const mediaReady = await syncPendingOfflineMediaAssets(ownerKey);
      if (!mediaReady) return;
      const pending = await listOfflineMutationsByOwner(ownerKey);
      if (!pending.length) return;
      const baseRevision = pending[0]?.baseRevision ?? latestRevisionRef.current ?? offlineMeta?.revision ?? 0;
      try {
        const response = await apiFetch("/v1/sync/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseRevision,
            deviceId: localProfileIdRef.current || getOrCreateLocalProfileId(),
            mutations: pending.map((item) => ({
              clientMutationId: item.clientMutationId,
              op: item.op,
              clientOrder: item.clientOrder,
              deviceId: item.deviceId,
              payload: {
                ...(item.body ?? {}),
                client_mutation_id: item.clientMutationId,
                client_updated_at: item.clientUpdatedAt
              },
              clientTime: item.clientUpdatedAt
            }))
          })
        });
        if (handleUnauthorized(response)) return;
        if (response.status === 409) {
          const conflictBody = (await response.json().catch(() => ({}))) as { error?: string };
          const conflictRevision = (() => {
            const match =
              typeof conflictBody.error === "string" ? conflictBody.error.match(/^revision_conflict:(\d+)$/) : null;
            return match ? Number(match[1]) : null;
          })();
          const rebasedRevision =
            typeof conflictRevision === "number" && Number.isFinite(conflictRevision)
              ? conflictRevision
              : await syncRevisionFromServer(ownerKey.slice(5));
          if (typeof rebasedRevision === "number" && Number.isFinite(rebasedRevision)) {
            setRevisionBaseline(ownerKey.slice(5), rebasedRevision);
            for (const item of pending) {
              await updateOfflineMutation(item.id, {
                baseRevision: rebasedRevision,
                status: "pending",
                lastError: null,
                nextRetryAt: Date.now()
              });
            }
          }
          return;
        }
        if (!response.ok) {
          const retryTime = Date.now() + OFFLINE_RETRY_BASE_MS;
          for (const item of pending) {
            await updateOfflineMutation(item.id, {
              retryCount: item.retryCount + 1,
              nextRetryAt: retryTime,
              lastError: `status_${response.status}`,
              status: "failed"
            });
          }
          return;
        }
        const payload = (await response.json()) as {
          applied?: Array<{ clientMutationId?: string; revision?: number }>;
          skipped?: Array<{ clientMutationId?: string; revision?: number }>;
          repairItems?: Array<{
            id?: string;
            clientMutationId?: string;
            op?: string;
            payload?: Record<string, unknown> | null;
            reason?: string;
            destinationClass?: string | null;
            originalTargetId?: string | null;
            createdAt?: string;
          }>;
          newRevision?: number;
          lastSequence?: number;
        };
        const revisions = new Map(
          [...(payload.applied ?? []), ...(payload.skipped ?? [])]
            .filter((item) => typeof item.clientMutationId === "string")
            .map((item) => [item.clientMutationId as string, Number.isFinite(item.revision) ? Number(item.revision) : null])
        );
        const repairMap = new Map(
          (payload.repairItems ?? [])
            .filter((item) => typeof item.clientMutationId === "string")
            .map((item) => [item.clientMutationId as string, item])
        );
        const nextRevision = Number.isFinite(payload.newRevision) ? Number(payload.newRevision) : null;
        let hasMissingAcknowledgements = false;
        if (typeof nextRevision === "number" && Number.isFinite(nextRevision)) {
          setRevisionBaseline(ownerKey.slice(5), nextRevision);
        }
        setCloudLastSequence(Number.isFinite(payload.lastSequence) ? Number(payload.lastSequence) : null);
        const nextRepairItems: SyncRepairItemSummary[] = (payload.repairItems ?? [])
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: item.id as string,
            clientMutationId: typeof item.clientMutationId === "string" ? item.clientMutationId : item.id as string,
            op: typeof item.op === "string" ? item.op : "",
            payload: item.payload && typeof item.payload === "object" ? item.payload : {},
            reason: typeof item.reason === "string" ? item.reason : "repair_required",
            destinationClass: typeof item.destinationClass === "string" ? item.destinationClass : null,
            originalTargetId: typeof item.originalTargetId === "string" ? item.originalTargetId : null,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
          }));
        setServerRepairItems(nextRepairItems);
        setCloudRepairCount(nextRepairItems.length);
        for (const item of pending) {
          if (repairMap.has(item.clientMutationId)) {
            const reason =
              typeof repairMap.get(item.clientMutationId)?.reason === "string"
                ? String(repairMap.get(item.clientMutationId)?.reason)
                : "repair_required";
            await updateOfflineMutation(item.id, {
              status: "dead_letter",
              deadLetterReason: reason,
              lastError: reason,
              nextRetryAt: Number.MAX_SAFE_INTEGER
            });
            await removeOfflineMutation(item.id);
            continue;
          }
          if (!revisions.has(item.clientMutationId)) {
            hasMissingAcknowledgements = true;
            await updateOfflineMutation(item.id, {
              baseRevision: typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : item.baseRevision,
              status: "pending",
              lastError: "missing_ack",
              deadLetterReason: null,
              nextRetryAt: Date.now() + OFFLINE_RETRY_BASE_MS
            });
            continue;
          }
          await updateOfflineMutation(item.id, {
            status: "acked",
            ackedRevision: revisions.get(item.clientMutationId) ?? null,
            lastError: null,
            deadLetterReason: null
          });
          await removeOfflineMutation(item.id);
        }
        await refreshDeadLetterMutations(ownerKey);
        if (repairMap.size > 0) {
          updateOfflineMeta((current) => ({
            ...current,
            completeness: current.completeness === "complete" ? "partial" : current.completeness,
            syncState: {
              ...current.syncState,
              hasLocalChanges: true
            }
          }));
          showNotice("部分离线改动未被云端接受，已移入同步异常");
        }
        if (!hasMissingAcknowledgements) {
          await refreshFromCloud(activeSpaceIdRef.current, ownerKey.slice(5), { allowLocalOverwrite: true });
        }
      } catch (error) {
        const retryTime = Date.now() + OFFLINE_RETRY_BASE_MS;
        for (const item of pending) {
          await updateOfflineMutation(item.id, {
            retryCount: item.retryCount + 1,
            nextRetryAt: retryTime,
            lastError: error instanceof Error ? error.message : String(error),
            status: "failed"
          });
        }
      }
    } finally {
      offlineSyncingRef.current = false;
    }
  }, [
    handleUnauthorized,
    offlineMeta?.revision,
    refreshFromCloud,
    refreshDeadLetterMutations,
    showNotice,
    syncPendingOfflineMediaAssets,
    syncRevisionFromServer,
    setRevisionBaseline,
    updateOfflineMeta,
    isOnline
  ]);

  const runQueuedMutationSync = useCallback(
    async (
      ownerKey: OfflineOwnerKey | null,
      options?: {
        includeDeferred?: boolean;
        preferredSpaceId?: string | null;
        repairDepth?: number;
        pullAfterUpload?: boolean;
        phase?: Extract<SyncPhase, "push" | "manual_push" | "repairing">;
      }
    ) => {
      if (!ownerKey || !ownerKey.startsWith("user:")) {
        return { ok: true as const, pendingCount: 0, deadLetterCount: 0 };
      }
      if (offlineSyncingRef.current || !isOnline) {
        return { ok: false as const, pendingCount: pendingMutationCount, deadLetterCount: deadLetterMutations.length };
      }
      offlineSyncingRef.current = true;
      setSyncPhase(options?.phase ?? (options?.repairDepth ? "repairing" : "push"));
      try {
        const mediaReady = await syncPendingOfflineMediaAssets(ownerKey);
        if (!mediaReady) {
          setLastSyncError("media_upload_failed");
          setNextSyncRetryAt(Date.now() + OFFLINE_RETRY_BASE_MS);
          setSyncPhase("error");
          return { ok: false as const, pendingCount: pendingMutationCount, deadLetterCount: deadLetterMutations.length };
        }
        const pending = await listOfflineMutationsByOwner(ownerKey, options?.includeDeferred ? Number.MAX_SAFE_INTEGER : Date.now());
        setPendingMutationCount(pending.length);
        if (!pending.length) {
          setSyncPhase("checking");
          const nextRevision = await refreshCloudSyncState(ownerKey.slice(5), { showCheckingPhase: true });
          const localRevision = latestRevisionRef.current ?? offlineMeta?.revision ?? null;
          if (nextRevision === null) {
            return { ok: false as const, pendingCount: 0, deadLetterCount: deadLetterMutations.length };
          }
          if (offlineMeta?.syncState.hasLocalChanges === true) {
            setLastSyncError("local_changes_without_queue");
            setSyncPhase("error");
            return { ok: false as const, pendingCount: 0, deadLetterCount: deadLetterMutations.length };
          }
          if (
            typeof localRevision === "number" &&
            Number.isFinite(localRevision) &&
            typeof nextRevision === "number" &&
            Number.isFinite(nextRevision) &&
            nextRevision !== localRevision
          ) {
            await refreshFromCloud(options?.preferredSpaceId ?? activeSpaceIdRef.current, ownerKey.slice(5));
          } else {
            markCloudSynced(ownerKey.slice(5), nextRevision, { hasLocalChanges: false });
          }
          setLastSyncError(null);
          setSyncPhase("ready");
          return { ok: true as const, pendingCount: 0, deadLetterCount: deadLetterMutations.length };
        }

        const syncBackup = await createOfflineSyncBackup(ownerKey, options?.phase === "manual_push" ? "manual_upload_local" : "queued_mutation_sync");
        if (syncBackup) setLatestSyncBackup(syncBackup);

        const baseRevision = pending[0]?.baseRevision ?? latestRevisionRef.current ?? offlineMeta?.revision ?? 0;
        try {
          const response = await apiFetch("/v1/sync/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseRevision,
              deviceId: localProfileIdRef.current || getOrCreateLocalProfileId(),
              mutations: pending.map((item) => ({
                clientMutationId: item.clientMutationId,
                op: item.op,
                clientOrder: item.clientOrder,
                deviceId: item.deviceId,
                payload: {
                  ...(item.body ?? {}),
                  client_mutation_id: item.clientMutationId,
                  client_updated_at: item.clientUpdatedAt
                },
                clientTime: item.clientUpdatedAt
              }))
            })
          });
          if (handleUnauthorized(response)) {
            setLastSyncError("unauthorized");
            setSyncPhase("error");
            return { ok: false as const, pendingCount: pending.length, deadLetterCount: deadLetterMutations.length };
          }
          if (response.status === 409) {
            setSyncPhase("conflict");
            const conflictBody = (await response.json().catch(() => ({}))) as { error?: string };
            const conflictRevision = (() => {
              const match =
                typeof conflictBody.error === "string" ? conflictBody.error.match(/^revision_conflict:(\d+)$/) : null;
              return match ? Number(match[1]) : null;
            })();
            await refreshFromCloud(options?.preferredSpaceId ?? activeSpaceIdRef.current, ownerKey.slice(5));
            const rebasedRevision =
              typeof conflictRevision === "number" && Number.isFinite(conflictRevision)
                ? conflictRevision
                : await syncRevisionFromServer(ownerKey.slice(5));
            if (typeof rebasedRevision === "number" && Number.isFinite(rebasedRevision)) {
              setRevisionBaseline(ownerKey.slice(5), rebasedRevision);
              const allPending = await listOfflineMutationsByOwner(ownerKey, Number.MAX_SAFE_INTEGER);
              for (const item of allPending) {
                await updateOfflineMutation(item.id, {
                  baseRevision: rebasedRevision,
                  status: "pending",
                  lastError: null,
                  deadLetterReason: null,
                  nextRetryAt: Date.now()
                });
              }
              const rebasedCount = await refreshPendingMutationCount(ownerKey, true);
              if ((options?.repairDepth ?? 0) < 1) {
                return await runQueuedMutationSync(ownerKey, {
                  includeDeferred: true,
                  preferredSpaceId: options?.preferredSpaceId ?? activeSpaceIdRef.current,
                  repairDepth: (options?.repairDepth ?? 0) + 1,
                  pullAfterUpload: options?.pullAfterUpload,
                  phase: options?.phase
                });
              }
              await refreshDeadLetterMutations(ownerKey);
              return { ok: false as const, pendingCount: rebasedCount, deadLetterCount: deadLetterMutations.length };
            }
            setSyncPhase("error");
            return { ok: false as const, pendingCount: pending.length, deadLetterCount: deadLetterMutations.length };
          }
          if (!response.ok) {
            const retryTime = Date.now() + OFFLINE_RETRY_BASE_MS;
            setLastSyncError(`status_${response.status}`);
            setNextSyncRetryAt(retryTime);
            for (const item of pending) {
              await updateOfflineMutation(item.id, {
                retryCount: item.retryCount + 1,
                nextRetryAt: retryTime,
                lastError: `status_${response.status}`,
                status: "failed"
              });
            }
            setSyncPhase("error");
            return { ok: false as const, pendingCount: pending.length, deadLetterCount: deadLetterMutations.length };
          }
          const payload = (await response.json()) as {
            applied?: Array<{ clientMutationId?: string; revision?: number }>;
            skipped?: Array<{ clientMutationId?: string; revision?: number }>;
            repairItems?: Array<{
              id?: string;
              clientMutationId?: string;
              op?: string;
              payload?: Record<string, unknown> | null;
              reason?: string;
              destinationClass?: string | null;
              originalTargetId?: string | null;
              createdAt?: string;
            }>;
            newRevision?: number;
            lastSequence?: number;
          };
          const revisions = new Map(
            [...(payload.applied ?? []), ...(payload.skipped ?? [])]
              .filter((item) => typeof item.clientMutationId === "string")
              .map((item) => [item.clientMutationId as string, Number.isFinite(item.revision) ? Number(item.revision) : null])
          );
          const repairMap = new Map(
            (payload.repairItems ?? [])
              .filter((item) => typeof item.clientMutationId === "string")
              .map((item) => [item.clientMutationId as string, item])
          );
          const nextRevision = Number.isFinite(payload.newRevision) ? Number(payload.newRevision) : null;
          let hasMissingAcknowledgements = false;
          if (typeof nextRevision === "number" && Number.isFinite(nextRevision)) {
            setRevisionBaseline(ownerKey.slice(5), nextRevision);
          }
          setCloudLastSequence(Number.isFinite(payload.lastSequence) ? Number(payload.lastSequence) : null);
          const nextRepairItems: SyncRepairItemSummary[] = (payload.repairItems ?? [])
            .filter((item) => item && typeof item.id === "string")
            .map((item) => ({
              id: item.id as string,
              clientMutationId: typeof item.clientMutationId === "string" ? item.clientMutationId : item.id as string,
              op: typeof item.op === "string" ? item.op : "",
              payload: item.payload && typeof item.payload === "object" ? item.payload : {},
              reason: typeof item.reason === "string" ? item.reason : "repair_required",
              destinationClass: typeof item.destinationClass === "string" ? item.destinationClass : null,
              originalTargetId: typeof item.originalTargetId === "string" ? item.originalTargetId : null,
              createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
            }));
          setServerRepairItems(nextRepairItems);
          setCloudRepairCount(nextRepairItems.length);
          for (const item of pending) {
            if (repairMap.has(item.clientMutationId)) {
              const reason =
                typeof repairMap.get(item.clientMutationId)?.reason === "string"
                  ? String(repairMap.get(item.clientMutationId)?.reason)
                  : "repair_required";
              await updateOfflineMutation(item.id, {
                status: "dead_letter",
                deadLetterReason: reason,
                lastError: reason,
                nextRetryAt: Number.MAX_SAFE_INTEGER
              });
              await removeOfflineMutation(item.id);
              continue;
            }
            if (!revisions.has(item.clientMutationId)) {
              hasMissingAcknowledgements = true;
              await updateOfflineMutation(item.id, {
                baseRevision: typeof nextRevision === "number" && Number.isFinite(nextRevision) ? nextRevision : item.baseRevision,
                status: "pending",
                lastError: "missing_ack",
                deadLetterReason: null,
                nextRetryAt: Date.now() + OFFLINE_RETRY_BASE_MS
              });
              continue;
            }
            await updateOfflineMutation(item.id, {
              status: "acked",
              ackedRevision: revisions.get(item.clientMutationId) ?? null,
              lastError: null,
              deadLetterReason: null
            });
            await removeOfflineMutation(item.id);
          }
          await refreshDeadLetterMutations(ownerKey);
          const nextPendingCount = await refreshPendingMutationCount(ownerKey, true);
          if (repairMap.size > 0) {
            setLastSyncError("repair_required");
            updateOfflineMeta((current) => ({
              ...current,
              completeness: "partial",
              syncState: {
                ...current.syncState,
                hasLocalChanges: true
              }
            }));
            showNotice("部分离线改动未被云端接受，已移入同步异常");
          }
          const shouldPullAfterUpload = options?.pullAfterUpload !== false;
          if (nextPendingCount === 0 && !hasMissingAcknowledgements && shouldPullAfterUpload) {
            await refreshFromCloud(options?.preferredSpaceId ?? activeSpaceIdRef.current, ownerKey.slice(5), {
              allowLocalOverwrite: true
            });
          }
          await refreshCloudSyncState(ownerKey.slice(5));
          if (repairMap.size === 0 && !hasMissingAcknowledgements && nextPendingCount === 0) {
            setLastSyncError(null);
          }
          setSyncPhase(
            repairMap.size > 0 || hasMissingAcknowledgements || nextPendingCount > 0
              ? options?.phase ?? "push"
              : shouldPullAfterUpload
                ? "ready"
                : "manual_upload_done"
          );
          return {
            ok: repairMap.size === 0 && !hasMissingAcknowledgements,
            pendingCount: nextPendingCount,
            deadLetterCount: repairMap.size
          };
        } catch (error) {
          const retryTime = Date.now() + OFFLINE_RETRY_BASE_MS;
          setLastSyncError(error instanceof Error ? error.message : String(error));
          setNextSyncRetryAt(retryTime);
          for (const item of pending) {
            await updateOfflineMutation(item.id, {
              retryCount: item.retryCount + 1,
              nextRetryAt: retryTime,
              lastError: error instanceof Error ? error.message : String(error),
              status: "failed"
            });
          }
          setSyncPhase("error");
          return { ok: false as const, pendingCount: pending.length, deadLetterCount: deadLetterMutations.length };
        }
      } finally {
        offlineSyncingRef.current = false;
      }
    },
    [
      deadLetterMutations.length,
      handleUnauthorized,
      isOnline,
      markCloudSynced,
      offlineMeta?.revision,
      offlineMeta?.syncState.hasLocalChanges,
      pendingMutationCount,
      refreshCloudSyncState,
      refreshDeadLetterMutations,
      refreshFromCloud,
      refreshPendingMutationCount,
      showNotice,
      syncPendingOfflineMediaAssets,
      syncRevisionFromServer,
      setRevisionBaseline,
      updateOfflineMeta
    ]
  );

  const _finalizeCloudWrite = useCallback(
    async (preferredSpaceId?: string | null, userId?: string | null) => {
      await refreshFromCloud(preferredSpaceId ?? activeSpaceIdRef.current, userId ?? sessionUser?.userId ?? null, {
        allowLocalOverwrite: true
      });
      if (userId ?? sessionUser?.userId) {
        await refreshCloudSyncState(userId ?? sessionUser?.userId ?? null);
      }
    },
    [refreshCloudSyncState, refreshFromCloud, sessionUser?.userId]
  );

  const refreshCurrentAccountFromCloud = useCallback(async () => {
    const authed = await syncAuth();
    const marker = loadLastUserMarker();
    const userId = authed ? sessionUser?.userId ?? marker?.userId ?? null : marker?.userId ?? null;
    const ownerKey = userId ? getUserOwnerKey(userId) : activeOwnerKey;
    if (!isOnline) {
      setPullRefresh({ phase: "offline", distance: 0, message: "当前离线，已显示本机缓存" });
      showNotice("当前离线，已显示本机缓存");
      return false;
    }
    if (!authed && !userId) {
      setPullRefresh({ phase: "done", distance: 0, message: "未登录" });
      return false;
    }
    if (userId) {
      await refreshFromCloud(activeSpaceIdRef.current, userId, { allowLocalOverwrite: true });
      await refreshCloudSyncState(userId);
      await refreshServerRepairItems();
    }
    if (ownerKey) {
      await refreshPendingMutationCount(ownerKey, true);
      await refreshDeadLetterMutations(ownerKey);
    }
    setPullRefresh({ phase: "done", distance: 0, message: "已刷新" });
    showNotice("已刷新");
    return true;
  }, [
    activeOwnerKey,
    isOnline,
    refreshCloudSyncState,
    refreshDeadLetterMutations,
    refreshFromCloud,
    refreshPendingMutationCount,
    refreshServerRepairItems,
    sessionUser?.userId,
    showNotice,
    syncAuth
  ]);

  const repairCloudSyncState = useCallback(
    async (ownerKey: OfflineOwnerKey | null, preferredSpaceId?: string | null) => {
      if (!ownerKey || !ownerKey.startsWith("user:")) {
        return { ok: false as const, message: "当前不在账号同步模式" };
      }
      const startedAt = new Date().toISOString();
      setSyncPhase("repairing");
      await refreshFromCloud(preferredSpaceId ?? activeSpaceIdRef.current, ownerKey.slice(5));
      const rebasedRevision = latestRevisionRef.current ?? offlineMeta?.revision ?? 0;
      const allPending = await listOfflineMutationsByOwner(ownerKey, Number.MAX_SAFE_INTEGER);
      for (const item of allPending) {
        await updateOfflineMutation(item.id, {
          baseRevision: rebasedRevision,
          status: "pending",
          lastError: null,
          deadLetterReason: null,
          nextRetryAt: Date.now()
        });
      }
      const syncResult = await runQueuedMutationSync(ownerKey, {
        includeDeferred: true,
        preferredSpaceId: preferredSpaceId ?? activeSpaceIdRef.current,
        repairDepth: 1
      });
      await refreshDeadLetterMutations(ownerKey);
      const remainingPendingCount = await refreshPendingMutationCount(ownerKey, true);
      const finishedAt = new Date().toISOString();
      setLastRepairSummary({
        startedAt,
        finishedAt,
        replayedCount: allPending.length,
        pendingCount: remainingPendingCount,
        deadLetterCount: deadLetterMutations.length,
        cloudRevision: latestRevisionRef.current ?? null,
        failedReason: syncResult.ok ? null : remainingPendingCount > 0 ? "pending_remaining" : "repair_incomplete"
      });
      if (!syncResult.ok && remainingPendingCount > 0) {
        return { ok: false as const, message: "同步刷新已执行，但仍有待处理改动" };
      }
      return { ok: true as const, message: "已按云端快照重建并重放本地改动" };
    },
    [
      deadLetterMutations.length,
      offlineMeta?.revision,
      refreshDeadLetterMutations,
      refreshFromCloud,
      refreshPendingMutationCount,
      runQueuedMutationSync
    ]
  );

  const queueMutation = useCallback(
    async (route: string, body: Record<string, unknown> | null = null) => {
      if (backupPreview) {
        showNotice("正在预览本机备份，不能编辑");
        return null;
      }
      if (!activeOwnerKey || !sessionUser || !activeOwnerKey.startsWith("user:")) {
        markLocalChange();
        return null;
      }
      const canQueueForCurrentUser =
        offlineMeta?.ownerMode === "user" &&
        offlineMeta.boundUserId === sessionUser.userId &&
        offlineRuntimeState !== "binding_required" &&
        offlineRuntimeState !== "switching_account";
      if (!canQueueForCurrentUser) {
        markLocalChange();
        return null;
      }
      const now = new Date().toISOString();
      mutationOrderRef.current = Math.max(mutationOrderRef.current + 1, Date.now());
      const queued: QueuedMutation = {
        id: createId(),
        ownerKey: activeOwnerKey,
        deviceId: localProfileIdRef.current || getOrCreateLocalProfileId(),
        clientOrder: mutationOrderRef.current,
        route,
        method: "POST",
        op: route,
        entityType: route.startsWith("/v1/doubts")
          ? "life"
          : route.startsWith("/v1/thinking/scratch")
            ? "scratch"
            : route.startsWith("/v1/thinking")
              ? "thinking"
              : "system",
        body,
        clientMutationId: createId(),
        clientUpdatedAt: now,
        baseRevision: latestRevisionRef.current ?? offlineMeta?.revision ?? 0,
        status: "pending",
        ackedRevision: null,
        createdAt: now,
        retryCount: 0,
        nextRetryAt: Date.now(),
        lastError: null
      };
      await enqueueOfflineMutation(queued);
      void refreshPendingMutationCount(activeOwnerKey, true);
      markLocalChange();
      if (isOnline && offlineRuntimeState === "user_sync_ready") {
        const preferredSpaceId = getPreferredSpaceIdForQueuedMutation(route, body) ?? activeSpaceIdRef.current;
        void runQueuedMutationSync(activeOwnerKey, {
          includeDeferred: true,
          preferredSpaceId
        });
      }
      return queued;
    },
    [
      activeOwnerKey,
      backupPreview,
      isOnline,
      markLocalChange,
      offlineMeta?.boundUserId,
      offlineMeta?.ownerMode,
      offlineMeta?.revision,
      offlineRuntimeState,
      refreshPendingMutationCount,
      runQueuedMutationSync,
      sessionUser,
      showNotice
    ]
  );

  const createLifeDoubt = useCallback(
    async (rawText: string) => {
      const now = new Date().toISOString();
      const localDoubtId = createId();
      const payload = {
        raw_text: rawText,
        layer: "life" as const,
        client_entity_id: localDoubtId,
        client_updated_at: now
      };
      await queueMutation("/v1/doubts", payload);
      setLifeStore((prev) => ({
        ...prev,
        meta: {
          ...prev.meta,
          firstDoubtGuideDismissedAt: prev.meta.firstDoubtGuideDismissedAt ?? now
        },
        doubts: [
          {
            id: localDoubtId,
            rawText,
            firstNodePreview: null,
            lastNodePreview: null,
            createdAt: now,
            archivedAt: null,
            deletedAt: null,
            syncStatus: "pending"
          },
          ...prev.doubts.filter((item) => item.id !== localDoubtId)
        ]
      }));
      markLocalChange();
      return true;
      /* if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/doubts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            if (response.status >= 500) {
              await queueMutation("/v1/doubts", payload);
              setLifeStore((prev) => ({
                ...prev,
                doubts: [
                  {
                    id: localDoubtId,
                    rawText,
                    firstNodePreview: null,
                    lastNodePreview: null,
                    createdAt: now,
                    archivedAt: null,
                    deletedAt: null
                  },
                  ...prev.doubts.filter((item) => item.id !== localDoubtId)
                ]
              }));
              return true;
            }
            showNotice("放入失败，请稍后再试");
            return false;
          }
          await finalizeCloudWrite(null, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            showNotice("网络异常，请稍后再试");
            return false;
          }
        }
      }
      await queueMutation("/v1/doubts", payload);
      setLifeStore((prev) => ({
        ...prev,
        doubts: [
          {
            id: localDoubtId,
            rawText,
            firstNodePreview: null,
            lastNodePreview: null,
            createdAt: now,
            archivedAt: null,
            deletedAt: null
          },
          ...prev.doubts.filter((item) => item.id !== localDoubtId)
        ]
      }));
      markLocalChange();
      return true;
      */
    },
    [markLocalChange, queueMutation]
  );

  const saveLifeDoubtNote = useCallback(
    async (doubtId: string, noteText: string, options?: LifeNoteSaveOptions) => {
      const now = new Date().toISOString();
      const existingNoteId = typeof options?.noteId === "string" && options.noteId.trim() ? options.noteId.trim() : null;
      const noteId = existingNoteId ?? createId();
      const payload = { note_text: noteText, note_id: noteId, client_updated_at: now };
      await queueMutation(`/v1/doubts/${doubtId}/note`, payload);
      setLifeStore((prev) => {
        const cleaned = noteText.trim();
        const nextNotes = existingNoteId
          ? cleaned
            ? prev.notes.map((item) => (item.id === existingNoteId && item.doubtId === doubtId ? { ...item, noteText: cleaned } : item))
            : prev.notes.filter((item) => !(item.id === existingNoteId && item.doubtId === doubtId))
          : cleaned
            ? [...prev.notes, { id: noteId, doubtId, noteText: cleaned, createdAt: now }]
            : prev.notes;
        return { ...prev, notes: nextNotes };
      });
      markLocalChange();
      return true;
      /* if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/doubts/${doubtId}/note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            if (response.status >= 500) {
              await queueMutation(`/v1/doubts/${doubtId}/note`, payload);
              setLifeStore((prev) => {
                const noteId = prev.notes.find((item) => item.doubtId === doubtId)?.id ?? createId();
                const cleaned = noteText.trim();
                const nextNotes = cleaned
                  ? [
                      ...prev.notes.filter((item) => item.doubtId !== doubtId),
                      { id: noteId, doubtId, noteText: cleaned, createdAt: now }
                    ]
                  : prev.notes.filter((item) => item.doubtId !== doubtId);
                return { ...prev, notes: nextNotes };
              });
              return true;
            }
            showNotice("注记保存失败");
            return false;
          }
          await finalizeCloudWrite(null, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            showNotice("网络异常，请稍后再试");
            return false;
          }
        }
      }
      await queueMutation(`/v1/doubts/${doubtId}/note`, payload);
      setLifeStore((prev) => {
        const noteId = prev.notes.find((item) => item.doubtId === doubtId)?.id ?? createId();
        const cleaned = noteText.trim();
        const nextNotes = cleaned
          ? [...prev.notes.filter((item) => item.doubtId !== doubtId), { id: noteId, doubtId, noteText: cleaned, createdAt: now }]
          : prev.notes.filter((item) => item.doubtId !== doubtId);
        return { ...prev, notes: nextNotes };
      });
      markLocalChange();
      return true;
      */
    },
    [markLocalChange, queueMutation]
  );

  const pruneDerivedThinkingByDoubt = useCallback((doubtId: string) => {
    setThinkingStore((prev) => {
      const deletingSpaceIds = new Set(prev.spaces.filter((space) => space.sourceTimeDoubtId === doubtId).map((space) => space.id));
      if (!deletingSpaceIds.size) return prev;
      const nextInbox = { ...prev.inbox };
      for (const spaceId of deletingSpaceIds) delete nextInbox[spaceId];
      return {
        ...prev,
        spaces: prev.spaces.filter((space) => !deletingSpaceIds.has(space.id)),
        nodes: prev.nodes.filter((node) => !deletingSpaceIds.has(node.spaceId)),
        spaceMeta: prev.spaceMeta.filter((meta) => !deletingSpaceIds.has(meta.spaceId)),
        inbox: nextInbox
      };
    });
  }, []);

  const deleteLifeDoubtWithDerived = useCallback(
    async (doubtId: string) => {
      await queueMutation(`/v1/doubts/${doubtId}/delete`);
      pruneDerivedThinkingByDoubt(doubtId);
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.filter((item) => item.id !== doubtId),
        notes: prev.notes.filter((item) => item.doubtId !== doubtId)
      }));
      markLocalChange();
      return true;
      /* if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/doubts/${doubtId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            showNotice("删除失败，请稍后再试");
            return false;
          }
          await finalizeCloudWrite(
            activeSpaceId && thinkingStore.spaces.some((space) => space.sourceTimeDoubtId === doubtId && space.id === activeSpaceId)
              ? null
              : activeSpaceId,
            sessionUser?.userId ?? null
          );
          return true;
        } catch {
          showNotice("网络异常，请稍后再试");
          return false;
        }
      }
      pruneDerivedThinkingByDoubt(doubtId);
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.filter((item) => item.id !== doubtId),
        notes: prev.notes.filter((item) => item.doubtId !== doubtId)
      }));
      markLocalChange();
      return true;
      */
    },
    [markLocalChange, pruneDerivedThinkingByDoubt, queueMutation]
  );

  const createLocalThinkingSpace = useCallback(
    ({
      rootQuestionText,
      sourceTimeDoubtId,
      spaceId,
      parkingTrackId,
      createdAt,
      syncStatus = "pending"
    }: {
      rootQuestionText: string;
      sourceTimeDoubtId: string | null;
      spaceId: string;
      parkingTrackId: string;
      createdAt: string;
      syncStatus?: "pending" | "repair" | null;
    }) => {
      const localSpace: ThinkingSpace = {
        id: spaceId,
        userId: sessionUser?.userId ?? "offline_user",
        rootQuestionText,
        status: "active",
        createdAt,
        lastActivityAt: createdAt,
        writtenToTimeAt: null,
        sourceTimeDoubtId: sourceTimeDoubtId ?? null,
        syncStatus
      };
      const localMeta: ThinkingSpaceMeta = {
        spaceId,
        exportVersion: 1,
        backgroundText: null,
        backgroundVersion: 0,
        suggestionDecay: 0,
        lastTrackId: null,
        lastOrganizedOrder: -1,
        parkingTrackId,
        pendingTrackId: null,
        emptyTrackIds: []
      };
      const localView: ThinkingSpaceView = {
        spaceId,
        currentTrackId: parkingTrackId,
        parkingTrackId,
        pendingTrackId: null,
        tracks: [
          {
            id: parkingTrackId,
            titleQuestionText: "鍏堟斁杩欓噷",
            isParking: true,
            isEmpty: false,
            nodeCount: 0,
            nodes: []
          }
        ],
        suggestedQuestions: [],
        backgroundText: null,
        backgroundVersion: 0,
        backgroundAssetIds: [],
        backgroundSelectedAssetId: null
      };
      thinkingViewCacheRef.current[spaceId] = localView;
      setThinkingStore((prev) => ({
        ...prev,
        spaces: [localSpace, ...prev.spaces.filter((item) => item.id !== spaceId)],
        spaceMeta: [localMeta, ...prev.spaceMeta.filter((item) => item.spaceId !== spaceId)]
      }));
      setActiveSpaceId(spaceId);
      setThinkingView(localView);
      markLocalChange();
      return {
        ok: true as const,
        spaceId,
        converted: false,
        createdAsStatement: false,
        suggestedQuestions: [],
        questionSuggestion: null
      };
    },
    [markLocalChange, sessionUser?.userId]
  );

  const createThinkingSpaceApi = useCallback(
    async (
      rootQuestionText: string,
      sourceTimeDoubtId: string | null
    ): Promise<
      | {
          ok: true;
          spaceId: string;
          converted: boolean;
          createdAsStatement: boolean;
          suggestedQuestions: string[];
          questionSuggestion: string | null;
        }
      | { ok: false; message: string; suggestedQuestions?: string[] }
    > => {
      if (sourceTimeDoubtId) {
        const existing = [...thinkingStore.spaces]
          .filter((space) => space.sourceTimeDoubtId === sourceTimeDoubtId)
          .sort(
            (a, b) =>
              new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime()
          )[0];
        if (existing) {
          if (existing.status === "hidden") {
            const activeCount = thinkingStore.spaces.filter((space) => space.status === "active").length;
            if (activeCount >= MAX_ACTIVE_SPACES) {
              return { ok: false, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
            }
            const restoredAt = new Date().toISOString();
            await queueMutation(`/v1/doubts/${sourceTimeDoubtId}/to-thinking`, {
              client_updated_at: restoredAt
            });
            setThinkingStore((prev) => ({
              ...prev,
              spaces: prev.spaces.map((space) =>
                space.id === existing.id
                  ? {
                      ...space,
                      status: "active" as const,
                      lastActivityAt: restoredAt,
                      writtenToTimeAt: null,
                      syncStatus: "pending" as const
                    }
                  : space
              )
            }));
            markLocalChange();
          }
          const existingView = getLocalSpaceView(existing.id);
          setActiveSpaceId(existing.id);
          if (existingView) setThinkingView(existingView);
          return {
            ok: true,
            spaceId: existing.id,
            converted: false,
            createdAsStatement: false,
            suggestedQuestions: [],
            questionSuggestion: null
          };
        }
      }
      const activeCount = thinkingStore.spaces.filter((space) => space.status === "active").length;
      if (activeCount >= MAX_ACTIVE_SPACES) {
        return { ok: false, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
      }
      const now = new Date().toISOString();
      const localSpaceId = createId();
      const localParkingTrackId = createId();
      const basePayload = {
        root_question_text: rootQuestionText,
        source_time_doubt_id: sourceTimeDoubtId,
        client_space_id: localSpaceId,
        client_parking_track_id: localParkingTrackId,
        client_updated_at: now
      };
      await queueMutation("/v1/thinking/spaces", basePayload);
      return createLocalThinkingSpace({
        rootQuestionText,
        sourceTimeDoubtId,
        spaceId: localSpaceId,
        parkingTrackId: localParkingTrackId,
        createdAt: now
      });
      /* if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/thinking/spaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basePayload)
          });
          if (handleUnauthorized(response)) return { ok: false, message: "登录已失效，请重新登录" };
          if (response.status === 409) return { ok: false, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
          const payload = (await response.json().catch(() => ({}))) as {
            space_id?: string;
            converted?: boolean;
            created_as_statement?: boolean;
            suggested_questions?: string[];
            question_suggestion?: string | null;
            error?: string;
          };
          if (!response.ok) {
            return {
              ok: false,
              message: typeof payload.error === "string" ? payload.error : "创建空间失败",
              suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : []
            };
          }
          const spaceId = typeof payload.space_id === "string" ? payload.space_id : null;
          if (!spaceId) return { ok: false, message: "创建空间失败" };
          setActiveSpaceId(spaceId);
          await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
          return {
            ok: true,
            spaceId,
            converted: payload.converted === true,
            createdAsStatement: payload.created_as_statement === true,
            suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : [],
            questionSuggestion: typeof payload.question_suggestion === "string" ? payload.question_suggestion : null
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false, message: "网络异常，请稍后再试" };
          }
        }
      }
      await queueMutation("/v1/thinking/spaces", basePayload);
      const localSpace: ThinkingSpace = {
        id: localSpaceId,
        userId: sessionUser?.userId ?? "offline_user",
        rootQuestionText,
        status: "active",
        createdAt: now,
        lastActivityAt: now,
        writtenToTimeAt: null,
        sourceTimeDoubtId: sourceTimeDoubtId ?? null
      };
      const localMeta: ThinkingSpaceMeta = {
        spaceId: localSpaceId,
        exportVersion: 1,
        backgroundText: null,
        backgroundVersion: 0,
        suggestionDecay: 0,
        lastTrackId: null,
        lastOrganizedOrder: -1,
        parkingTrackId: localParkingTrackId,
        pendingTrackId: null,
        emptyTrackIds: []
      };
      const localView: ThinkingSpaceView = {
        spaceId: localSpaceId,
        currentTrackId: localParkingTrackId,
        parkingTrackId: localParkingTrackId,
        pendingTrackId: null,
        tracks: [
          {
            id: localParkingTrackId,
            titleQuestionText: "先放这里",
            isParking: true,
            isEmpty: false,
            nodeCount: 0,
            nodes: []
          }
        ],
        suggestedQuestions: [],
        backgroundText: null,
        backgroundVersion: 0,
        backgroundAssetIds: [],
        backgroundSelectedAssetId: null
      };
      thinkingViewCacheRef.current[localSpaceId] = localView;
      setThinkingStore((prev) => ({
        ...prev,
        spaces: [localSpace, ...prev.spaces.filter((item) => item.id !== localSpaceId)],
        spaceMeta: [localMeta, ...prev.spaceMeta.filter((item) => item.spaceId !== localSpaceId)]
      }));
      setActiveSpaceId(localSpaceId);
      setThinkingView(localView);
      markLocalChange();
      return {
        ok: true,
        spaceId: localSpaceId,
        converted: false,
        createdAsStatement: false,
        suggestedQuestions: [],
        questionSuggestion: null
      }
      */
    },
    [createLocalThinkingSpace, getLocalSpaceView, markLocalChange, queueMutation, thinkingStore.spaces]
  );

  useEffect(() => {
    if (!runtimeReady || !pinReady || (pinEnabled && !pinUnlocked) || !cloudSessionEnabled) return;
    void syncAuth();
  }, [cloudSessionEnabled, pinEnabled, pinReady, pinUnlocked, runtimeReady, syncAuth]);

  useEffect(() => {
    if (hydrated || !runtimeReady || !pinReady || (pinEnabled && !pinUnlocked)) return;
    let cancelled = false;
    void (async () => {
      const localProfileId = getOrCreateLocalProfileId();
      localProfileIdRef.current = localProfileId;
      if (cancelled) return;
      const lastUser = loadLastUserMarker();
      if (lastUser) {
        const ownerKey = getUserOwnerKey(lastUser.userId);
        const fallbackMeta = createOfflineSnapshotMeta(localProfileId, {
          ownerMode: "user",
          boundUserId: lastUser.userId,
          completeness: "stale"
        });
        setActiveOwnerKey(ownerKey);
        setSessionUser({ userId: lastUser.userId, email: lastUser.email });
        const snapshot = await loadOwnerSnapshot(ownerKey, fallbackMeta);
        if (cancelled) return;
        if (snapshot) {
          setOfflineRuntimeState(isOnlineRef.current ? "user_syncing" : "user_offline_ready");
        } else {
          setOfflineSnapshotExists(false);
          resetArchiveState(fallbackMeta);
          setOfflineRuntimeState(isOnlineRef.current ? "user_bootstrapping" : "user_offline_ready");
        }
      } else {
        const ownerKey = getGuestOwnerKey(localProfileId);
        const guestMeta = createOfflineSnapshotMeta(localProfileId);
        setActiveOwnerKey(ownerKey);
        const snapshot = await loadOwnerSnapshot(ownerKey, guestMeta);
        if (cancelled) return;
        if (!snapshot) setOfflineSnapshotExists(false);
        setOfflineRuntimeState("guest_ready");
      }
      setHydrated(true);
      setStartupRecovering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, loadOwnerSnapshot, pinEnabled, pinReady, pinUnlocked, resetArchiveState, runtimeReady, setSessionUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("zhihuo_thinking_focus_mode");
    setThinkingFocusMode(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("zhihuo_thinking_focus_mode", thinkingFocusMode ? "1" : "0");
  }, [thinkingFocusMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateFromNavigator = () => applyOnlineState(window.navigator.onLine !== false);
    const handleConnectivity = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event as CustomEvent<{ online?: boolean }>).detail : null;
      if (typeof detail?.online === "boolean") {
        applyOnlineState(detail.online);
      }
    };
    updateFromNavigator();
    window.addEventListener("online", updateFromNavigator);
    window.addEventListener("offline", updateFromNavigator);
    window.addEventListener(API_CONNECTIVITY_EVENT, handleConnectivity);
    return () => {
      window.removeEventListener("online", updateFromNavigator);
      window.removeEventListener("offline", updateFromNavigator);
      window.removeEventListener(API_CONNECTIVITY_EVENT, handleConnectivity);
    };
  }, [applyOnlineState]);

  useEffect(() => {
    activeSpaceIdRef.current = activeSpaceId;
  }, [activeSpaceId]);

  useEffect(() => {
    if (!hydrated || !authReady || !offlineMeta) return;

    let cancelled = false;
    void (async () => {
      const localProfileId = localProfileIdRef.current || getOrCreateLocalProfileId();
      if (!sessionUser) {
        userBootstrapRef.current = null;
        bindingCheckUserIdRef.current = null;
        setBindingDialog(null);
        const guestOwnerKey = getGuestOwnerKey(localProfileId);
        const guestMeta = createOfflineSnapshotMeta(localProfileId);
        if (activeOwnerKey !== guestOwnerKey) {
          setActiveOwnerKey(guestOwnerKey);
          await loadOwnerSnapshot(guestOwnerKey, guestMeta);
          if (cancelled) return;
        } else if (offlineMeta.ownerMode !== "guest") {
          resetArchiveState(guestMeta);
        }
        setOfflineRuntimeState("guest_ready");
        return;
      }

      const nextUserOwnerKey = getUserOwnerKey(sessionUser.userId);
      const userMeta = createOfflineSnapshotMeta(localProfileId, {
        ownerMode: "user",
        boundUserId: sessionUser.userId
      });

      if (activeOwnerKey !== nextUserOwnerKey) {
        userBootstrapRef.current = null;
        bindingCheckUserIdRef.current = null;
        setBindingDialog(null);
        setOfflineRuntimeState("switching_account");
        setActiveOwnerKey(nextUserOwnerKey);
        await loadOwnerSnapshot(nextUserOwnerKey, userMeta);
        if (cancelled) return;
      }

      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: "user",
        boundUserId: sessionUser.userId,
        syncState: {
          ...current.syncState,
          bindingRequired: false
        }
      }));

      if (!isOnline) {
        userBootstrapRef.current = null;
        setOfflineRuntimeState("user_offline_ready");
        return;
      }

      if (userBootstrapRef.current === sessionUser.userId) {
        if (offlineRuntimeState !== "user_sync_ready") {
          setOfflineRuntimeState("user_syncing");
        }
        return;
      }

      userBootstrapRef.current = sessionUser.userId;
      setOfflineRuntimeState("user_bootstrapping");
      await refreshFromCloud(activeSpaceIdRef.current, sessionUser.userId);
      if (cancelled) return;
      await runQueuedMutationSync(nextUserOwnerKey, { includeDeferred: true, preferredSpaceId: activeSpaceIdRef.current });
      if (cancelled) return;
      setOfflineRuntimeState("user_sync_ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeOwnerKey,
    authReady,
    cloudSessionEnabled,
    hydrated,
    isNativeApp,
    isOnline,
    loadOwnerSnapshot,
    offlineMeta,
    offlineRuntimeState,
    refreshFromCloud,
    resetArchiveState,
    sessionUser,
    runQueuedMutationSync,
    updateOfflineMeta
  ]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser || !currentUserOwnerKey || !isOnline) return;
    if (offlineRuntimeState !== "user_sync_ready") return;
    const run = () => {
      void runQueuedMutationSync(currentUserOwnerKey, { includeDeferred: true, preferredSpaceId: activeSpaceIdRef.current });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(() => {
      run();
    }, CLOUD_SYNC_CHECK_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [authReady, currentUserOwnerKey, hydrated, isOnline, offlineRuntimeState, runQueuedMutationSync, sessionUser]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated || isOnline) return;
    const probe = () => {
      void apiFetch("/v1/health", { method: "GET", cache: "no-store" }).catch(() => null);
    };
    probe();
    const timer = window.setInterval(probe, 15000);
    return () => {
      window.clearInterval(timer);
    };
  }, [hydrated, isOnline]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!hydrated || !authReady || !sessionUser) return;
    const retry = () => {
      if (document.visibilityState !== "visible") return;
      if (!isOnline) return;
      if (offlineRuntimeState !== "user_offline_ready" && offlineRuntimeState !== "user_syncing") return;
      void refreshCurrentAccountFromCloud();
    };
    document.addEventListener("visibilitychange", retry);
    return () => document.removeEventListener("visibilitychange", retry);
  }, [authReady, hydrated, isOnline, offlineRuntimeState, refreshCurrentAccountFromCloud, sessionUser]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshDeadLetterMutations(activeOwnerKey);
  }, [activeOwnerKey, hydrated, refreshDeadLetterMutations]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshPendingMutationCount(activeOwnerKey, true);
  }, [activeOwnerKey, hydrated, refreshPendingMutationCount]);

  useEffect(() => {
    if (!authReady || !cloudSyncReady || !sessionUser || !isOnline) {
      if (!sessionUser) {
        setCloudRevision(null);
        setCloudLastSequence(null);
        setCloudRepairCount(0);
        setCloudServerTime(null);
        setLastCloudCheckedAt(null);
        setLastSyncError(null);
        setNextSyncRetryAt(null);
        setServerRepairItems([]);
      }
      return;
    }
    void refreshCloudSyncState(sessionUser.userId);
    void refreshServerRepairItems();
    const timer = window.setInterval(() => {
      void refreshCloudSyncState(sessionUser.userId);
      void refreshServerRepairItems();
    }, CLOUD_SYNC_CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [authReady, cloudSyncReady, isOnline, refreshCloudSyncState, refreshServerRepairItems, sessionUser]);

  useEffect(() => {
    if (!authReady || !cloudSyncReady || !sessionUser || !isOnline) return;
    if (isBackupPreviewing) return;
    if (pendingMutationCount > 0) return;
    if (offlineMeta?.syncState.hasLocalChanges === true) return;
    if (typeof cloudRevision !== "number") return;
    if (offlineMeta?.revision === cloudRevision) return;
    if (syncPhase === "bootstrap" || syncPhase === "repairing" || syncPhase === "push" || syncPhase === "pull") return;
    if (autoCloudRefreshInFlightRef.current) return;

    autoCloudRefreshInFlightRef.current = true;
    void (async () => {
      try {
        await refreshFromCloud(activeSpaceIdRef.current, sessionUser.userId);
      } finally {
        autoCloudRefreshInFlightRef.current = false;
      }
    })();
  }, [
    authReady,
    cloudRevision,
    cloudSyncReady,
    isBackupPreviewing,
    isOnline,
    offlineMeta,
    pendingMutationCount,
    refreshFromCloud,
    sessionUser,
    syncPhase
  ]);

  useEffect(() => {
    if (!hydrated) return;
    persistLifeStore(lifeStore);
  }, [hydrated, lifeStore]);

  useEffect(() => {
    if (!hydrated) return;
    persistThinkingStore(thinkingStore);
  }, [hydrated, thinkingStore]);

  useEffect(() => {
    if (!hydrated || !offlineMeta || !activeOwnerKey) return;
    if (offlineMeta.completeness === "syncing" || offlineMeta.completeness === "stale") return;
    if (thinkingView) {
      thinkingViewCacheRef.current[thinkingView.spaceId] = thinkingView;
    }
    void saveOfflineSnapshotByOwner(activeOwnerKey, {
      lifeStore,
      thinkingStore,
      activeSpaceId,
      thinkingViews: thinkingViewCacheRef.current,
      savedAt: new Date().toISOString(),
      meta: offlineMeta
    });
  }, [activeOwnerKey, activeSpaceId, hydrated, lifeStore, offlineMeta, thinkingStore, thinkingView]);

  useEffect(() => {
    if (!hydrated) return;
    setActiveSpaceId((prev) => {
      if (prev && thinkingStore.spaces.some((space) => space.id === prev && (space.status === "active" || thinkingViewMode === "detail"))) return prev;
      return [...thinkingStore.spaces].filter((space) => space.status === "active").sort(sortSpacesByLatestActivity)[0]?.id ?? null;
    });
  }, [hydrated, thinkingStore.spaces, thinkingViewMode]);

  useEffect(() => {
    if (!hydrated) return;
    const activeIdSet = new Set(thinkingStore.spaces.filter((space) => space.status === "active").map((space) => space.id));
    const nextIds = thinkingStore.fixedTopSpaceIds.filter((id, index, array) => activeIdSet.has(id) && array.indexOf(id) === index).slice(0, 3);
    if (
      nextIds.length === thinkingStore.fixedTopSpaceIds.length &&
      nextIds.every((id, index) => id === thinkingStore.fixedTopSpaceIds[index])
    ) {
      return;
    }
    setThinkingStore((prev) => ({
      ...prev,
      fixedTopSpaceIds: prev.fixedTopSpaceIds.filter((id, index, array) => activeIdSet.has(id) && array.indexOf(id) === index).slice(0, 3)
    }));
  }, [hydrated, thinkingStore.fixedTopSpaceIds, thinkingStore.spaces]);

  useEffect(() => {
    if (!hydrated) return;
    if (!activeSpaceId) {
      setThinkingView(null);
      return;
    }
    const cached = getLocalSpaceView(activeSpaceId);
    setThinkingView(cached);
  }, [activeSpaceId, getLocalSpaceView, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setOpeningPhase("stars"), OPENING_MS));
    timers.push(window.setTimeout(() => setOpeningPhase("text"), OPENING_MS * 2));
    timers.push(
      window.setTimeout(() => {
        setOpeningPhase("ready");
        setLifeReady(true);
      }, OPENING_MS * 4)
    );
    return () => timers.forEach((timerId) => window.clearTimeout(timerId));
  }, [hydrated]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  /* const hideLifeDoubtFromTimeline = useCallback(
    async (doubtId: string) => {
      await queueMutation(`/v1/doubts/${doubtId}/archive`);
      const archivedAt = new Date().toISOString();
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.map((item) => (item.id === doubtId ? { ...item, archivedAt } : item))
      }));
      markLocalChange();
      return true;
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/doubts/${doubtId}/archive`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation(`/v1/doubts/${doubtId}/archive`);
      const archivedAt = new Date().toISOString();
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.map((item) => (item.id === doubtId ? { ...item, archivedAt } : item))
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId]
  ); */

  const hideLifeDoubtFromTimeline = useCallback(
    async (doubtId: string) => {
      await queueMutation(`/v1/doubts/${doubtId}/archive`);
      const archivedAt = new Date().toISOString();
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.map((item) => (item.id === doubtId ? { ...item, archivedAt, syncStatus: "pending" } : item))
      }));
      markLocalChange();
      return true;
    },
    [markLocalChange, queueMutation]
  );

  /* const handleImportToThinking = useCallback(
    (doubt: { id: string; rawText: string }) => {
      void (async () => {
        try {
          const created = await createThinkingSpaceApi(doubt.rawText, doubt.id);
          if (!created.ok) {
            showNotice(created.message === `娲昏穬绌洪棿涓婇檺涓?${MAX_ACTIVE_SPACES}` ? RESTORE_OVER_LIMIT_NOTICE : created.message);
            return;
          }
          const hidden = await hideLifeDoubtFromTimeline(doubt.id);
          if (!hidden) {
            showNotice("宸茶繘鍏ユ€濊矾锛屼絾鏃堕棿鍗＄墖闅愯棌澶辫触");
            return;
          }
          setTab("thinking");
          setThinkingJumpTarget({ spaceId: created.spaceId, mode: "root" });
          showNotice("宸茶繘鍏ユ€濊矾");
          return;
          if (cloudSyncReady) {
            const response = await apiFetch(`/v1/doubts/${doubt.id}/to-thinking`, { method: "POST" });
            if (handleUnauthorized(response)) return;
            if (response.status === 409) {
              showNotice(RESTORE_OVER_LIMIT_NOTICE);
              return;
            }
            if (!response.ok) {
              showNotice("恢复思考失败");
              return;
            }
            const payload = (await response.json().catch(() => ({}))) as { space_id?: string; created?: boolean };
            const spaceId = typeof payload.space_id === "string" ? payload.space_id : null;
            if (!spaceId) {
              showNotice("恢复思考失败");
              return;
            }
            setActiveSpaceId(spaceId);
            await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
            const hidden = await hideLifeDoubtFromTimeline(doubt.id);
            if (!hidden) {
              showNotice("已进入想一想，但时间卡片隐藏失败");
              return;
            }
            setTab("thinking");
            setThinkingJumpTarget({ spaceId, mode: "root" });
            showNotice(payload.created ? "已进入想一想" : "已恢复原空间");
            return;
          }
          const created = await createThinkingSpaceApi(doubt.rawText, doubt.id);
          if (!created.ok) {
            showNotice(created.message === `活跃空间上限为 ${MAX_ACTIVE_SPACES}` ? RESTORE_OVER_LIMIT_NOTICE : created.message);
            return;
          }
          setTab("thinking");
          setThinkingJumpTarget({ spaceId: created.spaceId, mode: "root" });
          showNotice("已进入想一想");
        } catch (error) {
          if (isOfflineNetworkError(error)) {
            const created = await createThinkingSpaceApi(doubt.rawText, doubt.id);
            if (!created.ok) {
              showNotice(created.message === `活跃空间上限为 ${MAX_ACTIVE_SPACES}` ? RESTORE_OVER_LIMIT_NOTICE : created.message);
              return;
            }
            const hidden = await hideLifeDoubtFromTimeline(doubt.id);
            if (!hidden) {
              showNotice("已进入想一想，但时间卡片隐藏失败");
              return;
            }
            setTab("thinking");
            setThinkingJumpTarget({ spaceId: created.spaceId, mode: "root" });
            showNotice("已进入想一想");
            return;
          }
          showNotice("网络异常，请稍后再试");
        }
      })();
    },
    [cloudSyncReady, createThinkingSpaceApi, finalizeCloudWrite, handleUnauthorized, hideLifeDoubtFromTimeline, sessionUser?.userId, showNotice]
  ); */

  const handleImportToThinking = useCallback(
    (doubt: { id: string; rawText: string }) => {
      void (async () => {
        try {
          const created = await createThinkingSpaceApi(doubt.rawText, doubt.id);
          if (!created.ok) {
            showNotice(created.message === `活跃空间上限为 ${MAX_ACTIVE_SPACES}` ? RESTORE_OVER_LIMIT_NOTICE : created.message);
            return;
          }
          const hidden = await hideLifeDoubtFromTimeline(doubt.id);
          if (!hidden) {
            showNotice("已进入想一想，但时间卡片隐藏失败");
            return;
          }
          setTab("thinking");
          setThinkingJumpTarget({ spaceId: created.spaceId, mode: "root" });
          showNotice("已进入想一想");
        } catch {
          showNotice("网络异常，请稍后再试");
        }
      })();
    },
    [createThinkingSpaceApi, hideLifeDoubtFromTimeline, showNotice]
  );

  const manualPullCloud = useCallback(async () => {
    if (backupPreview) {
      return { ok: false as const, error: "正在预览本机备份，请先退出预览" };
    }
    if (!sessionUser || !currentUserOwnerKey) {
      return { ok: false as const, error: "当前不在账号同步模式" };
    }
    const ownerKey = currentUserOwnerKey;
    const metaBelongsToUser = offlineMeta?.ownerMode === "user" && offlineMeta.boundUserId === sessionUser.userId;
    if (!metaBelongsToUser && activeOwnerKey !== ownerKey) {
      return { ok: false as const, error: "本地数据还在绑定确认状态，请先处理本地/云端绑定" };
    }
    if (!isOnline) {
      return { ok: false as const, error: "当前离线，无法拉取云端" };
    }
    if (offlineSyncingRef.current) {
      return { ok: false as const, error: "同步正在进行中" };
    }
    offlineSyncingRef.current = true;
    if (activeOwnerKey !== ownerKey) setActiveOwnerKey(ownerKey);
    setSyncPhase("manual_pull");
    try {
      await refreshFromCloud(activeSpaceIdRef.current, sessionUser.userId, { allowLocalOverwrite: true });
      await clearOfflineOwnerState(getGuestOwnerKey(localProfileIdRef.current || getOrCreateLocalProfileId()));
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LIFE_STORAGE_KEY);
        window.localStorage.removeItem(THINKING_STORAGE_KEY);
      }
      setLatestSyncBackup(null);
      await refreshCloudSyncState(sessionUser.userId);
      await refreshPendingMutationCount(ownerKey, true);
      await refreshDeadLetterMutations(ownerKey);
      setLastSyncError(null);
      setSyncPhase("manual_pull_done");
      showNotice("已拉取云端，本机旧数据已清理");
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastSyncError(message);
      setSyncPhase("error");
      return { ok: false as const, error: message };
    } finally {
      offlineSyncingRef.current = false;
    }
  }, [
    activeOwnerKey,
    backupPreview,
    currentUserOwnerKey,
    isOnline,
    offlineMeta?.boundUserId,
    offlineMeta?.ownerMode,
    refreshCloudSyncState,
    refreshDeadLetterMutations,
    refreshFromCloud,
    refreshPendingMutationCount,
    sessionUser,
    showNotice
  ]);

  const manualUploadLocal = useCallback(async () => {
    if (backupPreview) {
      return { ok: false as const, error: "正在预览本机备份，请先退出预览" };
    }
    if (!sessionUser || !currentUserOwnerKey) {
      return { ok: false as const, error: "当前不在账号同步模式" };
    }
    const ownerKey = currentUserOwnerKey;
    const metaBelongsToUser = offlineMeta?.ownerMode === "user" && offlineMeta.boundUserId === sessionUser.userId;
    if (!metaBelongsToUser && activeOwnerKey !== ownerKey) {
      return { ok: false as const, error: "本地数据还在绑定确认状态，请先处理本地/云端绑定" };
    }
    if (!isOnline) {
      return { ok: false as const, error: "当前离线，无法上传本地改动" };
    }
    if (activeOwnerKey !== ownerKey) setActiveOwnerKey(ownerKey);
    const pendingBeforeUpload = await refreshPendingMutationCount(ownerKey, true);
    if (pendingBeforeUpload === 0 && offlineMeta?.syncState.hasLocalChanges === true) {
      setLastSyncError("local_changes_without_queue");
      setSyncPhase("error");
      return { ok: false as const, error: "本地改动未入队，无法上传；请先复制诊断或拉取云端前保留备份" };
    }
    const result = await runQueuedMutationSync(ownerKey, {
      includeDeferred: true,
      preferredSpaceId: activeSpaceIdRef.current,
      pullAfterUpload: false,
      phase: "manual_push"
    });
    if (result.ok) {
      await refreshCloudSyncState(sessionUser.userId);
      showNotice("本地已上传，等待拉取云端结果");
      return { ok: true as const };
    }
    return { ok: false as const, error: lastSyncError ?? "上传本地改动失败" };
  }, [
    activeOwnerKey,
    backupPreview,
    currentUserOwnerKey,
    isOnline,
    lastSyncError,
    offlineMeta?.boundUserId,
    offlineMeta?.ownerMode,
    offlineMeta?.syncState.hasLocalChanges,
    refreshCloudSyncState,
    refreshPendingMutationCount,
    runQueuedMutationSync,
    sessionUser,
    showNotice
  ]);

  const manualOverwriteCloud = useCallback(async () => {
    if (!sessionUser || !currentUserOwnerKey) {
      return { ok: false as const, error: "当前不在账号同步模式" };
    }
    const ownerKey = currentUserOwnerKey;
    const metaBelongsToUser = offlineMeta?.ownerMode === "user" && offlineMeta.boundUserId === sessionUser.userId;
    if (!metaBelongsToUser && activeOwnerKey !== ownerKey) {
      return { ok: false as const, error: "本地数据还在绑定确认状态，请先处理本地/云端绑定" };
    }
    if (!isOnline) {
      return { ok: false as const, error: "当前离线，无法覆盖云端" };
    }
    if (offlineSyncingRef.current) {
      return { ok: false as const, error: "同步正在进行中" };
    }
    offlineSyncingRef.current = true;
    if (activeOwnerKey !== ownerKey) setActiveOwnerKey(ownerKey);
    setSyncPhase("manual_overwrite");
    try {
      const result = await overwriteCloudWithLocalSnapshot(sessionUser, ownerKey, "manual_overwrite_cloud");
      if (!result.ok) {
        setLastSyncError(result.error);
        setSyncPhase("error");
        return result;
      }
      setSyncPhase("manual_overwrite_done");
      showNotice(result.backupCreated ? "本地已覆盖云端，本地备份可恢复" : "本地已覆盖云端");
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastSyncError(message);
      setSyncPhase("error");
      return { ok: false as const, error: message };
    } finally {
      offlineSyncingRef.current = false;
    }
  }, [
    activeOwnerKey,
    currentUserOwnerKey,
    isOnline,
    offlineMeta?.boundUserId,
    offlineMeta?.ownerMode,
    overwriteCloudWithLocalSnapshot,
    sessionUser,
    showNotice
  ]);

  const previewLatestSyncBackup = useCallback(async () => {
    const ownerKey = activeOwnerKey;
    const backup =
      latestSyncBackup && latestSyncBackup.ownerKey === ownerKey
        ? latestSyncBackup
        : await refreshLatestSyncBackup(ownerKey);
    if (!ownerKey || !backup) return { ok: false as const, error: "暂无可查看的本机备份" };
    if (thinkingView) {
      thinkingViewCacheRef.current[thinkingView.spaceId] = thinkingView;
    }
    const previousSnapshot: OfflineSnapshot = {
      lifeStore,
      thinkingStore,
      activeSpaceId,
      thinkingViews: thinkingViewCacheRef.current,
      savedAt: new Date().toISOString(),
      meta:
        offlineMeta ??
        createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId(), {
          ownerMode: sessionUser ? "user" : "guest",
          boundUserId: sessionUser?.userId ?? null
        })
    };
    setBackupPreview({ backup, previousSnapshot });
    applySnapshotToState(backup.snapshot);
    setLastSyncError(null);
    setSyncPhase("ready");
    showNotice("正在预览本机备份，不会自动同步");
    return { ok: true as const };
  }, [
    activeSpaceId,
    activeOwnerKey,
    applySnapshotToState,
    lifeStore,
    latestSyncBackup,
    refreshLatestSyncBackup,
    offlineMeta,
    sessionUser,
    showNotice,
    thinkingStore,
    thinkingView
  ]);

  const exitBackupPreview = useCallback(async () => {
    if (!backupPreview) return;
    const ownerKey = activeOwnerKey;
    applySnapshotToState(backupPreview.previousSnapshot);
    setBackupPreview(null);
    if (ownerKey) {
      await refreshPendingMutationCount(ownerKey, true);
      await refreshDeadLetterMutations(ownerKey);
      await refreshLatestSyncBackup(ownerKey);
    }
    setLastSyncError(null);
    setSyncPhase("ready");
    showNotice("已退出备份预览");
  }, [
    activeOwnerKey,
    applySnapshotToState,
    backupPreview,
    refreshDeadLetterMutations,
    refreshLatestSyncBackup,
    refreshPendingMutationCount,
    showNotice
  ]);

  const overwriteCloudWithBackupPreview = useCallback(async () => {
    if (!backupPreview) return { ok: false as const, error: "当前没有正在预览的本机备份" };
    const result = await manualOverwriteCloud();
    if (result.ok) {
      setBackupPreview(null);
    }
    return result;
  }, [backupPreview, manualOverwriteCloud]);

  const handleCreateThinkingFromInput = useCallback(
    async (rawInput: string) => {
      const result = await createThinkingSpaceApi(rawInput, null);
      if (!result.ok) return result;
      return {
        ok: true as const,
        converted: result.converted,
        createdAsStatement: result.createdAsStatement,
        suggestedQuestions: result.suggestedQuestions,
        questionSuggestion: result.questionSuggestion,
        spaceId: result.spaceId
      };
    },
    [createThinkingSpaceApi]
  );

  /* const handleCreateThinkingScratch = useCallback(
    async (rawText: string) => {
      const now = new Date().toISOString();
      const localScratchId = createId();
      const payload = {
        raw_text: rawText,
        client_entity_id: localScratchId,
        client_updated_at: now
      };
      await queueMutation("/v1/thinking/scratch", payload);
      setThinkingStore((prev) => ({
        ...prev,
        scratch: [
          {
            id: localScratchId,
            rawText,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
            derivedSpaceId: null,
            fedTimeDoubtId: null,
            syncStatus: "pending"
          },
          ...prev.scratch.filter((item) => item.id !== localScratchId)
        ]
      }));
      markLocalChange();
      return true;
      if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/thinking/scratch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation("/v1/thinking/scratch", payload);
      setThinkingStore((prev) => ({
        ...prev,
        scratch: [
          {
            id: localScratchId,
            rawText,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
            derivedSpaceId: null,
            fedTimeDoubtId: null
          },
          ...prev.scratch.filter((item) => item.id !== localScratchId)
        ]
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId]
  ); */

  const handleCreateThinkingScratch = useCallback(
    async (rawText: string) => {
      const now = new Date().toISOString();
      const localScratchId = createId();
      await queueMutation("/v1/thinking/scratch", {
        raw_text: rawText,
        client_entity_id: localScratchId,
        client_updated_at: now
      });
      setThinkingStore((prev) => ({
        ...prev,
        scratch: [
          {
            id: localScratchId,
            rawText,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
            derivedSpaceId: null,
            fedTimeDoubtId: null,
            syncStatus: "pending"
          },
          ...prev.scratch.filter((item) => item.id !== localScratchId)
        ]
      }));
      markLocalChange();
      return true;
    },
    [markLocalChange, queueMutation]
  );

  const feedThinkingScratchToTimeLocal = useCallback(
    async (scratchId: string, preferredDoubtId?: string | null) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch || scratch.derivedSpaceId) return false;
      const doubtId = preferredDoubtId ?? scratch.fedTimeDoubtId ?? createId();
      const existingDoubt = scratch.fedTimeDoubtId ? lifeStore.doubts.find((item) => item.id === scratch.fedTimeDoubtId) ?? null : null;
      const createdAt = existingDoubt?.createdAt ?? scratch.createdAt;
      setLifeStore((prev) => ({
        ...prev,
        doubts: [
          {
            id: doubtId,
            rawText: scratch.rawText,
            firstNodePreview: existingDoubt?.firstNodePreview ?? null,
            lastNodePreview: existingDoubt?.lastNodePreview ?? null,
            createdAt,
            archivedAt: null,
            deletedAt: null,
            syncStatus: "pending"
          },
          ...prev.doubts.filter((item) => item.id !== doubtId)
        ]
      }));
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
    },
    [lifeStore.doubts, markLocalChange, thinkingStore.scratch]
  );

  /* const convertScratchToSpaceLocal = useCallback(
    async (scratchId: string, clientSpaceId?: string | null, clientParkingTrackId?: string | null) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch) return { ok: false as const, message: "随记不存在" };
      if (scratch.fedTimeDoubtId) return { ok: false as const, message: "该随记已封存" };

      if (scratch.derivedSpaceId) {
        const existing = thinkingStore.spaces.find((space) => space.id === scratch.derivedSpaceId) ?? null;
        if (existing) {
          const existingView = getLocalSpaceView(existing.id);
          setActiveSpaceId(existing.id);
          if (existingView) setThinkingView(existingView);
          return { ok: true as const, spaceId: existing.id };
        }
      }

      const now = new Date().toISOString();
      const created = createLocalThinkingSpace({
        rootQuestionText: scratch.rawText,
        sourceTimeDoubtId: null,
        spaceId: clientSpaceId ?? createId(),
        parkingTrackId: clientParkingTrackId ?? createId(),
        createdAt: now
      });
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.map((item) =>
          item.id === scratchId
            ? {
                ...item,
                derivedSpaceId: created.spaceId,
                updatedAt: now,
                syncStatus: "pending"
              }
            : item
        )
      }));
      markLocalChange();
      return { ok: true as const, spaceId: created.spaceId };
    },
    [createLocalThinkingSpace, getLocalSpaceView, markLocalChange, thinkingStore.spaces, thinkingStore.scratch]
  ); */

  const convertScratchToSpaceLocal = useCallback(
    async (scratchId: string, clientSpaceId?: string | null, clientParkingTrackId?: string | null) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch) return { ok: false as const, message: "随记不存在" };
      if (scratch.fedTimeDoubtId) return { ok: false as const, message: "该随记已封存" };
      if (scratch.derivedSpaceId) {
        const existing = thinkingStore.spaces.find((space) => space.id === scratch.derivedSpaceId) ?? null;
        if (existing) {
          const existingView = getLocalSpaceView(existing.id);
          setActiveSpaceId(existing.id);
          if (existingView) setThinkingView(existingView);
          return { ok: true as const, spaceId: existing.id };
        }
      }
      const activeCount = thinkingStore.spaces.filter((space) => space.status === "active").length;
      if (activeCount >= MAX_ACTIVE_SPACES) {
        return { ok: false as const, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
      }

      const now = new Date().toISOString();
      const created = createLocalThinkingSpace({
        rootQuestionText: scratch.rawText,
        sourceTimeDoubtId: null,
        spaceId: clientSpaceId ?? createId(),
        parkingTrackId: clientParkingTrackId ?? createId(),
        createdAt: now
      });
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.map((item) =>
          item.id === scratchId
            ? {
                ...item,
                derivedSpaceId: created.spaceId,
                updatedAt: now,
                syncStatus: "pending"
              }
            : item
        )
      }));
      markLocalChange();
      return { ok: true as const, spaceId: created.spaceId };
    },
    [createLocalThinkingSpace, getLocalSpaceView, markLocalChange, thinkingStore.spaces, thinkingStore.scratch]
  );

  /* const handleFeedThinkingScratchToTime = useCallback(
    async (scratchId: string) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch || scratch.derivedSpaceId) return false;
      const clientDoubtId = scratch.fedTimeDoubtId ?? createId();
      await queueMutation(`/v1/thinking/scratch/${scratchId}/feed-to-time`, {
        client_doubt_id: clientDoubtId,
        client_updated_at: new Date().toISOString()
      });
      return feedThinkingScratchToTimeLocal(scratchId, clientDoubtId);
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/feed-to-time`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
          await queueMutation(`/v1/thinking/scratch/${scratchId}/feed-to-time`);
        }
      }
      return feedThinkingScratchToTimeLocal(scratchId);
    },
    [
      cloudSyncReady,
      feedThinkingScratchToTimeLocal,
      finalizeCloudWrite,
      handleUnauthorized,
      queueMutation,
      sessionUser?.userId,
    ]
  ); */

  const handleFeedThinkingScratchToTime = useCallback(
    async (scratchId: string) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch || scratch.derivedSpaceId) return false;
      const clientDoubtId = scratch.fedTimeDoubtId ?? createId();
      await queueMutation(`/v1/thinking/scratch/${scratchId}/feed-to-time`, {
        client_doubt_id: clientDoubtId,
        client_updated_at: new Date().toISOString()
      });
      return feedThinkingScratchToTimeLocal(scratchId, clientDoubtId);
    },
    [feedThinkingScratchToTimeLocal, queueMutation, thinkingStore.scratch]
  );

  /* const handleDeleteThinkingScratch = useCallback(
    async (scratchId: string) => {
      await queueMutation(`/v1/thinking/scratch/${scratchId}/delete`);
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
          await queueMutation(`/v1/thinking/scratch/${scratchId}/delete`);
        }
      }
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId]
  ); */

  const handleDeleteThinkingScratch = useCallback(
    async (scratchId: string) => {
      await queueMutation(`/v1/thinking/scratch/${scratchId}/delete`);
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
    },
    [markLocalChange, queueMutation]
  );

  /* const handleScratchToSpace = useCallback(
    async (scratchId: string) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch) return { ok: false as const, message: "闅忚涓嶅瓨鍦? };
      if (scratch.fedTimeDoubtId) return { ok: false as const, message: "璇ラ殢璁板凡鍐欏叆鏃堕棿" };
      if (scratch.derivedSpaceId) {
        const existing = thinkingStore.spaces.find((space) => space.id === scratch.derivedSpaceId) ?? null;
        if (existing) {
          const existingView = getLocalSpaceView(existing.id);
          setActiveSpaceId(existing.id);
          if (existingView) setThinkingView(existingView);
          return { ok: true as const, spaceId: existing.id };
        }
      }
      const clientSpaceId = createId();
      const clientParkingTrackId = createId();
      await queueMutation(`/v1/thinking/scratch/${scratchId}/to-space`, {
        client_space_id: clientSpaceId,
        client_parking_track_id: clientParkingTrackId,
        client_updated_at: new Date().toISOString()
      });
      return convertScratchToSpaceLocal(scratchId, clientSpaceId, clientParkingTrackId);
      if (!cloudSyncReady) {
        return convertScratchToSpaceLocal(scratchId);
      }
      try {
        const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/to-space`, { method: "POST" });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const body = (await response.json().catch(() => ({}))) as { space_id?: string };
        if (response.status === 409) return { ok: false as const, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
        if (!response.ok || typeof body.space_id !== "string") return { ok: false as const, message: "转为空间失败" };

        const spaceId = body.space_id;
        setActiveSpaceId(spaceId);
        await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
        return { ok: true as const, spaceId };
      } catch (error) {
        if (!isOfflineNetworkError(error)) {
          return { ok: false as const, message: "网络异常，请稍后再试" };
        }
        await queueMutation(`/v1/thinking/scratch/${scratchId}/to-space`);
        return convertScratchToSpaceLocal(scratchId);
      }
    },
    [
      cloudSyncReady,
      convertScratchToSpaceLocal,
      finalizeCloudWrite,
      handleUnauthorized,
      queueMutation,
      sessionUser?.userId,
    ]
  ); */

  const handleScratchToSpace = useCallback(
    async (scratchId: string) => {
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch) return { ok: false as const, message: "随记不存在" };
      if (scratch.fedTimeDoubtId) return { ok: false as const, message: "该随记已封存" };
      if (scratch.derivedSpaceId) {
        const existing = thinkingStore.spaces.find((space) => space.id === scratch.derivedSpaceId) ?? null;
        if (existing) {
          const existingView = getLocalSpaceView(existing.id);
          setActiveSpaceId(existing.id);
          if (existingView) setThinkingView(existingView);
          return { ok: true as const, spaceId: existing.id };
        }
      }

      const clientSpaceId = createId();
      const clientParkingTrackId = createId();
      await queueMutation(`/v1/thinking/scratch/${scratchId}/to-space`, {
        client_space_id: clientSpaceId,
        client_parking_track_id: clientParkingTrackId,
        client_updated_at: new Date().toISOString()
      });
      return convertScratchToSpaceLocal(scratchId, clientSpaceId, clientParkingTrackId);
    },
    [convertScratchToSpaceLocal, getLocalSpaceView, queueMutation, thinkingStore.scratch, thinkingStore.spaces]
  );

  /* const handleThinkingAddQuestion = useCallback(
    async (
      spaceId: string,
      payload: { rawInput: string; trackId: string | null; fromSuggestion?: boolean }
    ) => {
      const now = new Date().toISOString();
      const localNodeId = createId();
      let resolvedTrackId = payload.trackId;
      if (!resolvedTrackId || resolvedTrackId.startsWith("track:")) {
        const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
        const currentTrackId = currentView?.currentTrackId ?? null;
        if (currentTrackId && currentTrackId !== currentView?.parkingTrackId) {
          resolvedTrackId = currentTrackId;
        } else {
          resolvedTrackId = createId();
        }
      }
      const normalizedTrackId = resolvedTrackId === "__new__" ? createId() : resolvedTrackId;
      if (!normalizedTrackId) {
        return { ok: false as const, message: "绂荤嚎娣诲姞澶辫触" };
      }
      await queueMutation(`/v1/thinking/spaces/${spaceId}/questions`, {
        raw_text: payload.rawInput,
        track_id: normalizedTrackId,
        from_suggestion: payload.fromSuggestion === true,
        client_node_id: localNodeId,
        client_created_at: now,
        client_updated_at: now
      });
      const patchNode = {
        id: localNodeId,
        questionText: payload.rawInput.trim(),
        imageAssetId: null,
        noteText: null,
        answerText: null,
        isSuggested: payload.fromSuggestion === true,
        dimension: classifyDimension(nextQuestion),
        createdAt: now,
        echoTrackId: null,
        echoNodeId: null
      };
      const current = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (current) {
        const trackExists = current.tracks.some((item) => item.id === normalizedTrackId);
        const nextTracks = trackExists
          ? current.tracks.map((track) => {
              if (track.id !== normalizedTrackId) return track;
              const nextNodes = [...track.nodes, patchNode];
              return {
                ...track,
                titleQuestionText:
                  !track.isParking && (track.titleQuestionText === "鏂版柟鍚? || !track.titleQuestionText.trim())
                    ? patchNode.questionText
                    : track.titleQuestionText,
                nodeCount: nextNodes.length,
                nodes: nextNodes
              };
            })
          : (() => {
              const withoutTarget = current.tracks.filter((track) => track.id !== normalizedTrackId);
              const parkingTrack = withoutTarget.find((track) => track.id === current.parkingTrackId) ?? null;
              const nonParkingTracks = withoutTarget.filter((track) => track.id !== current.parkingTrackId);
              const createdTrack = {
                id: normalizedTrackId,
                titleQuestionText: patchNode.questionText,
                isParking: false,
                isEmpty: false,
                nodeCount: 1,
                nodes: [patchNode]
              };
              return parkingTrack ? [...nonParkingTracks, createdTrack, parkingTrack] : [...nonParkingTracks, createdTrack];
            })();
        const nextView = {
          ...current,
          currentTrackId: normalizedTrackId,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(spaceId, nextView);
        setThinkingStore((prev) => {
          const synced = syncStoreNodesFromView(prev, spaceId, nextView);
          return {
            ...synced,
            spaces: synced.spaces.map((space) =>
              space.id === spaceId
                ? {
                    ...space,
                    lastActivityAt: now
                  }
                : space
            ),
            spaceMeta: synced.spaceMeta.map((meta) =>
              meta.spaceId === spaceId
                ? {
                    ...meta,
                    lastTrackId: normalizedTrackId,
                    pendingTrackId: meta.pendingTrackId === normalizedTrackId ? null : meta.pendingTrackId,
                    emptyTrackIds: (meta.emptyTrackIds ?? []).filter((trackId) => trackId !== normalizedTrackId)
                  }
                : meta
            )
          };
        });
      }
      markLocalChange();
      return {
        ok: true as const,
        converted: false,
        noteText: null,
        trackId: normalizedTrackId,
        nodeId: localNodeId,
        suggestedQuestions: []
      };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              raw_text: payload.rawInput,
              track_id: payload.trackId,
              from_suggestion: payload.fromSuggestion === true,
              client_node_id: localNodeId,
              client_created_at: now,
              client_updated_at: now
            })
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          const body = (await response.json().catch(() => ({}))) as {
            node_id?: string;
            converted?: boolean;
            note_text?: string | null;
            track_id?: string;
            error?: string;
            suggested_questions?: string[];
            related_candidate?: { node_id?: string; preview?: string; score?: number } | null;
          };
          if (!response.ok) {
            if (response.status === 409) return { ok: false as const, message: "该空间已只读" };
            if (response.status === 400) return { ok: false as const, message: typeof body.error === "string" ? body.error : "输入过短" };
            return { ok: false as const, message: "放入结构失败" };
          }
          if (typeof body.node_id !== "string" || !body.node_id.trim()) {
            return { ok: false as const, message: "放入结构失败：未返回节点标识" };
          }
          await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
          return {
            ok: true as const,
            converted: body.converted === true,
            noteText: typeof body.note_text === "string" ? body.note_text : null,
            trackId: typeof body.track_id === "string" ? body.track_id : payload.trackId ?? "",
            nodeId: body.node_id,
            suggestedQuestions: Array.isArray(body.suggested_questions) ? body.suggested_questions : []
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      let resolvedTrackId = payload.trackId;
      if (!resolvedTrackId || resolvedTrackId.startsWith("track:")) {
        const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
        const currentTrackId = currentView?.currentTrackId ?? null;
        if (currentTrackId && currentTrackId !== currentView?.parkingTrackId) {
          resolvedTrackId = currentTrackId;
        } else {
          resolvedTrackId = createId();
        }
      }
      const normalizedTrackId = resolvedTrackId === "__new__" ? createId() : resolvedTrackId;
      if (!normalizedTrackId) {
        return { ok: false as const, message: "离线添加失败" };
      }

      await queueMutation(`/v1/thinking/spaces/${spaceId}/questions`, {
        raw_text: payload.rawInput,
        track_id: normalizedTrackId,
        from_suggestion: payload.fromSuggestion === true,
        client_node_id: localNodeId,
        client_created_at: now,
        client_updated_at: now
      });

      const patchNode = {
        id: localNodeId,
        questionText: payload.rawInput.trim(),
        imageAssetId: null,
        noteText: null,
        answerText: null,
        isSuggested: payload.fromSuggestion === true,
        createdAt: now,
        echoTrackId: null,
        echoNodeId: null
      };

      const current = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (current) {
        const trackExists = current.tracks.some((item) => item.id === normalizedTrackId);
        const nextTracks = trackExists
          ? current.tracks.map((track) => {
              if (track.id !== normalizedTrackId) return track;
              const nextNodes = [...track.nodes, patchNode];
              return {
                ...track,
                titleQuestionText:
                  !track.isParking && (track.titleQuestionText === "新方向" || !track.titleQuestionText.trim())
                    ? patchNode.questionText
                    : track.titleQuestionText,
                nodeCount: nextNodes.length,
                nodes: nextNodes
              };
            })
          : (() => {
              const withoutTarget = current.tracks.filter((track) => track.id !== normalizedTrackId);
              const parkingTrack = withoutTarget.find((track) => track.id === current.parkingTrackId) ?? null;
              const nonParkingTracks = withoutTarget.filter((track) => track.id !== current.parkingTrackId);
              const createdTrack = {
                id: normalizedTrackId,
                titleQuestionText: patchNode.questionText,
                isParking: false,
                isEmpty: false,
                nodeCount: 1,
                nodes: [patchNode]
              };
              return parkingTrack ? [...nonParkingTracks, createdTrack, parkingTrack] : [...nonParkingTracks, createdTrack];
            })();
        const nextView: ThinkingSpaceView = {
          ...current,
          currentTrackId: normalizedTrackId,
          tracks: nextTracks
        };
        thinkingViewCacheRef.current[spaceId] = nextView;
        if (thinkingView?.spaceId === spaceId) setThinkingView(nextView);
      }

      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                lastActivityAt: now
              }
            : space
        ),
        nodes: [
          ...prev.nodes,
          {
            id: localNodeId,
            spaceId,
            parentNodeId: `track:${normalizedTrackId}`,
            rawQuestionText: patchNode.questionText,
            createdAt: now,
            orderIndex: prev.nodes.filter((node) => node.spaceId === spaceId).length,
            isSuggested: patchNode.isSuggested,
            state: "normal",
            dimension: "definition"
          }
        ]
      }));
      markLocalChange();
      return {
        ok: true as const,
        converted: false,
        noteText: null,
        trackId: normalizedTrackId,
        nodeId: localNodeId,
        suggestedQuestions: []
      };
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId, thinkingView]
  ); */

  const handleThinkingAddQuestion = useCallback(
    async (
      spaceId: string,
      payload: { rawInput: string; trackId: string | null; fromSuggestion?: boolean }
    ) => {
      const now = new Date().toISOString();
      const nextQuestion = normalizeThinkingMultilineText(payload.rawInput);
      if (!nextQuestion) {
        return { ok: false as const, message: "输入过短" };
      }

      const localNodeId = createId();
      let resolvedTrackId = payload.trackId;
      if (!resolvedTrackId || resolvedTrackId.startsWith("track:")) {
        const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
        const currentTrackId = currentView?.currentTrackId ?? null;
        if (currentTrackId && currentTrackId !== currentView?.parkingTrackId) {
          resolvedTrackId = currentTrackId;
        } else {
          resolvedTrackId = createId();
        }
      }
      const normalizedTrackId = resolvedTrackId === "__new__" ? createId() : resolvedTrackId;
      if (!normalizedTrackId) {
        return { ok: false as const, message: "添加结构失败" };
      }

      await queueMutation(`/v1/thinking/spaces/${spaceId}/questions`, {
        raw_text: payload.rawInput,
        track_id: normalizedTrackId,
        from_suggestion: payload.fromSuggestion === true,
        client_node_id: localNodeId,
        client_created_at: now,
        client_updated_at: now
      });

      const patchNode = {
        id: localNodeId,
        questionText: nextQuestion,
        imageAssetId: null,
        noteText: null,
        answerText: null,
        isSuggested: payload.fromSuggestion === true,
        dimension: classifyDimension(nextQuestion),
        createdAt: now,
        echoTrackId: null,
        echoNodeId: null
      };
      const current = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (current) {
        const trackExists = current.tracks.some((item) => item.id === normalizedTrackId);
        const nextTracks = trackExists
          ? current.tracks.map((track) => {
              if (track.id !== normalizedTrackId) return track;
              const nextNodes = [...track.nodes, patchNode];
              return {
                ...track,
                isEmpty: false,
                titleQuestionText:
                  !track.isParking && (!track.titleQuestionText.trim() || track.titleQuestionText === "New track")
                    ? patchNode.questionText
                    : track.titleQuestionText,
                nodeCount: nextNodes.length,
                nodes: nextNodes
              };
            })
          : (() => {
              const withoutTarget = current.tracks.filter((track) => track.id !== normalizedTrackId);
              const parkingTrack = withoutTarget.find((track) => track.id === current.parkingTrackId) ?? null;
              const nonParkingTracks = withoutTarget.filter((track) => track.id !== current.parkingTrackId);
              const createdTrack = {
                id: normalizedTrackId,
                titleQuestionText: patchNode.questionText,
                isParking: false,
                isEmpty: false,
                nodeCount: 1,
                nodes: [patchNode]
              };
              return parkingTrack ? [...nonParkingTracks, createdTrack, parkingTrack] : [...nonParkingTracks, createdTrack];
            })();
        const nextView = {
          ...current,
          currentTrackId: normalizedTrackId,
          pendingTrackId: current.pendingTrackId === normalizedTrackId ? null : current.pendingTrackId,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(spaceId, nextView);
        setThinkingStore((prev) => {
          const synced = syncStoreNodesFromView(prev, spaceId, nextView);
          return {
            ...synced,
            spaces: synced.spaces.map((space) =>
              space.id === spaceId
                ? {
                    ...space,
                    lastActivityAt: now
                  }
                : space
            ),
            spaceMeta: synced.spaceMeta.map((meta) =>
              meta.spaceId === spaceId
                ? {
                    ...meta,
                    lastTrackId: normalizedTrackId,
                    pendingTrackId: meta.pendingTrackId === normalizedTrackId ? null : meta.pendingTrackId,
                    emptyTrackIds: (meta.emptyTrackIds ?? []).filter((trackId) => trackId !== normalizedTrackId)
                  }
                : meta
            )
          };
        });
      }
      markLocalChange();
      return {
        ok: true as const,
        converted: false,
        noteText: null,
        trackId: normalizedTrackId,
        nodeId: localNodeId,
        suggestedQuestions: []
      };
    },
    [commitLocalSpaceView, markLocalChange, queueMutation, thinkingView]
  );

  const handleThinkingOrganizePreview = useCallback(
    async (spaceId: string) => {
      if (!cloudSyncReady) return [];
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/organize-preview`, { method: "POST" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) return [];
        const body = (await response.json().catch(() => ({}))) as {
          candidates?: Array<{ node_id?: string; preview?: string; from_track_id?: string; suggested_track_id?: string; score?: number }>;
        };
        return (body.candidates ?? [])
          .filter((item) => typeof item.node_id === "string" && typeof item.from_track_id === "string" && typeof item.suggested_track_id === "string")
          .map((item) => ({
            nodeId: item.node_id as string,
            preview: typeof item.preview === "string" ? item.preview : "",
            fromTrackId: item.from_track_id as string,
            suggestedTrackId: item.suggested_track_id as string,
            score: Number.isFinite(item.score) ? Number(item.score) : 0
          }));
      } catch {
        return [];
      }
    },
    [cloudSyncReady, handleUnauthorized]
  );

  /* const handleThinkingOrganizeApply = useCallback(
    async (spaceId: string, moves: Array<{ nodeId: string; targetTrackId: string }>) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return { ok: false as const, message: "当前空间未加载完成" };
        const movingIds = new Set(moves.map((item) => item.nodeId));
        let resolvedTargetTrackId = moves[0]?.targetTrackId ?? "__new__";
        let nextTracks = currentView.tracks.map((track) => ({
          ...track,
          nodes: track.nodes.filter((node) => !movingIds.has(node.id))
        }));
        const movedNodes = currentView.tracks.flatMap((track) => track.nodes.filter((node) => movingIds.has(node.id)));
        if (!movedNodes.length) return { ok: true as const, movedCount: 0 };
        if (resolvedTargetTrackId === "__new__") {
          resolvedTargetTrackId = createId();
          const createdTrack = {
            id: resolvedTargetTrackId,
            titleQuestionText: movedNodes[0]?.questionText ?? "新方向",
            isParking: false,
            isEmpty: false,
            nodeCount: movedNodes.length,
            nodes: movedNodes
          };
          const parkingTrackId = currentView.parkingTrackId;
          const parkingIndex = parkingTrackId ? nextTracks.findIndex((track) => track.id === parkingTrackId) : -1;
          if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, createdTrack);
          else nextTracks.push(createdTrack);
        } else {
          nextTracks = nextTracks.map((track) =>
            track.id === resolvedTargetTrackId ? { ...track, nodes: [...track.nodes, ...movedNodes], isEmpty: false } : track
          );
        }
        const linkedTracks = normalizeTrackList(nextTracks);
        const nextView: ThinkingSpaceView = {
          ...currentView,
          tracks: linkedTracks
        };
        commitLocalSpaceView(spaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, spaceId, nextView));
        markLocalChange();
        return { ok: true as const, movedCount: movedNodes.length };
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/organize-apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moves: moves.map((item) => ({ node_id: item.nodeId, target_track_id: item.targetTrackId }))
          })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const body = (await response.json().catch(() => ({}))) as { moved_count?: number; error?: string };
        if (!response.ok) return { ok: false as const, message: typeof body.error === "string" ? body.error : "整理失败" };
        await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
        return { ok: true as const, movedCount: Number.isFinite(body.moved_count) ? Number(body.moved_count) : 0 };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, markLocalChange, sessionUser?.userId]
  ); */

  const handleThinkingOrganizeApply = useCallback(
    async (spaceId: string, moves: Array<{ nodeId: string; targetTrackId: string }>) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return { ok: false as const, message: "当前空间未加载完成" };

      const movingIds = new Set(moves.map((item) => item.nodeId));
      const movedNodes = currentView.tracks.flatMap((track) => track.nodes.filter((node) => movingIds.has(node.id)));
      if (!movedNodes.length) return { ok: true as const, movedCount: 0 };

      let resolvedTargetTrackId = moves[0]?.targetTrackId ?? "__new__";
      if (!resolvedTargetTrackId || resolvedTargetTrackId === "__new__") {
        resolvedTargetTrackId = createId();
      }
      await queueMutation(`/v1/thinking/spaces/${spaceId}/organize-apply`, {
        moves: moves.map((item) => ({
          node_id: item.nodeId,
          target_track_id: item.targetTrackId === "__new__" ? resolvedTargetTrackId : item.targetTrackId
        })),
        client_updated_at: new Date().toISOString()
      });

      let nextTracks = currentView.tracks.map((track) => ({
        ...track,
        nodes: track.nodes.filter((node) => !movingIds.has(node.id))
      }));
      const trackExists = nextTracks.some((track) => track.id === resolvedTargetTrackId);
      if (!trackExists) {
        const createdTrack = {
          id: resolvedTargetTrackId,
          titleQuestionText: movedNodes[0]?.questionText ?? "New track",
          isParking: false,
          isEmpty: false,
          nodeCount: movedNodes.length,
          nodes: movedNodes
        };
        const parkingIndex = currentView.parkingTrackId ? nextTracks.findIndex((track) => track.id === currentView.parkingTrackId) : -1;
        if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, createdTrack);
        else nextTracks.push(createdTrack);
      } else {
        nextTracks = nextTracks.map((track) =>
          track.id === resolvedTargetTrackId ? { ...track, nodes: [...track.nodes, ...movedNodes], isEmpty: false } : track
        );
      }

      const nextView: ThinkingSpaceView = {
        ...currentView,
        currentTrackId: resolvedTargetTrackId,
        tracks: normalizeTrackList(nextTracks)
      };
      commitLocalSpaceView(spaceId, nextView);
      setThinkingStore((prev) => syncStoreNodesFromView(prev, spaceId, nextView));
      markLocalChange();
      return { ok: true as const, movedCount: movedNodes.length };
    },
    [commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation]
  );

  /* const handleThinkingMoveNode = useCallback(
    async (nodeId: string, targetTrackId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!movingNode) return false;
        const nextTracks = currentView.tracks.map((track) =>
          track.id === targetTrackId
            ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
            : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
        );
        const nextView = {
          ...currentView,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_track_id: targetTrackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, markLocalChange, sessionUser?.userId]
  ); */

  const handleThinkingMoveNode = useCallback(
    async (nodeId: string, targetTrackId: string) => {
      if (!activeSpaceId) return false;
      const currentView = getLocalSpaceView(activeSpaceId);
      if (!currentView) return false;
      const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
      if (!movingNode) return false;
      await queueMutation(`/v1/thinking/nodes/${nodeId}/move`, {
        target_track_id: targetTrackId,
        client_updated_at: new Date().toISOString()
      });
      const nextTracks = currentView.tracks.map((track) =>
        track.id === targetTrackId
          ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
          : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
      );
      const nextView = {
        ...currentView,
        currentTrackId: targetTrackId,
        tracks: normalizeTrackList(nextTracks)
      };
      commitLocalSpaceView(activeSpaceId, nextView);
      setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
      markLocalChange();
      return true;
    },
    [activeSpaceId, commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation]
  );

  /* const handleThinkingDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        const removedNode = thinkingStore.nodes.find((node) => node.id === nodeId) ?? null;
        const nextTracks = currentView.tracks.map((track) => ({
          ...track,
          nodes: track.nodes.filter((node) => node.id !== nodeId)
        }));
        const nextView = {
          ...currentView,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        let removedAssetIds: string[] = [];
        setThinkingStore((prev) => {
          const nextStore = {
            ...syncStoreNodesFromView(prev, activeSpaceId, nextView)
          };
          removedAssetIds = collectUnreferencedMediaAssetIds(nextStore, removedNode?.imageAssetId ? [removedNode.imageAssetId] : []);
          if (removedAssetIds.length) {
            nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
          }
          return nextStore;
        });
        await markMediaAssetsDeletedLocally(removedAssetIds);
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/delete`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [
      activeSpaceId,
      cloudSyncReady,
      commitLocalSpaceView,
      getLocalSpaceView,
      finalizeCloudWrite,
      handleUnauthorized,
      markLocalChange,
      markMediaAssetsDeletedLocally,
      sessionUser?.userId,
      thinkingStore.nodes
    ]
  ); */

  const handleThinkingDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!activeSpaceId) return false;
      const currentView = getLocalSpaceView(activeSpaceId);
      if (!currentView) return false;
      await queueMutation(`/v1/thinking/nodes/${nodeId}/delete`, {
        client_updated_at: new Date().toISOString()
      });
      const removedNode = thinkingStore.nodes.find((node) => node.id === nodeId) ?? null;
      const nextTracks = currentView.tracks.map((track) => ({
        ...track,
        nodes: track.nodes.filter((node) => node.id !== nodeId)
      }));
      const nextView = {
        ...currentView,
        tracks: normalizeTrackList(nextTracks)
      };
      commitLocalSpaceView(activeSpaceId, nextView);
      let removedAssetIds: string[] = [];
      setThinkingStore((prev) => {
        const nextStore = {
          ...syncStoreNodesFromView(prev, activeSpaceId, nextView)
        };
        removedAssetIds = collectUnreferencedMediaAssetIds(nextStore, removedNode?.imageAssetId ? [removedNode.imageAssetId] : []);
        if (removedAssetIds.length) {
          nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
        }
        return nextStore;
      });
      await markMediaAssetsDeletedLocally(removedAssetIds);
      markLocalChange();
      return true;
    },
    [activeSpaceId, commitLocalSpaceView, getLocalSpaceView, markLocalChange, markMediaAssetsDeletedLocally, queueMutation, thinkingStore.nodes]
  );

  /* const handleThinkingUpdateNode = useCallback(
    async (nodeId: string, rawQuestionText: string) => {
      const now = new Date().toISOString();
      const payload = { raw_question_text: rawQuestionText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation(`/v1/thinking/nodes/${nodeId}/update`, payload);
      const nextQuestion = normalizeThinkingMultilineText(rawQuestionText);
      if (!nextQuestion) return false;
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, questionText: nextQuestion } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      setThinkingStore((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, rawQuestionText: nextQuestion } : node))
      }));
      markLocalChange();
      return true;
    },
    [activeSpaceId, cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId, thinkingView]
  ); */

  const handleThinkingUpdateNode = useCallback(
    async (nodeId: string, rawQuestionText: string) => {
      const now = new Date().toISOString();
      const nextQuestion = normalizeThinkingMultilineText(rawQuestionText);
      if (!nextQuestion) return false;
      await queueMutation(`/v1/thinking/nodes/${nodeId}/update`, {
        raw_question_text: rawQuestionText,
        client_updated_at: now
      });
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, questionText: nextQuestion } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      setThinkingStore((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, rawQuestionText: nextQuestion } : node))
      }));
      markLocalChange();
      return true;
    },
    [activeSpaceId, markLocalChange, queueMutation, thinkingView]
  );

  /* const handleThinkingCopyNode = useCallback(
    async (nodeId: string, targetTrackId?: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return null;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return null;
        const sourceNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!sourceNode) return null;
        const nextNodeId = createId();
        const nextNode = {
          ...sourceNode,
          id: nextNodeId,
          createdAt: new Date().toISOString(),
          echoNodeId: null,
          echoTrackId: null
        };
        const resolvedTrackId = targetTrackId ?? fromTrackParentId(thinkingStore.nodes.find((node) => node.id === nodeId)?.parentNodeId) ?? currentView.currentTrackId ?? currentView.tracks[0]?.id ?? null;
        if (!resolvedTrackId) return null;
        const nextTracks = currentView.tracks.map((track) =>
          track.id === resolvedTrackId ? { ...track, nodes: [...track.nodes, nextNode], isEmpty: false } : track
        );
        const nextView = {
          ...currentView,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
        markLocalChange();
        return nextNodeId;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetTrackId ? { target_track_id: targetTrackId } : {})
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { node_id?: string };
        if (!response.ok) return null;
        await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
        return typeof body.node_id === "string" ? body.node_id : null;
      } catch {
        return null;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, markLocalChange, sessionUser?.userId, thinkingStore.nodes]
  ); */

  const handleThinkingCopyNode = useCallback(
    async (nodeId: string, targetTrackId?: string) => {
      if (!activeSpaceId) return null;
      const currentView = getLocalSpaceView(activeSpaceId);
      if (!currentView) return null;
      const sourceNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
      if (!sourceNode) return null;

      const nextNodeId = createId();
      const createdAt = new Date().toISOString();
      const nextNode = {
        ...sourceNode,
        id: nextNodeId,
        createdAt,
        echoNodeId: null,
        echoTrackId: null
      };
      const resolvedTrackId =
        targetTrackId ??
        fromTrackParentId(thinkingStore.nodes.find((node) => node.id === nodeId)?.parentNodeId) ??
        currentView.currentTrackId ??
        currentView.tracks[0]?.id ??
        null;
      if (!resolvedTrackId) return null;

      await queueMutation(`/v1/thinking/nodes/${nodeId}/copy`, {
        target_track_id: resolvedTrackId,
        client_node_id: nextNodeId,
        client_created_at: createdAt,
        client_updated_at: createdAt
      });
      const nextTracks = currentView.tracks.map((track) =>
        track.id === resolvedTrackId ? { ...track, nodes: [...track.nodes, nextNode], isEmpty: false } : track
      );
      const nextView = {
        ...currentView,
        currentTrackId: resolvedTrackId,
        tracks: normalizeTrackList(nextTracks)
      };
      commitLocalSpaceView(activeSpaceId, nextView);
      setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
      markLocalChange();
      return nextNodeId;
    },
    [activeSpaceId, commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation, thinkingStore.nodes]
  );

  /* const handleThinkingSaveNodeAnswer = useCallback(
    async (nodeId: string, answerText: string | null) => {
      const now = new Date().toISOString();
      const payload = { answer_text: answerText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation(`/v1/thinking/nodes/${nodeId}/answer`, payload);
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, answerText } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      markLocalChange();
      return true;
    },
    [activeSpaceId, cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId, thinkingView]
  ); */

  const handleThinkingSaveNodeAnswer = useCallback(
    async (nodeId: string, answerText: string | null) => {
      const now = new Date().toISOString();
      await queueMutation(`/v1/thinking/nodes/${nodeId}/answer`, {
        answer_text: answerText,
        client_updated_at: now
      });
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, answerText } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      markLocalChange();
      return true;
    },
    [activeSpaceId, markLocalChange, queueMutation, thinkingView]
  );

  const applyLocalNodeImageAsset = useCallback(
    async (nodeId: string, nextAsset: ThinkingMediaAsset | null) => {
      const existingNode = thinkingStore.nodes.find((node) => node.id === nodeId);
      if (!existingNode) return false;

      const nextAssetId = nextAsset?.id ?? null;
      const previousAssetId = existingNode.imageAssetId ?? null;
      const spaceId = existingNode.spaceId;
      const currentView = getLocalSpaceView(spaceId);
      if (currentView) {
        commitLocalSpaceView(spaceId, {
          ...currentView,
          tracks: currentView.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, imageAssetId: nextAssetId } : node))
          }))
        });
      }

      let removedAssetIds: string[] = [];
      setThinkingStore((prev) => {
        const nextNodes = prev.nodes.map((node) => (node.id === nodeId ? { ...node, imageAssetId: nextAssetId } : node));
        let nextMediaAssets = prev.mediaAssets;
        if (nextAsset) {
          const index = nextMediaAssets.findIndex((asset) => asset.id === nextAsset.id);
          if (index >= 0) {
            nextMediaAssets = [...nextMediaAssets];
            nextMediaAssets[index] = nextAsset;
          } else {
            nextMediaAssets = [nextAsset, ...nextMediaAssets];
          }
        }
        const nextStore = { ...prev, nodes: nextNodes, mediaAssets: nextMediaAssets };
        removedAssetIds = collectUnreferencedMediaAssetIds(
          nextStore,
          previousAssetId && previousAssetId !== nextAssetId ? [previousAssetId] : []
        );
        if (removedAssetIds.length) {
          nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
        }
        return nextStore;
      });

      await markMediaAssetsDeletedLocally(removedAssetIds);
      markLocalChange();
      return true;
    },
    [
      commitLocalSpaceView,
      getLocalSpaceView,
      markMediaAssetsDeletedLocally,
      markLocalChange,
      thinkingStore.nodes
    ]
  );

  /* const handleThinkingSetNodeImage = useCallback(
    async (nodeId: string, file: File) => {
      if (!file.type.startsWith("image/")) return false;
      const ownerKey = activeOwnerKey;
      if (!ownerKey) return false;

      const assetId = createId();
      const [dimensions, sha256] = await Promise.all([readImageDimensions(file), sha256HexForBlob(file)]);
      const draftAsset: ThinkingMediaAsset = {
        id: assetId,
        fileName: file.name || "image",
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null
      };

      const persistOfflineAsset = async (status: OfflineMediaAssetStatus, uploadedAt?: string | null) => {
        await saveOfflineMediaAsset({
          id: draftAsset.id,
          ownerKey,
          fileName: draftAsset.fileName,
          mimeType: draftAsset.mimeType,
          byteSize: draftAsset.byteSize,
          sha256: draftAsset.sha256,
          width: draftAsset.width,
          height: draftAsset.height,
          status,
          blob: file,
          remoteUrl: status === "uploaded" ? buildApiUrl(`/v1/thinking/media/${draftAsset.id}`) : null,
          createdAt: draftAsset.createdAt,
          updatedAt: new Date().toISOString(),
          uploadedAt: uploadedAt ?? null,
          deletedAt: null,
          lastError: null
        });
        await refreshOfflineMediaAssets(ownerKey);
      };

      const nodePayload = { image_asset_id: draftAsset.id, client_updated_at: new Date().toISOString() };
      if (cloudSyncReady) {
        try {
          const uploadedAsset = await uploadThinkingMediaAssetBinary(file, {
            assetId,
            fileName: draftAsset.fileName,
            mimeType: draftAsset.mimeType,
            width: draftAsset.width,
            height: draftAsset.height
          });
          if (!uploadedAsset) return false;
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nodePayload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await persistOfflineAsset("uploaded", uploadedAsset.uploadedAt);
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }

      await persistOfflineAsset("pending");
      await queueMutation(`/v1/thinking/nodes/${nodeId}/image`, nodePayload);
      await applyLocalNodeImageAsset(nodeId, draftAsset);
      return true;
    },
    [
      activeOwnerKey,
      applyLocalNodeImageAsset,
      cloudSyncReady,
      handleUnauthorized,
      finalizeCloudWrite,
      queueMutation,
      refreshOfflineMediaAssets,
      sessionUser?.userId,
      uploadThinkingMediaAssetBinary
    ]
  ); */

  const handleThinkingSetNodeImage = useCallback(
    async (nodeId: string, file: File) => {
      if (!file.type.startsWith("image/")) return false;
      const ownerKey = activeOwnerKey;
      if (!ownerKey) return false;

      const assetId = createId();
      const [dimensions, sha256] = await Promise.all([readImageDimensions(file), sha256HexForBlob(file)]);
      const draftAsset: ThinkingMediaAsset = {
        id: assetId,
        fileName: file.name || "image",
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null,
        syncStatus: "pending"
      };

      await saveOfflineMediaAsset({
        id: draftAsset.id,
        ownerKey,
        fileName: draftAsset.fileName,
        mimeType: draftAsset.mimeType,
        byteSize: draftAsset.byteSize,
        sha256: draftAsset.sha256,
        width: draftAsset.width,
        height: draftAsset.height,
        status: "pending",
        blob: file,
        remoteUrl: null,
        createdAt: draftAsset.createdAt,
        updatedAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null,
        lastError: null
      });
      await refreshOfflineMediaAssets(ownerKey);
      await queueMutation(`/v1/thinking/nodes/${nodeId}/image`, {
        image_asset_id: draftAsset.id,
        client_updated_at: new Date().toISOString()
      });
      await applyLocalNodeImageAsset(nodeId, draftAsset);
      return true;
    },
    [activeOwnerKey, applyLocalNodeImageAsset, queueMutation, refreshOfflineMediaAssets]
  );

  /* const handleThinkingRemoveNodeImage = useCallback(
    async (nodeId: string) => {
      const node = thinkingStore.nodes.find((item) => item.id === nodeId);
      if (!node?.imageAssetId) return true;
      const payload = { image_asset_id: null, client_updated_at: new Date().toISOString() };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }

      await queueMutation(`/v1/thinking/nodes/${nodeId}/image`, payload);
      await applyLocalNodeImageAsset(nodeId, null);
      return true;
    },
    [applyLocalNodeImageAsset, cloudSyncReady, finalizeCloudWrite, handleUnauthorized, queueMutation, sessionUser?.userId, thinkingStore.nodes]
  ); */

  const handleThinkingRemoveNodeImage = useCallback(
    async (nodeId: string) => {
      const node = thinkingStore.nodes.find((item) => item.id === nodeId);
      if (!node?.imageAssetId) return true;
      await queueMutation(`/v1/thinking/nodes/${nodeId}/image`, {
        image_asset_id: null,
        client_updated_at: new Date().toISOString()
      });
      await applyLocalNodeImageAsset(nodeId, null);
      return true;
    },
    [applyLocalNodeImageAsset, queueMutation, thinkingStore.nodes]
  );

  /* const handleThinkingMisplacedNode = useCallback(
    async (nodeId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        let parkingTrackId = currentView.parkingTrackId;
        let nextTracks = [...currentView.tracks];
        if (!parkingTrackId) {
          parkingTrackId = createId();
          nextTracks.push({
            id: parkingTrackId,
            titleQuestionText: "先放这里",
            isParking: true,
            isEmpty: false,
            nodeCount: 0,
            nodes: []
          });
        }
        const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!movingNode) return false;
        nextTracks = nextTracks.map((track) =>
          track.id === parkingTrackId
            ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
            : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
        );
        const nextView = {
          ...currentView,
          parkingTrackId,
          tracks: normalizeTrackList(nextTracks)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => {
          const next = syncStoreNodesFromView(prev, activeSpaceId, nextView);
          return {
            ...next,
            spaceMeta: prev.spaceMeta.map((meta) =>
              meta.spaceId === activeSpaceId ? { ...meta, parkingTrackId } : meta
            )
          };
        });
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/misplaced`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, markLocalChange, sessionUser?.userId]
  ); */

  const handleThinkingMisplacedNode = useCallback(
    async (nodeId: string) => {
      if (!activeSpaceId) return false;
      const currentView = getLocalSpaceView(activeSpaceId);
      if (!currentView) return false;
      await queueMutation(`/v1/thinking/nodes/${nodeId}/misplaced`, {
        client_updated_at: new Date().toISOString()
      });
      let parkingTrackId = currentView.parkingTrackId;
      let nextTracks = [...currentView.tracks];
      if (!parkingTrackId) {
        parkingTrackId = createId();
        nextTracks.push({
          id: parkingTrackId,
          titleQuestionText: "Parking",
          isParking: true,
          isEmpty: false,
          nodeCount: 0,
          nodes: []
        });
      }
      const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
      if (!movingNode) return false;
      nextTracks = nextTracks.map((track) =>
        track.id === parkingTrackId
          ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
          : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
      );
      const nextView = {
        ...currentView,
        parkingTrackId,
        tracks: normalizeTrackList(nextTracks)
      };
      commitLocalSpaceView(activeSpaceId, nextView);
      setThinkingStore((prev) => {
        const next = syncStoreNodesFromView(prev, activeSpaceId, nextView);
        return {
          ...next,
          spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === activeSpaceId ? { ...meta, parkingTrackId } : meta))
        };
      });
      markLocalChange();
      return true;
    },
    [activeSpaceId, commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation]
  );

  /* const handleThinkingSetActiveTrack = useCallback(
    async (spaceId: string, trackId: string) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView || !currentView.tracks.some((track) => track.id === trackId)) return false;
        commitLocalSpaceView(spaceId, {
          ...currentView,
          currentTrackId: trackId
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? { ...meta, lastTrackId: trackId } : meta))
        }));
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/active-track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: trackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, sessionUser?.userId]
  ); */

  const handleThinkingSetActiveTrack = useCallback(
    async (spaceId: string, trackId: string) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView || !currentView.tracks.some((track) => track.id === trackId)) return false;
      await queueMutation(`/v1/thinking/spaces/${spaceId}/active-track`, {
        track_id: trackId,
        client_updated_at: new Date().toISOString()
      });
      commitLocalSpaceView(spaceId, {
        ...currentView,
        currentTrackId: trackId
      });
      setThinkingStore((prev) => ({
        ...prev,
        spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? { ...meta, lastTrackId: trackId } : meta))
      }));
      markLocalChange();
      return true;
    },
    [commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation]
  );

  /* const handleThinkingCreateTrack = useCallback(
    async (spaceId: string) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return null;
        const trackId = createId();
        const nextTrack = {
          id: trackId,
          titleQuestionText: "新方向",
          isParking: false,
          isEmpty: true,
          nodeCount: 0,
          nodes: []
        };
        const parkingIndex = currentView.parkingTrackId ? currentView.tracks.findIndex((track) => track.id === currentView.parkingTrackId) : -1;
        const nextTracks = [...currentView.tracks];
        if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, nextTrack);
        else nextTracks.push(nextTrack);
        commitLocalSpaceView(spaceId, {
          ...currentView,
          currentTrackId: trackId,
          tracks: nextTracks
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? { ...meta, lastTrackId: trackId } : meta))
        }));
        markLocalChange();
        return trackId;
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { track_id?: string };
        if (!response.ok) return null;
        await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
        return typeof body.track_id === "string" ? body.track_id : null;
      } catch {
        return null;
      }
    },
    [cloudSyncReady, commitLocalSpaceView, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, markLocalChange, sessionUser?.userId]
  ); */

  const handleThinkingCreateTrack = useCallback(
    async (spaceId: string) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return null;
      const reusablePendingTrack =
        (currentView.pendingTrackId
          ? currentView.tracks.find(
              (track) => track.id === currentView.pendingTrackId && !track.isParking && track.nodes.length === 0
            )
          : null) ?? currentView.tracks.find((track) => !track.isParking && track.nodes.length === 0) ?? null;
      const trackId = reusablePendingTrack?.id ?? createId();
      await queueMutation(`/v1/thinking/spaces/${spaceId}/tracks`, {
        client_track_id: trackId,
        client_updated_at: new Date().toISOString()
      });
      if (reusablePendingTrack) {
        commitLocalSpaceView(spaceId, {
          ...currentView,
          currentTrackId: trackId,
          pendingTrackId: trackId
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) =>
            meta.spaceId === spaceId
              ? {
                  ...meta,
                  lastTrackId: trackId,
                  pendingTrackId: trackId,
                  emptyTrackIds: [trackId]
                }
              : meta
          )
        }));
        markLocalChange();
        return trackId;
      }
      const nextTrack = {
        id: trackId,
        titleQuestionText: "New track",
        isParking: false,
        isEmpty: true,
        nodeCount: 0,
        nodes: []
      };
      const parkingIndex = currentView.parkingTrackId ? currentView.tracks.findIndex((track) => track.id === currentView.parkingTrackId) : -1;
      const nextTracks = [...currentView.tracks];
      if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, nextTrack);
      else nextTracks.push(nextTrack);
      commitLocalSpaceView(spaceId, {
        ...currentView,
        currentTrackId: trackId,
        pendingTrackId: trackId,
        tracks: nextTracks
      });
      setThinkingStore((prev) => ({
        ...prev,
        spaceMeta: prev.spaceMeta.map((meta) =>
          meta.spaceId === spaceId
            ? {
                ...meta,
                lastTrackId: trackId,
                pendingTrackId: trackId,
                emptyTrackIds: [trackId]
              }
            : meta
        )
      }));
      markLocalChange();
      return trackId;
    },
    [commitLocalSpaceView, getLocalSpaceView, markLocalChange, queueMutation]
  );

  const applyLocalSpaceGalleryState = useCallback(
    async (
      spaceId: string,
      nextAssetIds: string[],
      nextSelectedAssetId: string | null,
      nextAsset?: ThinkingMediaAsset | null
    ) => {
      const currentView = getLocalSpaceView(spaceId);
      const previousAssetIds = new Set(currentView?.backgroundAssetIds ?? []);
      const nextBackgroundVersion = (currentView?.backgroundVersion ?? 0) + 1;
      if (currentView) {
        commitLocalSpaceView(spaceId, {
          ...currentView,
          backgroundText: null,
          backgroundVersion: nextBackgroundVersion,
          backgroundAssetIds: nextAssetIds,
          backgroundSelectedAssetId: nextSelectedAssetId
        });
      }

      let removedAssetIds: string[] = [];
      setThinkingStore((prev) => {
        let nextMediaAssets = prev.mediaAssets;
        if (nextAsset) {
          const existingIndex = nextMediaAssets.findIndex((asset) => asset.id === nextAsset.id);
          if (existingIndex >= 0) {
            nextMediaAssets = [...nextMediaAssets];
            nextMediaAssets[existingIndex] = nextAsset;
          } else {
            nextMediaAssets = [nextAsset, ...nextMediaAssets];
          }
        }

        const existingMeta = prev.spaceMeta.find((meta) => meta.spaceId === spaceId);
        const nextMetaEntry: ThinkingSpaceMeta = existingMeta
          ? {
              ...existingMeta,
              backgroundText: null,
              backgroundVersion: nextBackgroundVersion,
              backgroundAssetIds: nextAssetIds,
              backgroundSelectedAssetId: nextSelectedAssetId
            }
          : {
              spaceId,
              exportVersion: 1,
              backgroundText: null,
              backgroundVersion: nextBackgroundVersion,
              backgroundAssetIds: nextAssetIds,
              backgroundSelectedAssetId: nextSelectedAssetId,
              suggestionDecay: 0,
              lastTrackId: currentView?.currentTrackId ?? null,
              lastOrganizedOrder: -1,
              parkingTrackId: currentView?.parkingTrackId ?? createId(),
              pendingTrackId: currentView?.pendingTrackId ?? null,
              emptyTrackIds: [],
            };

        const nextSpaceMeta = existingMeta
          ? prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? nextMetaEntry : meta))
          : [nextMetaEntry, ...prev.spaceMeta];

        const candidateAssetIds = [...previousAssetIds].filter((assetId) => !nextAssetIds.includes(assetId));
        const nextStore = {
          ...prev,
          spaceMeta: nextSpaceMeta,
          mediaAssets: nextMediaAssets
        };
        removedAssetIds = collectUnreferencedMediaAssetIds(nextStore, candidateAssetIds);
        if (removedAssetIds.length) {
          nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
        }
        return nextStore;
      });

      await markMediaAssetsDeletedLocally(removedAssetIds);
      markLocalChange();
      return true;
    },
    [commitLocalSpaceView, getLocalSpaceView, markLocalChange, markMediaAssetsDeletedLocally]
  );

  /* const handleThinkingAddSpaceGalleryImage = useCallback(
    async (spaceId: string, file: File) => {
      if (!file.type.startsWith("image/")) return false;
      const ownerKey = activeOwnerKey;
      if (!ownerKey) return false;

      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;

      const assetId = createId();
      const [dimensions, sha256] = await Promise.all([readImageDimensions(file), sha256HexForBlob(file)]);
      const draftAsset: ThinkingMediaAsset = {
        id: assetId,
        fileName: file.name || "image",
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null
      };

      const nextAssetIds = currentView.backgroundAssetIds.includes(draftAsset.id)
        ? currentView.backgroundAssetIds
        : [...currentView.backgroundAssetIds, draftAsset.id];
      const nextSelectedAssetId = currentView.backgroundSelectedAssetId ?? draftAsset.id;
      const payload = {
        background_asset_ids: nextAssetIds,
        background_selected_asset_id: nextSelectedAssetId,
        client_updated_at: new Date().toISOString()
      };

      const persistOfflineAsset = async (status: OfflineMediaAssetStatus, uploadedAt?: string | null) => {
        await saveOfflineMediaAsset({
          id: draftAsset.id,
          ownerKey,
          fileName: draftAsset.fileName,
          mimeType: draftAsset.mimeType,
          byteSize: draftAsset.byteSize,
          sha256: draftAsset.sha256,
          width: draftAsset.width,
          height: draftAsset.height,
          status,
          blob: file,
          remoteUrl: status === "uploaded" ? buildApiUrl(`/v1/thinking/media/${draftAsset.id}`) : null,
          createdAt: draftAsset.createdAt,
          updatedAt: new Date().toISOString(),
          uploadedAt: uploadedAt ?? null,
          deletedAt: null,
          lastError: null
        });
        await refreshOfflineMediaAssets(ownerKey);
      };

      if (cloudSyncReady) {
        try {
          const uploadedAsset = await uploadThinkingMediaAssetBinary(file, {
            assetId,
            fileName: draftAsset.fileName,
            mimeType: draftAsset.mimeType,
            width: draftAsset.width,
            height: draftAsset.height
          });
          if (!uploadedAsset) return false;
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/background`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await persistOfflineAsset("uploaded", uploadedAsset.uploadedAt);
          await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }

      await persistOfflineAsset("pending");
      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, payload);
      await applyLocalSpaceGalleryState(spaceId, nextAssetIds, nextSelectedAssetId, draftAsset);
      return true;
    },
    [
      activeOwnerKey,
      applyLocalSpaceGalleryState,
      cloudSyncReady,
      getLocalSpaceView,
      handleUnauthorized,
      finalizeCloudWrite,
      queueMutation,
      refreshOfflineMediaAssets,
      sessionUser?.userId,
      uploadThinkingMediaAssetBinary
    ]
  ); */

  const handleThinkingAddSpaceGalleryImage = useCallback(
    async (spaceId: string, file: File) => {
      if (!file.type.startsWith("image/")) return false;
      const ownerKey = activeOwnerKey;
      if (!ownerKey) return false;
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;

      const assetId = createId();
      const [dimensions, sha256] = await Promise.all([readImageDimensions(file), sha256HexForBlob(file)]);
      const draftAsset: ThinkingMediaAsset = {
        id: assetId,
        fileName: file.name || "image",
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null,
        syncStatus: "pending"
      };

      const nextAssetIds = currentView.backgroundAssetIds.includes(draftAsset.id)
        ? currentView.backgroundAssetIds
        : [...currentView.backgroundAssetIds, draftAsset.id];
      const nextSelectedAssetId = currentView.backgroundSelectedAssetId ?? draftAsset.id;

      await saveOfflineMediaAsset({
        id: draftAsset.id,
        ownerKey,
        fileName: draftAsset.fileName,
        mimeType: draftAsset.mimeType,
        byteSize: draftAsset.byteSize,
        sha256: draftAsset.sha256,
        width: draftAsset.width,
        height: draftAsset.height,
        status: "pending",
        blob: file,
        remoteUrl: null,
        createdAt: draftAsset.createdAt,
        updatedAt: new Date().toISOString(),
        uploadedAt: null,
        deletedAt: null,
        lastError: null
      });
      await refreshOfflineMediaAssets(ownerKey);
      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, {
        background_asset_ids: nextAssetIds,
        background_selected_asset_id: nextSelectedAssetId,
        client_updated_at: new Date().toISOString()
      });
      await applyLocalSpaceGalleryState(spaceId, nextAssetIds, nextSelectedAssetId, draftAsset);
      return true;
    },
    [activeOwnerKey, applyLocalSpaceGalleryState, getLocalSpaceView, queueMutation, refreshOfflineMediaAssets]
  );

  /* const handleThinkingRemoveSpaceGalleryImage = useCallback(
    async (spaceId: string, assetId: string) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;
      if (!currentView.backgroundAssetIds.includes(assetId)) return true;

      const nextAssetIds = currentView.backgroundAssetIds.filter((id) => id !== assetId);
      const nextSelectedAssetId =
        currentView.backgroundSelectedAssetId === assetId
          ? nextAssetIds[0] ?? null
          : nextAssetIds.includes(currentView.backgroundSelectedAssetId ?? "") ? currentView.backgroundSelectedAssetId : nextAssetIds[0] ?? null;
      const payload = {
        background_asset_ids: nextAssetIds,
        background_selected_asset_id: nextSelectedAssetId,
        client_updated_at: new Date().toISOString()
      };

      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/background`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }

      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, payload);
      await applyLocalSpaceGalleryState(spaceId, nextAssetIds, nextSelectedAssetId, null);
      return true;
    },
    [applyLocalSpaceGalleryState, cloudSyncReady, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, queueMutation, sessionUser?.userId]
  ); */

  const handleThinkingRemoveSpaceGalleryImage = useCallback(
    async (spaceId: string, assetId: string) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;
      if (!currentView.backgroundAssetIds.includes(assetId)) return true;

      const nextAssetIds = currentView.backgroundAssetIds.filter((id) => id !== assetId);
      const nextSelectedAssetId =
        currentView.backgroundSelectedAssetId === assetId
          ? nextAssetIds[0] ?? null
          : nextAssetIds.includes(currentView.backgroundSelectedAssetId ?? "") ? currentView.backgroundSelectedAssetId : nextAssetIds[0] ?? null;
      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, {
        background_asset_ids: nextAssetIds,
        background_selected_asset_id: nextSelectedAssetId,
        client_updated_at: new Date().toISOString()
      });
      await applyLocalSpaceGalleryState(spaceId, nextAssetIds, nextSelectedAssetId, null);
      return true;
    },
    [applyLocalSpaceGalleryState, getLocalSpaceView, queueMutation]
  );

  /* const handleThinkingSelectSpaceBackgroundImage = useCallback(
    async (spaceId: string, assetId: string | null) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;
      if (assetId && !currentView.backgroundAssetIds.includes(assetId)) return false;

      const payload = {
        background_asset_ids: currentView.backgroundAssetIds,
        background_selected_asset_id: assetId,
        client_updated_at: new Date().toISOString()
      };

      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/background`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await finalizeCloudWrite(spaceId, sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }

      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, payload);
      await applyLocalSpaceGalleryState(spaceId, currentView.backgroundAssetIds, assetId, null);
      return true;
    },
    [applyLocalSpaceGalleryState, cloudSyncReady, finalizeCloudWrite, getLocalSpaceView, handleUnauthorized, queueMutation, sessionUser?.userId]
  ); */

  const handleThinkingSelectSpaceBackgroundImage = useCallback(
    async (spaceId: string, assetId: string | null) => {
      const currentView = getLocalSpaceView(spaceId);
      if (!currentView) return false;
      if (assetId && !currentView.backgroundAssetIds.includes(assetId)) return false;
      await queueMutation(`/v1/thinking/spaces/${spaceId}/background`, {
        background_asset_ids: currentView.backgroundAssetIds,
        background_selected_asset_id: assetId,
        client_updated_at: new Date().toISOString()
      });
      await applyLocalSpaceGalleryState(spaceId, currentView.backgroundAssetIds, assetId, null);
      return true;
    },
    [applyLocalSpaceGalleryState, getLocalSpaceView, queueMutation]
  );

  const handleThinkingSaveStarMapState = useCallback(
    async (spaceId: string, patch: StarMapStatePatch) => {
      const space = thinkingStore.spaces.find((item) => item.id === spaceId);
      if (!space || space.status !== "active") return false;
      const now = new Date().toISOString();
      const body: Record<string, unknown> = { client_updated_at: now };
      if (Object.prototype.hasOwnProperty.call(patch, "sceneSignature")) body.scene_signature = patch.sceneSignature ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, "curatedScene")) body.curated_scene = patch.curatedScene ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, "curatedAt")) body.curated_at = patch.curatedAt ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, "placementsSignature")) body.placements_signature = patch.placementsSignature ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, "starPlacements")) body.star_placements = patch.starPlacements ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, "placementsUpdatedAt")) body.placements_updated_at = patch.placementsUpdatedAt ?? null;

      await queueMutation(`/v1/thinking/spaces/${spaceId}/star-map`, body);
      setThinkingStore((prev) => {
        const existingMeta = prev.spaceMeta.find((meta) => meta.spaceId === spaceId);
        const nextMeta: ThinkingSpaceMeta = {
          ...(existingMeta ?? {
            spaceId,
            exportVersion: 1,
            backgroundText: null,
            backgroundVersion: 0,
            backgroundAssetIds: [],
            backgroundSelectedAssetId: null,
            suggestionDecay: 0,
            lastTrackId: null,
            lastOrganizedOrder: -1,
            parkingTrackId: createId(),
            pendingTrackId: null,
            emptyTrackIds: [],
          }),
        };
        if (Object.prototype.hasOwnProperty.call(patch, "curatedScene")) {
          nextMeta.starMapCuratedScene = patch.curatedScene ?? null;
          nextMeta.starMapSceneSignature = patch.curatedScene ? patch.sceneSignature ?? null : null;
          nextMeta.starMapCuratedAt = patch.curatedScene ? patch.curatedAt ?? now : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "starPlacements")) {
          const placements = patch.starPlacements ? normalizeStarPlacements(patch.starPlacements) : {};
          nextMeta.starMapStarPlacements = placements;
          nextMeta.starMapPlacementsSignature = Object.keys(placements).length ? patch.placementsSignature ?? null : null;
          nextMeta.starMapPlacementsUpdatedAt = Object.keys(placements).length ? patch.placementsUpdatedAt ?? now : null;
        }
        return {
          ...prev,
          spaceMeta: existingMeta
            ? prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? nextMeta : meta))
            : [nextMeta, ...prev.spaceMeta],
        };
      });
      markLocalChange();
      return true;
    },
    [markLocalChange, queueMutation, thinkingStore.spaces]
  );

  /* const handleThinkingWriteToTime = useCallback(
    async (spaceId: string, options?: { preserveOriginalTime?: boolean }) => {
      const now = new Date().toISOString();
      const preserveOriginalTime = options?.preserveOriginalTime !== false;
      if (cloudSyncReady) {
        try {
          const requestBody = {
            client_updated_at: now,
            preserve_original_time: preserveOriginalTime
          };
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/write-to-time`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          if (!response.ok) {
            if (response.status === 404) return { ok: false as const, message: "空间不存在" };
            return { ok: false as const, message: "封存失败" };
          }
          await finalizeCloudWrite(null, sessionUser?.userId ?? null);
          return { ok: true as const };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      const currentSpace = thinkingStore.spaces.find((item) => item.id === spaceId);
      if (!currentSpace) return { ok: false as const, message: "空间不存在" };
      const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      const sortedNodes =
        currentView?.tracks
          .flatMap((track) => track.nodes.map((node) => ({ ...node, trackId: track.id })))
          .sort((a, b) => new Date(a.createdAt ?? "").getTime() - new Date(b.createdAt ?? "").getTime()) ?? [];
      const firstPreview = sortedNodes[0]?.questionText?.trim() || null;
      const lastPreview = sortedNodes[sortedNodes.length - 1]?.questionText?.trim() || firstPreview;
      const doubtId = currentSpace.sourceTimeDoubtId ?? createId();
      const sourceTimeDoubt = currentSpace.sourceTimeDoubtId
        ? lifeStore.doubts.find((item) => item.id === currentSpace.sourceTimeDoubtId) ?? null
        : null;
      const writtenAt = preserveOriginalTime ? sourceTimeDoubt?.createdAt ?? currentSpace.createdAt : now;

      await queueMutation(`/v1/thinking/spaces/${spaceId}/write-to-time`, {
        preserve_original_time: preserveOriginalTime
      });

      setLifeStore((prev) => {
        const nextDoubt: LifeDoubt = {
          id: doubtId,
          rawText: currentSpace.rootQuestionText,
          firstNodePreview: firstPreview,
          lastNodePreview: lastPreview,
          createdAt: writtenAt,
          archivedAt: null,
          deletedAt: null
        };
        const nextDoubts = [nextDoubt, ...prev.doubts.filter((item) => item.id !== doubtId)];
        return { ...prev, doubts: nextDoubts };
      });

      setThinkingStore((prev) => {
        const nextSpaces = prev.spaces.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                status: "hidden" as const,
                writtenToTimeAt: writtenAt,
                sourceTimeDoubtId: doubtId,
                lastActivityAt: now
              }
            : space
        );
        const existingMeta = prev.spaceMeta.find((meta) => meta.spaceId === spaceId);
        const nextMeta = existingMeta
          ? prev.spaceMeta
          : [
              ...prev.spaceMeta,
              {
                spaceId,
                exportVersion: 1,
                backgroundText: null,
                backgroundVersion: 0,
                backgroundAssetIds: [],
                backgroundSelectedAssetId: null,
                suggestionDecay: 0,
                lastTrackId: null,
                lastOrganizedOrder: -1,
                parkingTrackId: createId(),
                pendingTrackId: null,
                emptyTrackIds: []
              }
            ];
        return {
          ...prev,
          spaces: nextSpaces,
          spaceMeta: nextMeta
        };
      });
      const nextSpacesForPick = thinkingStore.spaces
        .map((space) =>
          space.id === spaceId
            ? {
                ...space,
                status: "hidden" as const
              }
            : space
        )
        .filter((space) => space.status === "active");
      const nextActive = nextSpacesForPick[0]?.id ?? null;
      setActiveSpaceId(nextActive);
      if (nextActive) setThinkingView(thinkingViewCacheRef.current[nextActive] ?? null);
      else setThinkingView(null);
      markLocalChange();
      return { ok: true as const };
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, lifeStore.doubts, markLocalChange, queueMutation, sessionUser?.userId, thinkingStore.spaces, thinkingView]
  ); */

  const handleThinkingWriteToTime = useCallback(
    async (
      spaceId: string,
      options?: {
        preserveOriginalTime?: boolean;
        letterTitle?: string | null;
        letterLines?: string[];
        letterVariant?: string | null;
        letterSealText?: string | null;
      }
    ) => {
      const now = new Date().toISOString();
      const preserveOriginalTime = options?.preserveOriginalTime !== false;
      const currentSpace = thinkingStore.spaces.find((item) => item.id === spaceId);
      if (!currentSpace) return { ok: false as const, message: "空间不存在" };
      const currentView =
        thinkingViewCacheRef.current[spaceId] ??
        (thinkingView?.spaceId === spaceId ? thinkingView : null) ??
        buildSpaceViewFromStore(thinkingStore, spaceId);
      if (currentView) thinkingViewCacheRef.current[spaceId] = currentView;
      const sortedNodes =
        currentView?.tracks
          .flatMap((track) => track.nodes.map((node) => ({ ...node, trackId: track.id })))
          .sort((a, b) => new Date(a.createdAt ?? "").getTime() - new Date(b.createdAt ?? "").getTime()) ?? [];
      const firstPreview = sortedNodes[0]?.questionText?.trim() || null;
      const lastPreview = sortedNodes[sortedNodes.length - 1]?.questionText?.trim() || firstPreview;
      const doubtId = currentSpace.sourceTimeDoubtId ?? createId();
      const sourceTimeDoubt = currentSpace.sourceTimeDoubtId
        ? lifeStore.doubts.find((item) => item.id === currentSpace.sourceTimeDoubtId) ?? null
        : null;
      const writtenAt = preserveOriginalTime ? sourceTimeDoubt?.createdAt ?? currentSpace.createdAt : now;

      await queueMutation(`/v1/thinking/spaces/${spaceId}/write-to-time`, {
        preserve_original_time: preserveOriginalTime,
        client_doubt_id: doubtId,
        letter_title: options?.letterTitle ?? null,
        letter_lines: options?.letterLines ?? [],
        letter_variant: options?.letterVariant ?? null,
        letter_seal_text: options?.letterSealText ?? null,
        client_updated_at: now
      });

      setLifeStore((prev) => {
        const nextDoubt: LifeDoubt = {
          id: doubtId,
          rawText: currentSpace.rootQuestionText,
          firstNodePreview: firstPreview,
          lastNodePreview: lastPreview,
          letterTitle: options?.letterTitle ?? null,
          letterLines: options?.letterLines ?? [],
          letterVariant: options?.letterVariant ?? null,
          letterSealText: options?.letterSealText ?? null,
          createdAt: writtenAt,
          archivedAt: null,
          deletedAt: null,
          syncStatus: "pending"
        };
        const nextDoubts = [nextDoubt, ...prev.doubts.filter((item) => item.id !== doubtId)];
        return { ...prev, doubts: nextDoubts };
      });

      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                status: "hidden" as const,
                writtenToTimeAt: writtenAt,
                sourceTimeDoubtId: doubtId,
                lastActivityAt: now,
                syncStatus: "pending"
              }
            : space
        )
      }));
      markLocalChange();
      return { ok: true as const };
    },
    [lifeStore.doubts, markLocalChange, queueMutation, thinkingStore, thinkingView]
  );

  const sealAutoPromptSpace = useCallback(
    async (spaceId: string) => {
      if (autoSealBusySpaceId) return false;
      const space = thinkingStore.spaces.find((item) => item.id === spaceId && item.status === "active");
      if (!space) {
        setAutoSealPrompt((current) => (current?.spaceId === spaceId ? null : current));
        return false;
      }
      const view =
        thinkingViewCacheRef.current[spaceId] ??
        (thinkingView?.spaceId === spaceId ? thinkingView : null) ??
        buildSpaceViewFromStore(thinkingStore, spaceId);
      if (view) thinkingViewCacheRef.current[spaceId] = view;
      const letterLines = view ? buildSettleLetterLinesFromView(view) : [];

      setAutoSealBusySpaceId(spaceId);
      try {
        const result = await handleThinkingWriteToTime(spaceId, {
          preserveOriginalTime: true,
          letterLines
        });
        if (!result.ok) {
          showNotice(result.message || "封存失败，请稍后再试");
          return false;
        }
        setAutoSealPrompt((current) => (current?.spaceId === spaceId ? null : current));
        updateAutoSealPreferences((current) => {
          const { [spaceId]: _removed, ...snoozedUntilBySpaceId } = current.snoozedUntilBySpaceId;
          void _removed;
          return {
            ...current,
            snoozedUntilBySpaceId
          };
        });
        if (activeSpaceIdRef.current === spaceId) {
          const nextActive = thinkingStore.spaces
            .filter((item) => item.status === "active" && item.id !== spaceId)
            .sort(sortSpacesByLatestActivity)[0]?.id ?? null;
          setActiveSpaceId(nextActive);
          setThinkingView(nextActive ? thinkingViewCacheRef.current[nextActive] ?? buildSpaceViewFromStore(thinkingStore, nextActive) : null);
        }
        showNotice("已封存");
        return true;
      } finally {
        setAutoSealBusySpaceId(null);
      }
    },
    [autoSealBusySpaceId, handleThinkingWriteToTime, showNotice, thinkingStore, thinkingView, updateAutoSealPreferences]
  );

  useEffect(() => {
    if (!hydrated || !pinReady || (pinEnabled && !pinUnlocked)) return;
    const nowMs = Date.now();
    if (editingLocked || autoSealPreferences.disabled) {
      setAutoSealPrompt(null);
      return;
    }
    const fixedSpaceIds = new Set(thinkingStore.fixedTopSpacesEnabled ? thinkingStore.fixedTopSpaceIds : []);
    const candidates = thinkingStore.spaces
      .filter((space) => {
        if (space.status !== "active") return false;
        if (fixedSpaceIds.has(space.id)) return false;
        if (isAutoSealSnoozed(autoSealPreferences, space.id, nowMs)) return false;
        const spaceNodes = thinkingStore.nodes.filter((node) => node.spaceId === space.id && node.state !== "hidden");
        return nowMs - getSpaceLatestActivityTime(space, spaceNodes) >= AUTO_SEAL_AFTER_MS;
      })
      .sort((a, b) => getSpaceLatestActivityTime(a, thinkingStore.nodes) - getSpaceLatestActivityTime(b, thinkingStore.nodes));

    const candidate = candidates[0] ?? null;
    if (!candidate) {
      setAutoSealPrompt(null);
      return;
    }
    const latestActivity = getSpaceLatestActivityTime(
      candidate,
      thinkingStore.nodes.filter((node) => node.spaceId === candidate.id && node.state !== "hidden")
    );
    setAutoSealPrompt((current) =>
      current?.spaceId === candidate.id
        ? current
        : {
            spaceId: candidate.id,
            title: candidate.rootQuestionText,
            inactiveDays: Math.max(14, Math.floor((nowMs - latestActivity) / 86_400_000))
          }
    );
  }, [
    autoSealPreferences,
    editingLocked,
    hydrated,
    pinEnabled,
    pinReady,
    pinUnlocked,
    thinkingStore,
    thinkingStore.fixedTopSpaceIds,
    thinkingStore.fixedTopSpacesEnabled,
    thinkingStore.nodes,
    thinkingStore.spaces
  ]);

  /* const handleThinkingDeleteSpace = useCallback(
    async (spaceId: string) => {
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            return { ok: false as const, message: typeof payload.error === "string" ? payload.error : "删除空间失败" };
          }
          await finalizeCloudWrite(null, sessionUser?.userId ?? null);
          return { ok: true as const };
        } catch {
          return { ok: false as const, message: "网络异常，请稍后再试" };
        }
      }
      delete thinkingViewCacheRef.current[spaceId];
      let removedAssetIds: string[] = [];
      setThinkingStore((prev) => {
        const candidateAssetIds = [
          ...prev.nodes.filter((node) => node.spaceId === spaceId).map((node) => node.imageAssetId ?? ""),
          ...prev.spaceMeta
            .filter((meta) => meta.spaceId === spaceId)
            .flatMap((meta) => [...(meta.backgroundAssetIds ?? []), meta.backgroundSelectedAssetId ?? ""])
        ];
        const nextStore = {
          ...prev,
          spaces: prev.spaces.filter((space) => space.id !== spaceId),
          nodes: prev.nodes.filter((node) => node.spaceId !== spaceId),
          spaceMeta: prev.spaceMeta.filter((meta) => meta.spaceId !== spaceId),
          inbox: Object.fromEntries(Object.entries(prev.inbox).filter(([key]) => key !== spaceId))
        };
        removedAssetIds = collectUnreferencedMediaAssetIds(nextStore, candidateAssetIds);
        if (removedAssetIds.length) {
          nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
        }
        return nextStore;
      });
      await markMediaAssetsDeletedLocally(removedAssetIds);
      const nextActive = pickDefaultSpaceId(thinkingStore.spaces.filter((space) => space.id !== spaceId));
      setActiveSpaceId(nextActive);
      setThinkingView(nextActive ? thinkingViewCacheRef.current[nextActive] ?? null : null);
      markLocalChange();
      return { ok: true as const };
    },
    [
      cloudSyncReady,
      finalizeCloudWrite,
      handleUnauthorized,
      markLocalChange,
      markMediaAssetsDeletedLocally,
      sessionUser?.userId,
      thinkingStore.spaces
    ]
  ); */

  const handleThinkingDeleteSpace = useCallback(
    async (spaceId: string) => {
      await queueMutation(`/v1/thinking/spaces/${spaceId}/delete`, {
        client_updated_at: new Date().toISOString()
      });
      delete thinkingViewCacheRef.current[spaceId];
      let removedAssetIds: string[] = [];
      setThinkingStore((prev) => {
        const candidateAssetIds = [
          ...prev.nodes.filter((node) => node.spaceId === spaceId).map((node) => node.imageAssetId ?? ""),
          ...prev.spaceMeta
            .filter((meta) => meta.spaceId === spaceId)
            .flatMap((meta) => [...(meta.backgroundAssetIds ?? []), meta.backgroundSelectedAssetId ?? ""])
        ];
        const nextStore = {
          ...prev,
          spaces: prev.spaces.filter((space) => space.id !== spaceId),
          nodes: prev.nodes.filter((node) => node.spaceId !== spaceId),
          spaceMeta: prev.spaceMeta.filter((meta) => meta.spaceId !== spaceId),
          inbox: Object.fromEntries(Object.entries(prev.inbox).filter(([key]) => key !== spaceId))
        };
        removedAssetIds = collectUnreferencedMediaAssetIds(nextStore, candidateAssetIds);
        if (removedAssetIds.length) {
          nextStore.mediaAssets = nextStore.mediaAssets.filter((asset) => !removedAssetIds.includes(asset.id));
        }
        return nextStore;
      });
      await markMediaAssetsDeletedLocally(removedAssetIds);
      const nextActive = pickDefaultSpaceId(thinkingStore.spaces.filter((space) => space.id !== spaceId));
      setActiveSpaceId(nextActive);
      setThinkingView(nextActive ? thinkingViewCacheRef.current[nextActive] ?? null : null);
      markLocalChange();
      return { ok: true as const };
    },
    [markLocalChange, markMediaAssetsDeletedLocally, queueMutation, thinkingStore.spaces]
  );

  const handleThinkingExport = useCallback(
    async (spaceId: string) => {
      const localSpace = thinkingStore.spaces.find((space) => space.id === spaceId) ?? null;
      const localView = localSpace ? getLocalSpaceView(spaceId) : null;
      if (localSpace && localView) {
        return buildLocalSpaceExportMarkdown(thinkingStore, localSpace, localView);
      }

      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/export`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return null;
        if (!response.ok) return null;
        const payload = (await response.json()) as { markdown?: string };
        return typeof payload.markdown === "string" ? payload.markdown : null;
      } catch {
        return null;
      }
    },
    [getLocalSpaceView, handleUnauthorized, thinkingStore]
  );

  /* const handleThinkingRenameSpace = useCallback(
    async (spaceId: string, rootQuestionText: string) => {
      const now = new Date().toISOString();
      const payload = { root_question_text: rootQuestionText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          const responseBody = (await response.json().catch(() => ({}))) as { error?: string; root_question_text?: string };
          if (!response.ok) {
            return { ok: false as const, message: typeof responseBody.error === "string" ? responseBody.error : "重命名失败" };
          }
          await finalizeCloudWrite(activeSpaceIdRef.current, sessionUser?.userId ?? null);
          return {
            ok: true as const,
            rootQuestionText: typeof responseBody.root_question_text === "string" ? responseBody.root_question_text : rootQuestionText
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      await queueMutation(`/v1/thinking/spaces/${spaceId}/rename`, payload);
      const nextText = rootQuestionText.trim();
      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) => (space.id === spaceId ? { ...space, rootQuestionText: nextText, lastActivityAt: now } : space))
      }));
      markLocalChange();
      return { ok: true as const, rootQuestionText: nextText };
    },
    [cloudSyncReady, finalizeCloudWrite, handleUnauthorized, markLocalChange, queueMutation, sessionUser?.userId]
  ); */

  const handleThinkingRenameSpace = useCallback(
    async (spaceId: string, rootQuestionText: string) => {
      const now = new Date().toISOString();
      const nextText = rootQuestionText.trim();
      await queueMutation(`/v1/thinking/spaces/${spaceId}/rename`, {
        root_question_text: rootQuestionText,
        client_updated_at: now
      });
      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) => (space.id === spaceId ? { ...space, rootQuestionText: nextText, lastActivityAt: now } : space))
      }));
      markLocalChange();
      return { ok: true as const, rootQuestionText: nextText };
    },
    [markLocalChange, queueMutation]
  );

  const handleSystemExport = useCallback(
    async (options: { includeLife: boolean; includeThinking: boolean }) => {
      if (!sessionUser) return null;
      try {
        const params = new URLSearchParams({
          format: "markdown",
          include_life: String(options.includeLife),
          include_thinking: String(options.includeThinking)
        });
        const response = await apiFetch(`/v1/system/export?${params.toString()}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return null;
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => ({}))) as { markdown?: string };
        return typeof payload.markdown === "string" ? payload.markdown : null;
      } catch {
        return null;
      }
    },
    [handleUnauthorized, sessionUser]
  );

  const keepCloudData = useCallback(async () => {
    if (!sessionUser) return;
    setBindingDialog((current) => (current ? { ...current, submitting: true } : current));
    thinkingViewCacheRef.current = {};
    setOfflineRuntimeState("user_bootstrapping");
    updateOfflineMeta((current) => ({
      ...current,
      ownerMode: "user",
      boundUserId: sessionUser.userId,
      syncState: {
        ...current.syncState,
        bindingRequired: false,
        hasLocalChanges: false
      }
    }));
    await clearOfflineSnapshotByOwner(guestOwnerKey);
    saveLastUserMarker(sessionUser);
    setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
    await refreshFromCloud(null, sessionUser.userId, { allowLocalOverwrite: true });
    setBindingDialog(null);
    showNotice("已保留云端数据");
  }, [guestOwnerKey, refreshFromCloud, sessionUser, showNotice, updateOfflineMeta]);

  const uploadLocalData = useCallback(async () => {
    if (!sessionUser) return;
    setBindingDialog((current) => (current ? { ...current, submitting: true } : current));
    const imported = await importLocalPayloadToCloud(sessionUser);
    if (!imported) {
      setBindingDialog((current) => (current ? { ...current, submitting: false } : current));
      showNotice("本地数据绑定失败，请稍后再试");
      return;
    }
    await clearOfflineSnapshotByOwner(guestOwnerKey);
    saveLastUserMarker(sessionUser);
    setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
    setOfflineRuntimeState("user_bootstrapping");
    setBindingDialog(null);
    showNotice("本地数据已上传并覆盖云端");
  }, [guestOwnerKey, importLocalPayloadToCloud, sessionUser, showNotice]);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await apiFetch("/v1/auth/logout", { method: "POST" });
      } finally {
        const localProfileId = localProfileIdRef.current || getOrCreateLocalProfileId();
        bindingCheckUserIdRef.current = null;
        userBootstrapRef.current = null;
        clearLastUserMarker();
        setSessionUser(null);
        setBindingDialog(null);
        closeAuthDialog();
        const ownerKey = getGuestOwnerKey(localProfileId);
        const guestMeta = createOfflineSnapshotMeta(localProfileId);
        setActiveOwnerKey(ownerKey);
        await loadOwnerSnapshot(ownerKey, guestMeta);
        setOfflineRuntimeState("guest_ready");
        showNotice("已退出登录");
      }
    })();
  }, [closeAuthDialog, loadOwnerSnapshot, setSessionUser, showNotice]);

  const clearAllData = useCallback(() => {
    setThinkingStore(EMPTY_THINKING_STORE);
    setActiveSpaceId(null);
    setThinkingView(null);
    setLifeStore((prev) => ({ ...EMPTY_LIFE_STORE, meta: prev.meta }));
    setOfflineSnapshotExists(false);
    setBindingDialog(null);
    clearLastUserMarker();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LIFE_STORAGE_KEY);
      window.localStorage.removeItem(THINKING_STORAGE_KEY);
    }
    if (activeOwnerKey) {
      void clearOfflineOwnerState(activeOwnerKey);
    }
    setDeadLetterMutations([]);
    updateOfflineMeta((current) => ({
      ...current,
      ownerMode: "user",
      boundUserId: sessionUser?.userId ?? current.boundUserId ?? null,
      syncState: {
        lastSyncedAt: current.syncState.lastSyncedAt,
        hasLocalChanges: false,
        bindingRequired: false
      }
    }));
    if (cloudSyncEnabled && sessionUser && isOnline) {
      userBootstrapRef.current = null;
      setOfflineRuntimeState("user_bootstrapping");
    }
    showNotice("本地缓存已清理");
  }, [activeOwnerKey, cloudSyncEnabled, isOnline, sessionUser, showNotice, updateOfflineMeta]);

  const handleForgotPin = useCallback(async () => {
    await clearOfflineState();
    clearLastUserMarker();
    resetPinAfterForgot();
    setOfflineSnapshotExists(false);
    setSessionUser(null);
    setThinkingView(null);
    setActiveSpaceId(null);
    const localProfileId = localProfileIdRef.current || getOrCreateLocalProfileId();
    setActiveOwnerKey(getGuestOwnerKey(localProfileId));
    setOfflineRuntimeState("guest_ready");
    setOfflineMeta(createOfflineSnapshotMeta(localProfileId));
    setDeadLetterMutations([]);
  }, [resetPinAfterForgot, setSessionUser]);

  const dismissDeadLetterMutation = useCallback(
    async (mutationId: string) => {
      await removeOfflineMutation(mutationId);
      await refreshDeadLetterMutations(activeOwnerKey);
      await refreshPendingMutationCount(activeOwnerKey, true);
      showNotice("已移除同步异常");
    },
    [activeOwnerKey, refreshDeadLetterMutations, refreshPendingMutationCount, showNotice]
  );

  const ignoreServerRepairItem = useCallback(
    async (itemId: string) => {
      if (!sessionUser) {
        showNotice("请先登录账号");
        return;
      }
      const response = await apiFetch(`/v1/sync/repair-items/${encodeURIComponent(itemId)}/ignore`, { method: "POST" });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        showNotice("忽略失败，请稍后重试");
        return;
      }
      setServerRepairItems((items) => items.filter((item) => item.id !== itemId));
      setCloudRepairCount((count) => Math.max(0, count - 1));
      await refreshCloudSyncState(sessionUser.userId);
      await refreshServerRepairItems();
      showNotice("已忽略历史未合入内容");
    },
    [handleUnauthorized, refreshCloudSyncState, refreshServerRepairItems, sessionUser, showNotice]
  );

  const handleSyncRepair = useCallback(async () => {
    if (!currentUserOwnerKey || !sessionUser) {
      return { ok: false as const, error: "请先登录账号后再执行同步刷新" };
    }
    const previousRuntimeState = offlineRuntimeState;
    setOfflineRuntimeState("user_syncing");
    try {
      const result = await repairCloudSyncState(currentUserOwnerKey, activeSpaceIdRef.current);
      await refreshCloudSyncState(sessionUser.userId);
      if (result.ok) {
        showNotice(result.message);
        return { ok: true as const };
      }
      showNotice(result.message);
      return { ok: false as const, error: result.message };
    } finally {
      setOfflineRuntimeState(isOnline ? "user_sync_ready" : previousRuntimeState === "user_offline_ready" ? "user_offline_ready" : "user_sync_ready");
    }
  }, [currentUserOwnerKey, isOnline, offlineRuntimeState, repairCloudSyncState, refreshCloudSyncState, sessionUser, showNotice]);

  const resetPullRefreshLater = useCallback(() => {
    window.setTimeout(() => {
      setPullRefresh((current) =>
        current.phase === "done" || current.phase === "offline"
          ? { phase: "idle", distance: 0, message: "" }
          : current
      );
    }, 1200);
  }, []);

  const handlePullRefreshStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    if (!canStartGlobalPullRefresh(event.target)) return;
    pullRefreshStartYRef.current = event.touches[0].clientY;
    pullRefreshActiveRef.current = true;
    pullRefreshTriggeredRef.current = false;
  }, []);

  const handlePullRefreshMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!pullRefreshActiveRef.current || pullRefreshStartYRef.current === null) return;
      if (pullRefresh.phase === "refreshing") return;
      const delta = event.touches[0].clientY - pullRefreshStartYRef.current;
      if (delta <= 0) {
        setPullRefresh({ phase: "idle", distance: 0, message: "" });
        return;
      }
      if (delta > 4 && event.cancelable) {
        event.preventDefault();
      }
      const distance = Math.min(PULL_REFRESH_MAX_DISTANCE_PX, Math.round(delta * 0.55));
      const ready = distance >= PULL_REFRESH_THRESHOLD_PX;
      pullRefreshTriggeredRef.current = ready;
      setPullRefresh({
        phase: ready ? "ready" : "pulling",
        distance,
        message: ready ? "松开刷新" : "下拉刷新"
      });
    },
    [pullRefresh.phase]
  );

  const handlePullRefreshEnd = useCallback(() => {
    if (!pullRefreshActiveRef.current) return;
    const shouldRefresh = pullRefreshTriggeredRef.current;
    pullRefreshActiveRef.current = false;
    pullRefreshStartYRef.current = null;
    pullRefreshTriggeredRef.current = false;
    if (!shouldRefresh) {
      setPullRefresh({ phase: "idle", distance: 0, message: "" });
      return;
    }
    setPullRefresh({ phase: "refreshing", distance: PULL_REFRESH_THRESHOLD_PX, message: "正在刷新" });
    void (async () => {
      try {
        await refreshCurrentAccountFromCloud();
      } catch (error) {
        const offline = isOfflineNetworkError(error);
        setPullRefresh({
          phase: offline ? "offline" : "done",
          distance: 0,
          message: offline ? "当前离线，已显示本机缓存" : "刷新失败"
        });
        showNotice(offline ? "当前离线，已显示本机缓存" : "刷新失败，请稍后再试");
      } finally {
        resetPullRefreshLater();
      }
    })();
  }, [refreshCurrentAccountFromCloud, resetPullRefreshLater, showNotice]);

  if (!pinReady) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">加载中...</p>
      </div>
    );
  }

  if (pinEnabled && !pinUnlocked) {
    return <PinGate lockedUntil={pinLockedUntil} onVerified={handlePinVerified} />;
  }

  if (
    !hydrated ||
    startupRecovering ||
    (sessionUser &&
      !offlineSnapshotExists &&
      (offlineRuntimeState === "user_bootstrapping" ||
        offlineRuntimeState === "user_syncing" ||
        offlineRuntimeState === "switching_account"))
  ) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">正在恢复...</p>
      </div>
    );
  }

  if (!authReady && !sessionUser) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">正在确认登录状态...</p>
      </div>
    );
  }

  if (sessionUser && !offlineSnapshotExists && offlineRuntimeState === "user_offline_ready") {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 px-6 text-center text-slate-200">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-100">当前离线，暂无本机缓存</p>
            <p className="text-xs text-slate-400">网络恢复后会继续确认登录状态并拉取云端数据。</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refreshCurrentAccountFromCloud()}>
            重新尝试
          </Button>
        </div>
      </div>
    );
  }

  const thinkingChromeHidden = tab === "thinking" && (thinkingFocusMode || thinkingViewMode === "detail");
  const isLifeTab = tab === "life";
  const isThinkingTab = tab === "thinking";
  const isSettingsTab = tab === "settings";
  const showGlobalHeader = !thinkingChromeHidden;
  const mainFlushTop = thinkingChromeHidden || isLifeTab;
  const showMobileMainBottomNav = (isThinkingTab && !thinkingChromeHidden) || isSettingsTab;

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden text-slate-100",
        tab === "life" ? "life-surface" : tab === "thinking" ? "thinking-surface text-slate-900" : "settings-surface"
      )}
      onTouchStart={handlePullRefreshStart}
      onTouchMove={handlePullRefreshMove}
      onTouchEnd={handlePullRefreshEnd}
      onTouchCancel={handlePullRefreshEnd}
    >
      <PullRefreshIndicator thresholdPx={PULL_REFRESH_THRESHOLD_PX} state={pullRefresh} />
      {showGlobalHeader ? (
      <header
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-30 w-full px-4 py-4 md:px-6",
          tab === "thinking"
            ? "border-black/8 bg-[#f5f3f0]/76"
            : isLifeTab
              ? "border-transparent bg-transparent"
              : "border-b border-slate-200/10 bg-black/20 backdrop-blur"
        )}
      >
        {isLifeTab ? (
          <div className="mx-auto flex w-full max-w-[1680px] items-center justify-end gap-2">
            <SyncStatusPill summary={syncSummary} surface="dark" onClick={() => setTab("settings")} />
            <nav className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-black/25 px-1.5 py-1 backdrop-blur">
              <TopTab label="时间" active={isLifeTab} onClick={() => setTab("life")} daytime={false} subtle />
              <TopTab label="想一想" active={isThinkingTab} onClick={() => setTab("thinking")} daytime subtle />
              <TopTab label="设置" active={isSettingsTab} onClick={() => setTab("settings")} daytime={false} subtle />
            </nav>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
            <div className={cn("inline-flex items-center gap-2 text-sm tracking-[0.24em]", isThinkingTab || isSettingsTab ? "text-slate-700" : "text-slate-300/80")}><NextImage src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" width={16} height={16} className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></div>
            <nav className="pointer-events-auto flex items-center gap-2">
              <SyncStatusPill summary={syncSummary} surface={isThinkingTab || isSettingsTab ? "light" : "dark"} onClick={() => setTab("settings")} />
              <div className={cn("items-center gap-2", isThinkingTab || isSettingsTab ? "hidden md:flex" : "flex")}>
                <TopTab label="时间" active={isLifeTab} onClick={() => setTab("life")} daytime={false} subtle={false} />
                <TopTab label="想一想" active={isThinkingTab} onClick={() => setTab("thinking")} daytime subtle={false} />
                <TopTab label="设置" active={isSettingsTab} onClick={() => setTab("settings")} daytime={!isLifeTab} subtle={false} />
              </div>
            </nav>
          </div>
        )}
      </header>
      ) : null}

      <main className={cn("h-full", mainFlushTop ? "pt-0" : "pt-[62px]")}>
        <AnimatePresence mode="wait">
          {tab === "life" ? (
            <motion.section
              key="life"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.62 }}
            >
              <LifeLayer
                store={lifeStore}
                setStore={setLifeStore}
                timezone={thinkingStore.timezone}
                ready={lifeReady}
                openingPhase={openingPhase}
                stars={stars}
                editable={!editingLocked}
                onImportToThinking={handleImportToThinking}
                onCreateDoubt={createLifeDoubt}
                onSaveDoubtNote={saveLifeDoubtNote}
                onDeleteDoubt={deleteLifeDoubtWithDerived}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
          {tab === "thinking" ? (
            <motion.section
              key="thinking"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.52 }}
            >
              <ThinkingLayer
                store={thinkingStore}
                setStore={setThinkingStore}
                timezone={thinkingStore.timezone}
                activeSpaceId={activeSpaceId}
                setActiveSpaceId={setActiveSpaceId}
                spaceView={thinkingView}
                writeEnabled={!editingLocked}
                onCreateSpace={handleCreateThinkingFromInput}
                onAddQuestion={handleThinkingAddQuestion}
                onOrganizePreview={handleThinkingOrganizePreview}
                onOrganizeApply={handleThinkingOrganizeApply}
                onMoveNode={handleThinkingMoveNode}
                onMarkMisplaced={handleThinkingMisplacedNode}
                onDeleteNode={handleThinkingDeleteNode}
                onUpdateNodeQuestion={handleThinkingUpdateNode}
                onCopyNode={handleThinkingCopyNode}
                onSaveNodeAnswer={handleThinkingSaveNodeAnswer}
                onSetNodeImage={handleThinkingSetNodeImage}
                onRemoveNodeImage={handleThinkingRemoveNodeImage}
                onSetActiveTrack={handleThinkingSetActiveTrack}
                onCreateTrack={handleThinkingCreateTrack}
                onAddSpaceGalleryImage={handleThinkingAddSpaceGalleryImage}
                onRemoveSpaceGalleryImage={handleThinkingRemoveSpaceGalleryImage}
                onSelectSpaceBackgroundImage={handleThinkingSelectSpaceBackgroundImage}
                onSaveStarMapState={handleThinkingSaveStarMapState}
                onWriteSpaceToTime={handleThinkingWriteToTime}
                onDeleteSpace={handleThinkingDeleteSpace}
                onRenameSpace={handleThinkingRenameSpace}
                onExportSpace={handleThinkingExport}
                scratchItems={thinkingStore.scratch.filter((item) => !item.derivedSpaceId && !item.fedTimeDoubtId)}
                onCreateScratch={handleCreateThinkingScratch}
                onFeedScratchToTime={handleFeedThinkingScratchToTime}
                onDeleteScratch={handleDeleteThinkingScratch}
                onScratchToSpace={handleScratchToSpace}
                focusMode={thinkingFocusMode}
                onFocusModeChange={setThinkingFocusMode}
                onViewModeChange={setThinkingViewMode}
                reentryTarget={thinkingJumpTarget}
                onReentryHandled={() => setThinkingJumpTarget(null)}
                mediaAssetSources={mediaAssetSources}
                showThinkingDimensions={thinkingStore.showThinkingDimensions === true}
                autoSealPrompt={autoSealPrompt}
                autoSealBusy={autoSealBusySpaceId !== null}
                onAutoSealSeal={sealAutoPromptSpace}
                onAutoSealSnooze={snoozeAutoSealPrompt}
                onAutoSealDisable={disableAutoSealPrompts}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
          {tab === "settings" ? (
            <motion.section
              key="settings"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.52 }}
            >
              <SettingsLayer
                timezone={thinkingStore.timezone}
                setTimezone={(timezone) => setThinkingStore((prev) => ({ ...prev, timezone: sanitizeTimeZone(timezone) }))}
                activeThinkingSpaces={activeThinkingSpaceOptions}
                fixedTopSpacesEnabled={thinkingStore.fixedTopSpacesEnabled}
                fixedTopSpaceIds={thinkingStore.fixedTopSpaceIds}
                showThinkingDimensions={thinkingStore.showThinkingDimensions === true}
                setShowThinkingDimensions={(enabled) => setThinkingStore((prev) => ({ ...prev, showThinkingDimensions: enabled }))}
                autoSealRemindersDisabled={autoSealPreferences.disabled}
                setAutoSealRemindersDisabled={setAutoSealRemindersDisabled}
                sessionEmail={sessionUser?.email ?? null}
                cloudSyncEnabled={cloudSyncEnabled}
                cloudSyncReady={cloudSyncReady}
                pinEnabled={pinEnabled}
                pinLockedUntil={pinLockedUntil}
                onEnablePin={handleEnablePin}
                onDisablePin={handleDisablePin}
                onChangePin={handleChangePin}
                onForgotPin={handleForgotPin}
                onOpenAuth={openAuthDialog}
                syncStatus={{
                  syncSummary,
                  modeLabel: syncModeLabel,
                  phase: syncPhaseLabel,
                  localRevision: offlineMeta?.revision ?? null,
                  cloudRevision,
                  cloudServerTime,
                  lastCloudCheckedAt,
                  pendingMutationCount,
                  hasLocalChanges: hasTrackedLocalChanges,
                  hasUnqueuedLocalChanges,
                  offlineMediaPendingCount: offlineMediaAssets.filter((asset) => asset.status === "pending").length,
                  lastSyncedAt: offlineMeta?.syncState.lastSyncedAt ?? null,
                  nextRetryAt: nextSyncRetryAt,
                  warning: syncWarning,
                  latestBackup: latestSyncBackup
                    ? {
                        id: latestSyncBackup.id,
                        createdAt: latestSyncBackup.createdAt,
                        reason: latestSyncBackup.reason,
                        mutationCount: latestSyncBackup.mutations.length,
                        mediaCount: latestSyncBackup.mediaAssets.length
                      }
                    : null,
                  lastRepairSummary
                }}
                syncDiagnosticsReport={syncDiagnosticsReport}
                syncRepairing={
                  syncPhase === "repairing" ||
                  syncPhase === "manual_pull" ||
                  syncPhase === "manual_push" ||
                  syncPhase === "manual_overwrite" ||
                  offlineRuntimeState === "user_syncing"
                }
                onManualPullCloud={manualPullCloud}
                onManualUploadLocal={manualUploadLocal}
                onManualOverwriteCloud={manualOverwriteCloud}
                onPreviewLatestSyncBackup={previewLatestSyncBackup}
                onExitBackupPreview={exitBackupPreview}
                onOverwriteCloudWithBackupPreview={overwriteCloudWithBackupPreview}
                onSyncRepair={handleSyncRepair}
                deadLetterMutations={syncIssueMutations}
                onDismissDeadLetter={dismissDeadLetterMutation}
                unmergedItems={serverRepairItems}
                onIgnoreUnmergedItem={ignoreServerRepairItem}
                backupPreview={
                  backupPreview
                    ? {
                        id: backupPreview.backup.id,
                        createdAt: backupPreview.backup.createdAt,
                        reason: backupPreview.backup.reason,
                        mutationCount: backupPreview.backup.mutations.length,
                        mediaCount: backupPreview.backup.mediaAssets.length
                      }
                    : null
                }
                setFixedTopSpacesEnabled={(enabled) =>
                  setThinkingStore((prev) => {
                    const activeSpaces = [...prev.spaces].filter((space) => space.status === "active").sort(sortSpacesByLatestActivity);
                    const existingIds = prev.fixedTopSpaceIds.filter(
                      (id, index, array) => array.indexOf(id) === index && activeSpaces.some((space) => space.id === id)
                    );
                    const nextIds = enabled && existingIds.length === 0 ? activeSpaces.slice(0, 3).map((space) => space.id) : existingIds;
                    return {
                      ...prev,
                      fixedTopSpacesEnabled: enabled,
                      fixedTopSpaceIds: nextIds.slice(0, 3)
                    };
                  })
                }
                setFixedTopSpaceIds={(ids) =>
                  setThinkingStore((prev) => {
                    const activeIdSet = new Set(prev.spaces.filter((space) => space.status === "active").map((space) => space.id));
                    const nextIds = Array.from(new Set(ids.filter((id) => activeIdSet.has(id)))).slice(0, 3);
                    return { ...prev, fixedTopSpaceIds: nextIds };
                  })
                }
                onSystemExport={handleSystemExport}
                onClearAll={clearAllData}
                onLogout={logout}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>

      {showMobileMainBottomNav ? (
        <div className="mobile-main-nav absolute inset-x-0 bottom-0 z-30 md:hidden">
          <nav className="mx-auto grid h-14 w-full max-w-md grid-cols-3 px-3">
            <MobileBottomTab label="时间" icon="life" active={isLifeTab} onClick={() => setTab("life")} />
            <MobileBottomTab label="想一想" icon="thinking" active={isThinkingTab} onClick={() => setTab("thinking")} />
            <MobileBottomTab label="设置" icon="settings" active={isSettingsTab} onClick={() => setTab("settings")} />
          </nav>
          <div className="h-[calc(var(--safe-bottom)+4px)]" />
        </div>
      ) : null}

      <p
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-400/20 bg-black/45 px-4 py-1.5 text-xs text-slate-200/80 backdrop-blur transition-all duration-300",
          showMobileMainBottomNav ? "bottom-[calc(var(--safe-bottom)+64px)] md:bottom-4" : "bottom-4",
          notice ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {notice}
      </p>

      {authDialogOpen ? <AuthDialog onClose={closeAuthDialog} onAuthed={() => void syncAuth()} /> : null}
      {bindingDialog ? (
        <BindingDialog
          submitting={bindingDialog.submitting}
          onKeepCloud={() => void keepCloudData()}
          onUploadLocal={() => void uploadLocalData()}
        />
      ) : null}
    </div>
  );
}
