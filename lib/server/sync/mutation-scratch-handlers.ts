import {
  convertScratchToSpace,
  createThinkingScratch,
  deleteThinkingScratch,
  feedScratchToTime,
  getUserRevision
} from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import type { ApplyMutationResult, NormalizedMutation } from "@/lib/server/sync/mutation-types";
import { createRepair, findUserScratch } from "@/lib/server/sync/mutation-handler-utils";
import { requireString } from "@/lib/server/sync/mutation-payload";

export function applyScratchMutation(
  db: DbState,
  userId: string,
  item: NormalizedMutation
): ApplyMutationResult | null {
  const payload = item.payload;

  if (item.op === "/v1/thinking/scratch") {
    const rawText = requireString(payload, "raw_text");
    if (!rawText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "raw_text_required", "scratch")
      };
    }
    const scratch = createThinkingScratch(db, userId, rawText, {
      clientEntityId: requireString(payload, "client_entity_id"),
      clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
    });
    if (!scratch) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "invalid_scratch_content", "scratch")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const deleteScratchMatch = item.op.match(/^\/v1\/thinking\/scratch\/([^/]+)\/delete$/);
  if (deleteScratchMatch) {
    const scratchId = deleteScratchMatch[1]!;
    if (!findUserScratch(db, userId, scratchId)) {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    const deleted = deleteThinkingScratch(db, userId, scratchId);
    return { kind: deleted ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
  }

  const scratchToSpaceMatch = item.op.match(/^\/v1\/thinking\/scratch\/([^/]+)\/to-space$/);
  if (scratchToSpaceMatch) {
    const scratchId = scratchToSpaceMatch[1]!;
    if (!findUserScratch(db, userId, scratchId)) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "scratch_missing", "space")
      };
    }
    const result = convertScratchToSpace(db, userId, scratchId, {
      clientSpaceId: typeof payload.client_space_id === "string" ? payload.client_space_id : null,
      clientParkingTrackId: typeof payload.client_parking_track_id === "string" ? payload.client_parking_track_id : null,
      clientUpdatedAt: typeof payload.client_updated_at === "string" ? payload.client_updated_at : null
    });
    if (result.kind === "ok") {
      return { kind: result.converted ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return {
      kind: "repair",
      appliedRevision: getUserRevision(db, userId),
      repairItem: createRepair(db, userId, item, `scratch_to_space_${result.kind}`, "space")
    };
  }

  const feedScratchMatch = item.op.match(/^\/v1\/thinking\/scratch\/([^/]+)\/feed-to-time$/);
  if (feedScratchMatch) {
    const scratchId = feedScratchMatch[1]!;
    if (!findUserScratch(db, userId, scratchId)) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "scratch_missing", "time_doubt")
      };
    }
    const result = feedScratchToTime(db, userId, scratchId, {
      clientDoubtId: typeof payload.client_doubt_id === "string" ? payload.client_doubt_id : null
    });
    if (result.kind === "ok") {
      return { kind: result.created ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return {
      kind: "repair",
      appliedRevision: getUserRevision(db, userId),
      repairItem: createRepair(db, userId, item, `scratch_feed_${result.kind}`, "time_doubt")
    };
  }

  return null;
}
