import { updateDb } from "@/lib/server/db";
import {
  appendSyncOperationLog,
  findAppliedClientMutation,
  getUserLastSequence,
  getUserRevision,
  recordAppliedClientMutation
} from "@/lib/server/store";
import { hasNewerAppliedWrite, hasNewerManualOverwrite, mutationTimeValue } from "@/lib/server/sync/mutation-conflicts";
import { applyMutation } from "@/lib/server/sync/mutation-handlers";
import { requireString, toPayloadRecord } from "@/lib/server/sync/mutation-payload";
import type {
  AppliedMutationResult,
  RepairItemResponse,
  SyncMutation,
  SyncMutationsBody
} from "@/lib/server/sync/mutation-types";

export type { SyncMutation, SyncMutationsBody } from "@/lib/server/sync/mutation-types";

export async function applySyncMutations(userId: string, body: SyncMutationsBody | null | undefined) {
  const baseRevision = Number.isFinite(body?.baseRevision) ? Number(body?.baseRevision) : 0;
  const requestDeviceId = typeof body?.deviceId === "string" && body.deviceId.trim() ? body.deviceId : null;
  const mutations = Array.isArray(body?.mutations) ? body.mutations : [];
  if (!mutations.length) throw new Error("mutations is required");

  let result:
    | {
        applied: AppliedMutationResult[];
        skipped: AppliedMutationResult[];
        repairItems: RepairItemResponse[];
        newRevision: number;
        lastSequence: number;
      }
    | null = null;

  await updateDb((db) => {
    const normalized = mutations
      .filter((entry): entry is SyncMutation => Boolean(entry && typeof entry === "object"))
      .map((entry, index) => ({
        clientMutationId: typeof entry.clientMutationId === "string" ? entry.clientMutationId : "",
        op: typeof entry.op === "string" ? entry.op : "",
        payload: toPayloadRecord(entry.payload),
        clientTime: typeof entry.clientTime === "string" ? entry.clientTime : null,
        clientOrder: Number.isFinite(entry.clientOrder) ? Number(entry.clientOrder) : index,
        deviceId:
          typeof entry.deviceId === "string" && entry.deviceId.trim()
            ? entry.deviceId
            : requestDeviceId ?? `legacy:${userId}`
      }))
      .filter((entry) => entry.clientMutationId && entry.op)
      .sort(
        (a, b) =>
          mutationTimeValue(a) - mutationTimeValue(b) ||
          a.deviceId.localeCompare(b.deviceId) ||
          a.clientOrder - b.clientOrder ||
          a.clientMutationId.localeCompare(b.clientMutationId)
      );

    if (!normalized.length) throw new Error("mutations is required");

    const existing = normalized.map((entry) => findAppliedClientMutation(db, userId, entry.clientMutationId));

    const applied: AppliedMutationResult[] = [];
    const skipped: AppliedMutationResult[] = [];
    const repairItems: RepairItemResponse[] = [];

    for (let index = 0; index < normalized.length; index += 1) {
      const entry = normalized[index]!;
      const alreadyApplied = existing[index];
      if (alreadyApplied) {
        skipped.push({
          clientMutationId: entry.clientMutationId,
          revision: alreadyApplied.applied_revision
        });
        continue;
      }

      const skipAsOlderWrite = hasNewerManualOverwrite(db, userId, entry, baseRevision) || hasNewerAppliedWrite(db, userId, entry);
      const outcome = skipAsOlderWrite
        ? { kind: "skipped" as const, appliedRevision: getUserRevision(db, userId) }
        : applyMutation(db, userId, entry);
      recordAppliedClientMutation(db, userId, entry.clientMutationId, entry.op, baseRevision, outcome.appliedRevision);
      appendSyncOperationLog(db, userId, {
        clientMutationId: entry.clientMutationId,
        deviceId: entry.deviceId,
        clientOrder: entry.clientOrder,
        clientUpdatedAt: entry.clientTime ?? requireString(entry.payload, "client_updated_at"),
        op: entry.op,
        payload: entry.payload,
        appliedRevision: outcome.appliedRevision
      });

      if (outcome.kind === "applied") {
        applied.push({ clientMutationId: entry.clientMutationId, revision: outcome.appliedRevision });
        continue;
      }
      if (outcome.kind === "skipped") {
        skipped.push({ clientMutationId: entry.clientMutationId, revision: outcome.appliedRevision });
        continue;
      }
      if (outcome.kind !== "repair") continue;
      const repairItem = outcome.repairItem;
      repairItems.push({
        id: repairItem.id,
        clientMutationId: entry.clientMutationId,
        op: repairItem.op,
        reason: repairItem.reason,
        destinationClass: repairItem.destination_class,
        originalTargetId: repairItem.original_target_id,
        createdAt: repairItem.created_at
      });
    }

    result = {
      applied,
      skipped,
      repairItems,
      newRevision: getUserRevision(db, userId),
      lastSequence: getUserLastSequence(db, userId)
    };
  });

  if (!result) throw new Error("failed to apply mutations");
  return result;
}