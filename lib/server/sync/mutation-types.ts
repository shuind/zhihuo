import type { SyncRepairItemRecord } from "@/lib/server/types";

export type SyncMutation = {
  clientMutationId?: string;
  op?: string;
  payload?: Record<string, unknown> | null;
  clientTime?: string | null;
  clientOrder?: number;
  deviceId?: string | null;
};

export type SyncMutationsBody = {
  baseRevision?: number;
  deviceId?: string | null;
  mutations?: SyncMutation[];
};

export type AppliedMutationResult = {
  clientMutationId: string;
  revision: number;
};

export type RepairItemResponse = {
  id: string;
  clientMutationId: string;
  op: string;
  reason: string;
  destinationClass: string | null;
  originalTargetId: string | null;
  createdAt: string;
};

export type NormalizedMutation = {
  clientMutationId: string;
  op: string;
  payload: Record<string, unknown>;
  clientTime: string | null;
  clientOrder: number;
  deviceId: string;
};

export type ApplyMutationResult =
  | { kind: "applied" | "skipped"; appliedRevision: number }
  | { kind: "repair"; appliedRevision: number; repairItem: SyncRepairItemRecord };
