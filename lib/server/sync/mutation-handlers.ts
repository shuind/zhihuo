import { getUserRevision } from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import { createRepair } from "@/lib/server/sync/mutation-handler-utils";
import { applyLifeMutation } from "@/lib/server/sync/mutation-life-handlers";
import { applyNodeMutation } from "@/lib/server/sync/mutation-node-handlers";
import { applyScratchMutation } from "@/lib/server/sync/mutation-scratch-handlers";
import { applySpaceMutation } from "@/lib/server/sync/mutation-space-handlers";
import type { ApplyMutationResult, NormalizedMutation } from "@/lib/server/sync/mutation-types";

export function applyMutation(db: DbState, userId: string, item: NormalizedMutation): ApplyMutationResult {
  const outcome =
    applySpaceMutation(db, userId, item) ??
    applyLifeMutation(db, userId, item) ??
    applyNodeMutation(db, userId, item) ??
    applyScratchMutation(db, userId, item);
  if (outcome) return outcome;

  if (
    /^\/v1\/thinking\/spaces\/[^/]+\/freeze$/.test(item.op) ||
    /^\/v1\/thinking\/spaces\/[^/]+\/track-direction$/.test(item.op) ||
    /^\/v1\/thinking\/nodes\/[^/]+\/link$/.test(item.op)
  ) {
    return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
  }

  return {
    kind: "repair",
    appliedRevision: getUserRevision(db, userId),
    repairItem: createRepair(db, userId, item, "unsupported_mutation", null)
  };
}
