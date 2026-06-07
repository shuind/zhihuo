import {
  copyNode,
  deleteNode,
  getUserRevision,
  markNodeMisplaced,
  moveNode,
  setNodeImageAsset,
  updateNodeAnswer,
  updateNodeQuestion
} from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import { createRepair, findUserNode } from "@/lib/server/sync/mutation-handler-utils";
import { requireString } from "@/lib/server/sync/mutation-payload";
import type { ApplyMutationResult, NormalizedMutation } from "@/lib/server/sync/mutation-types";

export function applyNodeMutation(
  db: DbState,
  userId: string,
  item: NormalizedMutation
): ApplyMutationResult | null {
  const payload = item.payload;

  const updateNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/update$/);
  if (updateNodeMatch) {
    const nodeId = updateNodeMatch[1]!;
    const nodeRef = findUserNode(db, userId, nodeId);
    if (!nodeRef) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "node_missing", "node")
      };
    }
    if (nodeRef.space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "node")
      };
    }
    const rawQuestionText = requireString(payload, "raw_question_text");
    if (!rawQuestionText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "raw_question_required", "node")
      };
    }
    const updated = updateNodeQuestion(db, userId, nodeId, rawQuestionText);
    if (updated.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `node_update_${updated.kind}`, "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const moveNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/move$/);
  if (moveNodeMatch) {
    const nodeId = moveNodeMatch[1]!;
    const targetTrackId = requireString(payload, "target_track_id");
    if (!targetTrackId) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "target_track_required", "node")
      };
    }
    const moved = moveNode(db, userId, nodeId, targetTrackId);
    if (!moved) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "node_missing", "node")
      };
    }
    if (moved.readonly) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const deleteNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/delete$/);
  if (deleteNodeMatch) {
    const nodeId = deleteNodeMatch[1]!;
    const deleted = deleteNode(db, userId, nodeId);
    if (deleted.kind === "not_found") {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    if (deleted.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `node_delete_${deleted.kind}`, "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const copyNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/copy$/);
  if (copyNodeMatch) {
    const nodeId = copyNodeMatch[1]!;
    const copied = copyNode(
      db,
      userId,
      nodeId,
      typeof payload.target_track_id === "string" ? payload.target_track_id : null,
      {
        clientNodeId: typeof payload.client_node_id === "string" ? payload.client_node_id : null,
        clientCreatedAt: typeof payload.client_created_at === "string" ? payload.client_created_at : null
      }
    );
    if (copied.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `node_copy_${copied.kind}`, "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const answerNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/answer$/);
  if (answerNodeMatch) {
    const nodeId = answerNodeMatch[1]!;
    const nodeRef = findUserNode(db, userId, nodeId);
    if (!nodeRef) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "node_missing", "node")
      };
    }
    if (nodeRef.space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "node")
      };
    }
    const answerText = typeof payload.answer_text === "string" ? payload.answer_text : null;
    const updated = updateNodeAnswer(db, userId, nodeId, answerText);
    if (updated.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `node_answer_${updated.kind}`, "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const imageNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/image$/);
  if (imageNodeMatch) {
    const nodeId = imageNodeMatch[1]!;
    const nodeRef = findUserNode(db, userId, nodeId);
    if (!nodeRef) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "node_missing", "node")
      };
    }
    if (nodeRef.space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "node")
      };
    }
    const result = setNodeImageAsset(db, userId, nodeId, typeof payload.image_asset_id === "string" ? payload.image_asset_id : null);
    if (result.kind === "ok") {
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    if (result.kind === "asset_not_found") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "asset_missing", "node")
      };
    }
    return {
      kind: "repair",
      appliedRevision: getUserRevision(db, userId),
      repairItem: createRepair(db, userId, item, `node_image_${result.kind}`, "node")
    };
  }

  const misplacedNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/misplaced$/);
  if (misplacedNodeMatch) {
    const nodeId = misplacedNodeMatch[1]!;
    const misplaced = markNodeMisplaced(db, userId, nodeId);
    if (!misplaced) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "node_missing", "node")
      };
    }
    if (misplaced.readonly) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "node")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  return null;
}
