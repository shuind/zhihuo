import {
  createDoubt,
  createThinkingSpaceFromDoubt,
  deleteDoubt,
  ensureDoubtArchived,
  getUserRevision,
  upsertDoubtNote
} from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import { createRepair, findUserDoubt } from "@/lib/server/sync/mutation-handler-utils";
import { requireString } from "@/lib/server/sync/mutation-payload";
import type { ApplyMutationResult, NormalizedMutation } from "@/lib/server/sync/mutation-types";

export function applyLifeMutation(
  db: DbState,
  userId: string,
  item: NormalizedMutation
): ApplyMutationResult | null {
  const payload = item.payload;

  if (item.op === "/v1/doubts") {
    const rawText = requireString(payload, "raw_text");
    if (!rawText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "raw_text_required", "time_doubt")
      };
    }
    const created = createDoubt(db, userId, rawText, {
      clientEntityId: requireString(payload, "client_entity_id"),
      clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
    });
    if (!created) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "invalid_doubt_content", "time_doubt")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const noteMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/note$/);
  if (noteMatch) {
    const doubtId = noteMatch[1]!;
    if (!findUserDoubt(db, userId, doubtId)) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "doubt_missing", "time_doubt")
      };
    }
    const noteText = typeof payload.note_text === "string" ? payload.note_text : "";
    const note = upsertDoubtNote(db, userId, doubtId, noteText);
    if (!note) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "note_apply_failed", "time_doubt")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const archiveMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/archive$/);
  if (archiveMatch) {
    const doubtId = archiveMatch[1]!;
    if (!findUserDoubt(db, userId, doubtId)) {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    const archived = ensureDoubtArchived(db, userId, doubtId);
    if (archived.kind !== "ok") {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return { kind: archived.changed ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
  }

  const deleteDoubtMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/delete$/);
  if (deleteDoubtMatch) {
    const doubtId = deleteDoubtMatch[1]!;
    const deleted = deleteDoubt(db, userId, doubtId);
    return { kind: deleted ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
  }

  const toThinkingMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/to-thinking$/);
  if (toThinkingMatch) {
    const doubtId = toThinkingMatch[1]!;
    const doubt = findUserDoubt(db, userId, doubtId);
    if (!doubt) {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    const converted = createThinkingSpaceFromDoubt(db, userId, doubtId);
    if (!converted) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "doubt_missing", "space")
      };
    }
    if ("over_limit" in converted && converted.over_limit) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "active_space_limit", "space")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  return null;
}
