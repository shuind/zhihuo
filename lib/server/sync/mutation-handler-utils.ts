import { recordSyncRepairItem } from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import type { NormalizedMutation } from "@/lib/server/sync/mutation-types";

export function findUserDoubt(db: DbState, userId: string, doubtId: string) {
  return db.doubts.find((item) => item.id === doubtId && item.user_id === userId && !item.deleted_at) ?? null;
}

export function findUserScratch(db: DbState, userId: string, scratchId: string) {
  return db.thinking_scratch.find((item) => item.id === scratchId && item.user_id === userId && !item.deleted_at) ?? null;
}

export function findUserSpace(db: DbState, userId: string, spaceId: string) {
  return db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
}

export function findUserNode(db: DbState, userId: string, nodeId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId) ?? null;
  if (!node) return null;
  const space = findUserSpace(db, userId, node.space_id);
  if (!space) return null;
  return { node, space };
}

function extractOriginalTargetId(op: string) {
  const match = op.match(/^\/v1\/(?:doubts|thinking\/spaces|thinking\/scratch|thinking\/nodes)\/([^/]+)/);
  return match?.[1] ?? null;
}

export function createRepair(
  db: DbState,
  userId: string,
  item: NormalizedMutation,
  reason: string,
  destinationClass: string | null
) {
  return recordSyncRepairItem(db, userId, {
    clientMutationId: item.clientMutationId,
    op: item.op,
    payload: item.payload,
    reason,
    destinationClass,
    originalTargetId: extractOriginalTargetId(item.op)
  });
}
