import type { DbState } from "@/lib/server/types";
import type { NormalizedMutation } from "@/lib/server/sync/mutation-types";
import { requireString } from "@/lib/server/sync/mutation-payload";

export function mutationTimeValue(item: Pick<NormalizedMutation, "clientTime" | "payload">) {
  const raw = item.clientTime ?? requireString(item.payload, "client_updated_at");
  const value = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function logTimeValue(item: { client_updated_at: string | null; created_at: string }) {
  const clientValue = item.client_updated_at ? new Date(item.client_updated_at).getTime() : NaN;
  if (Number.isFinite(clientValue)) return clientValue;
  const createdValue = new Date(item.created_at).getTime();
  return Number.isFinite(createdValue) ? createdValue : Number.NEGATIVE_INFINITY;
}

function logSortsAfterMutation(
  log: { client_updated_at: string | null; created_at: string; device_id: string; client_order: number; client_mutation_id: string },
  item: NormalizedMutation,
  options?: { equalTimeWins?: boolean }
) {
  const timeDelta = logTimeValue(log) - mutationTimeValue(item);
  if (timeDelta !== 0) return timeDelta > 0;
  if (options?.equalTimeWins) return true;
  const deviceDelta = log.device_id.localeCompare(item.deviceId);
  if (deviceDelta !== 0) return deviceDelta > 0;
  const orderDelta = log.client_order - item.clientOrder;
  if (orderDelta !== 0) return orderDelta > 0;
  return log.client_mutation_id.localeCompare(item.clientMutationId) > 0;
}

function mutationWriteKey(op: string, payload: Record<string, unknown>) {
  if (op === "/v1/doubts") {
    const clientEntityId = requireString(payload, "client_entity_id");
    return clientEntityId ? `doubt:create:${clientEntityId}` : null;
  }
  if (op === "/v1/thinking/spaces") {
    const clientSpaceId = requireString(payload, "client_space_id");
    return clientSpaceId ? `space:create:${clientSpaceId}` : null;
  }
  if (op === "/v1/thinking/scratch") {
    const clientEntityId = requireString(payload, "client_entity_id");
    return clientEntityId ? `scratch:create:${clientEntityId}` : null;
  }

  const doubtNoteMatch = op.match(/^\/v1\/doubts\/([^/]+)\/note$/);
  if (doubtNoteMatch) return `doubt:note:${doubtNoteMatch[1]}`;

  const spaceRenameMatch = op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/rename$/);
  if (spaceRenameMatch) return `space:root:${spaceRenameMatch[1]}`;

  const spaceBackgroundMatch = op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/background$/);
  if (spaceBackgroundMatch) return `space:background:${spaceBackgroundMatch[1]}`;

  const spaceStarMapMatch = op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/star-map$/);
  if (spaceStarMapMatch) return `space:star-map:${spaceStarMapMatch[1]}`;

  const activeTrackMatch = op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/active-track$/);
  if (activeTrackMatch) return `space:active-track:${activeTrackMatch[1]}`;

  const organizeMatch = op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/organize-apply$/);
  if (organizeMatch) return `space:organize:${organizeMatch[1]}`;

  const nodeQuestionMatch = op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/update$/);
  if (nodeQuestionMatch) return `node:question:${nodeQuestionMatch[1]}`;

  const nodeMoveMatch = op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/move$/);
  if (nodeMoveMatch) return `node:move:${nodeMoveMatch[1]}`;

  const nodeAnswerMatch = op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/answer$/);
  if (nodeAnswerMatch) return `node:answer:${nodeAnswerMatch[1]}`;

  const nodeImageMatch = op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/image$/);
  if (nodeImageMatch) return `node:image:${nodeImageMatch[1]}`;

  return null;
}

export function hasNewerAppliedWrite(db: DbState, userId: string, item: NormalizedMutation) {
  const writeKey = mutationWriteKey(item.op, item.payload);
  if (!writeKey) return false;
  return db.sync_operation_log.some((log) => {
    if (log.user_id !== userId || log.client_mutation_id === item.clientMutationId) return false;
    if (mutationWriteKey(log.op, log.payload) !== writeKey) return false;
    return logSortsAfterMutation(log, item);
  });
}

export function hasNewerManualOverwrite(db: DbState, userId: string, item: NormalizedMutation, baseRevision: number) {
  return db.sync_operation_log.some((log) => {
    if (log.user_id !== userId || log.op !== "/v1/sync/overwrite") return false;
    if (Number.isFinite(log.applied_revision) && log.applied_revision > baseRevision) return true;
    return logSortsAfterMutation(log, item, { equalTimeWins: true });
  });
}
