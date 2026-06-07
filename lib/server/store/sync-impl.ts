import type {
  AppliedClientMutationRecord,
  DbState,
  SyncOperationLogRecord,
  SyncRepairItemRecord,
  UserSyncStateRecord
} from "@/lib/server/types";
import { createId, nowIso } from "@/lib/server/utils";

function ensureUserSyncState(db: DbState, userId: string): UserSyncStateRecord {
  const existing = db.user_sync_state.find((item) => item.user_id === userId);
  if (existing) return existing;
  const created: UserSyncStateRecord = {
    user_id: userId,
    revision: 0,
    last_sequence: 0,
    updated_at: nowIso()
  };
  db.user_sync_state.push(created);
  return created;
}

export function getUserRevision(db: DbState, userId: string) {
  return db.user_sync_state.find((item) => item.user_id === userId)?.revision ?? 0;
}

export function getUserLastSequence(db: DbState, userId: string) {
  return db.user_sync_state.find((item) => item.user_id === userId)?.last_sequence ?? 0;
}

export function bumpUserRevision(db: DbState, userId: string) {
  const state = ensureUserSyncState(db, userId);
  state.revision += 1;
  state.updated_at = nowIso();
  return state.revision;
}

export function appendSyncOperationLog(
  db: DbState,
  userId: string,
  input: {
    clientMutationId: string;
    deviceId: string;
    clientOrder: number;
    clientUpdatedAt?: string | null;
    op: string;
    payload?: Record<string, unknown> | null;
    appliedRevision: number;
  }
): SyncOperationLogRecord {
  const state = ensureUserSyncState(db, userId);
  state.last_sequence += 1;
  state.updated_at = nowIso();
  const record: SyncOperationLogRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: input.clientMutationId,
    device_id: input.deviceId,
    client_order: Number.isFinite(input.clientOrder) ? input.clientOrder : 0,
    client_updated_at: typeof input.clientUpdatedAt === "string" ? input.clientUpdatedAt : null,
    op: input.op,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    applied_revision: Number.isFinite(input.appliedRevision) ? input.appliedRevision : state.revision,
    server_sequence: state.last_sequence,
    created_at: nowIso()
  };
  db.sync_operation_log.push(record);
  return record;
}

export function recordSyncRepairItem(
  db: DbState,
  userId: string,
  input: {
    clientMutationId: string;
    op: string;
    payload?: Record<string, unknown> | null;
    reason: string;
    destinationClass?: string | null;
    originalTargetId?: string | null;
  }
): SyncRepairItemRecord {
  const existing = db.sync_repair_items.find(
    (item) => item.user_id === userId && item.client_mutation_id === input.clientMutationId && !item.resolved_at
  );
  if (existing) {
    existing.reason = input.reason;
    existing.destination_class = typeof input.destinationClass === "string" ? input.destinationClass : null;
    existing.original_target_id = typeof input.originalTargetId === "string" ? input.originalTargetId : null;
    existing.payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    return existing;
  }
  const repairItem: SyncRepairItemRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: input.clientMutationId,
    op: input.op,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    reason: input.reason,
    destination_class: typeof input.destinationClass === "string" ? input.destinationClass : null,
    original_target_id: typeof input.originalTargetId === "string" ? input.originalTargetId : null,
    created_at: nowIso(),
    resolved_at: null
  };
  db.sync_repair_items.push(repairItem);
  return repairItem;
}

export function listUserSyncRepairItems(db: DbState, userId: string) {
  return db.sync_repair_items
    .filter((item) => item.user_id === userId && !item.resolved_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function resolveUserSyncRepairItem(db: DbState, userId: string, itemId: string) {
  const item = db.sync_repair_items.find((row) => row.id === itemId && row.user_id === userId) ?? null;
  if (!item) return null;
  if (!item.resolved_at) item.resolved_at = nowIso();
  return item;
}

export function findAppliedClientMutation(db: DbState, userId: string, clientMutationId: string) {
  return (
    db.applied_client_mutations.find(
      (item) => item.user_id === userId && item.client_mutation_id === clientMutationId
    ) ?? null
  );
}

export function recordAppliedClientMutation(
  db: DbState,
  userId: string,
  clientMutationId: string,
  op: string,
  baseRevision: number,
  appliedRevision: number
): AppliedClientMutationRecord {
  const existing = findAppliedClientMutation(db, userId, clientMutationId);
  if (existing) return existing;
  const record: AppliedClientMutationRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: clientMutationId,
    op,
    base_revision: Number.isFinite(baseRevision) ? baseRevision : 0,
    applied_revision: Number.isFinite(appliedRevision) ? Number(appliedRevision) : 0,
    created_at: nowIso()
  };
  db.applied_client_mutations.push(record);
  return record;
}
