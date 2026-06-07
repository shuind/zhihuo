import type { OfflineSnapshot, OfflineSyncBackupRecord } from "@/components/offline-store";

export type SyncStateResponse = {
  revision?: number;
  lastSequence?: number;
  repairCount?: number;
  server_time?: string;
  serverTime?: string;
};

export type SyncRepairItemSummary = {
  id: string;
  clientMutationId: string;
  op: string;
  payload: Record<string, unknown>;
  reason: string;
  destinationClass: string | null;
  originalTargetId: string | null;
  createdAt: string;
};

export type BackupPreviewState = {
  backup: OfflineSyncBackupRecord;
  previousSnapshot: OfflineSnapshot;
};

export type BackupPreviewSummary = {
  id: string;
  createdAt: string;
  reason: string;
  mutationCount: number;
  mediaCount: number;
};

export type SyncRepairSummary = {
  startedAt: string;
  finishedAt: string;
  replayedCount: number;
  pendingCount: number;
  deadLetterCount: number;
  cloudRevision: number | null;
  failedReason: string | null;
};
