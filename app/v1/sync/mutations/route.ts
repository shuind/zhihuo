import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import {
  addQuestionToSpace,
  appendSyncOperationLog,
  createDoubt,
  createEmptyTrack,
  createThinkingScratch,
  createThinkingSpace,
  createThinkingSpaceFromDoubt,
  deleteDoubt,
  deleteNode,
  deleteThinkingScratch,
  deleteThinkingSpace,
  ensureDoubtArchived,
  findAppliedClientMutation,
  getUserLastSequence,
  getUserRevision,
  listUserSyncRepairItems,
  markNodeMisplaced,
  moveNode,
  organizeSpaceApply,
  setActiveTrack,
  recordAppliedClientMutation,
  recordSyncRepairItem,
  setNodeImageAsset,
  updateNodeAnswer,
  updateNodeQuestion,
  updateSpaceBackground,
  updateSpaceRootQuestion,
  upsertDoubtNote,
  writeSpaceToTime,
  convertScratchToSpace,
  copyNode,
  feedScratchToTime
} from "@/lib/server/store";
import type { DbState, SyncRepairItemRecord } from "@/lib/server/types";

type SyncMutation = {
  clientMutationId?: string;
  op?: string;
  payload?: Record<string, unknown> | null;
  clientTime?: string | null;
  clientOrder?: number;
  deviceId?: string | null;
};

type SyncMutationsBody = {
  baseRevision?: number;
  deviceId?: string | null;
  mutations?: SyncMutation[];
};

type AppliedMutationResult = {
  clientMutationId: string;
  revision: number;
};

type RepairItemResponse = {
  id: string;
  clientMutationId: string;
  op: string;
  reason: string;
  destinationClass: string | null;
  originalTargetId: string | null;
  createdAt: string;
};

function requireString(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "string" ? String(record[key]) : null;
}

function toPayloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function findUserDoubt(db: DbState, userId: string, doubtId: string) {
  return db.doubts.find((item) => item.id === doubtId && item.user_id === userId && !item.deleted_at) ?? null;
}

function findUserScratch(db: DbState, userId: string, scratchId: string) {
  return db.thinking_scratch.find((item) => item.id === scratchId && item.user_id === userId && !item.deleted_at) ?? null;
}

function findUserSpace(db: DbState, userId: string, spaceId: string) {
  return db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
}

function findUserNode(db: DbState, userId: string, nodeId: string) {
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

function createRepair(
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

type NormalizedMutation = {
  clientMutationId: string;
  op: string;
  payload: Record<string, unknown>;
  clientTime: string | null;
  clientOrder: number;
  deviceId: string;
};

type ApplyMutationResult =
  | { kind: "applied" | "skipped"; appliedRevision: number }
  | { kind: "repair"; appliedRevision: number; repairItem: SyncRepairItemRecord };

function applyMutation(db: DbState, userId: string, item: NormalizedMutation): ApplyMutationResult {
  const payload = item.payload;

  switch (item.op) {
    case "/v1/doubts": {
      const rawText = requireString(payload, "raw_text");
      if (!rawText) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "raw_text_required", "time_doubt") };
      }
      const created = createDoubt(db, userId, rawText, {
        clientEntityId: requireString(payload, "client_entity_id"),
        clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
      });
      if (!created) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "invalid_doubt_content", "time_doubt") };
      }
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    case "/v1/thinking/spaces": {
      const rootQuestionText = requireString(payload, "root_question_text");
      if (!rootQuestionText) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "root_question_required", "space") };
      }
      const created = createThinkingSpace(
        db,
        userId,
        rootQuestionText,
        requireString(payload, "source_time_doubt_id"),
        {
          clientSpaceId: requireString(payload, "client_space_id"),
          clientParkingTrackId: requireString(payload, "client_parking_track_id"),
          clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
        }
      );
      if (!created) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_create_failed", "space") };
      }
      if ("over_limit" in created && created.over_limit) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "active_space_limit", "space") };
      }
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    case "/v1/thinking/scratch": {
      const rawText = requireString(payload, "raw_text");
      if (!rawText) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "raw_text_required", "scratch") };
      }
      const scratch = createThinkingScratch(db, userId, rawText, {
        clientEntityId: requireString(payload, "client_entity_id"),
        clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
      });
      if (!scratch) {
        return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "invalid_scratch_content", "scratch") };
      }
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
  }

  const noteMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/note$/);
  if (noteMatch) {
    const doubtId = noteMatch[1]!;
    if (!findUserDoubt(db, userId, doubtId)) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "doubt_missing", "time_doubt") };
    }
    const noteText = typeof payload.note_text === "string" ? payload.note_text : "";
    const note = upsertDoubtNote(db, userId, doubtId, noteText);
    if (!note) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "note_apply_failed", "time_doubt") };
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

  const addQuestionMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/questions$/);
  if (addQuestionMatch) {
    const spaceId = addQuestionMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_missing", "space") };
    }
    if (space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "space") };
    }
    const rawText = requireString(payload, "raw_text");
    if (!rawText) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "raw_text_required", "space") };
    }
    const added = addQuestionToSpace(db, userId, spaceId, rawText, {
      track_id: requireString(payload, "track_id"),
      from_suggestion: payload.from_suggestion === true,
      client_node_id: requireString(payload, "client_node_id"),
      client_created_at: requireString(payload, "client_created_at") ?? requireString(payload, "client_updated_at") ?? item.clientTime
    });
    if (added.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `question_add_${added.kind}`, "space") };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const renameSpaceMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/rename$/);
  if (renameSpaceMatch) {
    const spaceId = renameSpaceMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_missing", "space") };
    }
    if (space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "space") };
    }
    const rootQuestionText = requireString(payload, "root_question_text");
    if (!rootQuestionText) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "root_question_required", "space") };
    }
    const renamed = updateSpaceRootQuestion(db, userId, spaceId, rootQuestionText);
    if (renamed.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `space_rename_${renamed.kind}`, "space") };
    }
    return { kind: renamed.changed ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
  }

  const deleteSpaceMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/delete$/);
  if (deleteSpaceMatch) {
    const spaceId = deleteSpaceMatch[1]!;
    const deleted = deleteThinkingSpace(db, userId, spaceId);
    if (deleted.kind === "not_found") {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const writeToTimeMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/write-to-time$/);
  if (writeToTimeMatch) {
    const spaceId = writeToTimeMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_missing", "time_doubt") };
    }
    if (space.status !== "active") {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    const written = writeSpaceToTime(
      db,
      userId,
      spaceId,
      typeof payload.note_text === "string"
        ? payload.note_text
        : typeof payload.freeze_note === "string"
          ? payload.freeze_note
          : null,
      {
        preserveOriginalTime: payload.preserve_original_time !== false,
        clientDoubtId: typeof payload.client_doubt_id === "string" ? payload.client_doubt_id : null,
        letterTitle: typeof payload.letter_title === "string" ? payload.letter_title : null,
        letterLines: Array.isArray(payload.letter_lines)
          ? payload.letter_lines.filter((line): line is string => typeof line === "string")
          : null,
        letterVariant: typeof payload.letter_variant === "string" ? payload.letter_variant : null,
        letterSealText: typeof payload.letter_seal_text === "string" ? payload.letter_seal_text : null
      }
    );
    if (written.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `write_to_time_${written.kind}`, "time_doubt") };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const backgroundMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/background$/);
  if (backgroundMatch) {
    const spaceId = backgroundMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_missing", "space") };
    }
    if (space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "space") };
    }
    const result = updateSpaceBackground(
      db,
      userId,
      spaceId,
      typeof payload.background_text === "string" ? payload.background_text : null,
      {
        backgroundAssetIds: Array.isArray(payload.background_asset_ids)
          ? payload.background_asset_ids.filter((id): id is string => typeof id === "string")
          : undefined,
        backgroundSelectedAssetId:
          typeof payload.background_selected_asset_id === "string" ? payload.background_selected_asset_id : null
      }
    );
    if (result.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `background_${result.kind}`, "space") };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const setActiveTrackMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/active-track$/);
  if (setActiveTrackMatch) {
    const spaceId = setActiveTrackMatch[1]!;
    const result = setActiveTrack(db, userId, spaceId, typeof payload.track_id === "string" ? payload.track_id : null);
    if (result.kind === "ok") {
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    if (result.kind === "not_found" || result.kind === "track_not_found") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `active_track_${result.kind}`, "space")
      };
    }
  }

  const createTrackMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/tracks$/);
  if (createTrackMatch) {
    const spaceId = createTrackMatch[1]!;
    const result = createEmptyTrack(
      db,
      userId,
      spaceId,
      typeof payload.client_track_id === "string" ? payload.client_track_id : null
    );
    if (result.kind === "ok") {
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    return {
      kind: "repair",
      appliedRevision: getUserRevision(db, userId),
      repairItem: createRepair(db, userId, item, `track_create_${result.kind}`, "space")
    };
  }

  const organizeApplyMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/organize-apply$/);
  if (organizeApplyMatch) {
    const spaceId = organizeApplyMatch[1]!;
    const moves = Array.isArray(payload.moves)
      ? payload.moves
          .filter((move): move is Record<string, unknown> => Boolean(move && typeof move === "object"))
          .map((move) => ({
            node_id: typeof move.node_id === "string" ? move.node_id : "",
            target_track_id: typeof move.target_track_id === "string" ? move.target_track_id : ""
          }))
          .filter((move) => move.node_id && move.target_track_id)
      : [];
    if (!moves.length) {
      return { kind: "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    const result = organizeSpaceApply(db, userId, spaceId, moves);
    if (!result) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_missing", "space") };
    }
    if (result.kind === "ok") {
      return { kind: result.moved_count > 0 ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return {
      kind: "repair",
      appliedRevision: getUserRevision(db, userId),
      repairItem: createRepair(db, userId, item, `organize_apply_${result.kind}`, "space")
    };
  }

  const updateNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/update$/);
  if (updateNodeMatch) {
    const nodeId = updateNodeMatch[1]!;
    const nodeRef = findUserNode(db, userId, nodeId);
    if (!nodeRef) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "node_missing", "node") };
    }
    if (nodeRef.space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "node") };
    }
    const rawQuestionText = requireString(payload, "raw_question_text");
    if (!rawQuestionText) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "raw_question_required", "node") };
    }
    const updated = updateNodeQuestion(db, userId, nodeId, rawQuestionText);
    if (updated.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `node_update_${updated.kind}`, "node") };
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
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "node_missing", "node") };
    }
    if (nodeRef.space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "node") };
    }
    const answerText = typeof payload.answer_text === "string" ? payload.answer_text : null;
    const updated = updateNodeAnswer(db, userId, nodeId, answerText);
    if (updated.kind !== "ok") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `node_answer_${updated.kind}`, "node") };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const imageNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/image$/);
  if (imageNodeMatch) {
    const nodeId = imageNodeMatch[1]!;
    const nodeRef = findUserNode(db, userId, nodeId);
    if (!nodeRef) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "node_missing", "node") };
    }
    if (nodeRef.space.status !== "active") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "space_readonly", "node") };
    }
    const result = setNodeImageAsset(db, userId, nodeId, typeof payload.image_asset_id === "string" ? payload.image_asset_id : null);
    if (result.kind === "ok") {
      return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
    }
    if (result.kind === "asset_not_found") {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "asset_missing", "node") };
    }
    return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `node_image_${result.kind}`, "node") };
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
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "scratch_missing", "space") };
    }
    const result = convertScratchToSpace(db, userId, scratchId, {
      clientSpaceId: typeof payload.client_space_id === "string" ? payload.client_space_id : null,
      clientParkingTrackId: typeof payload.client_parking_track_id === "string" ? payload.client_parking_track_id : null,
      clientUpdatedAt: typeof payload.client_updated_at === "string" ? payload.client_updated_at : null
    });
    if (result.kind === "ok") {
      return { kind: result.converted ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `scratch_to_space_${result.kind}`, "space") };
  }

  const feedScratchMatch = item.op.match(/^\/v1\/thinking\/scratch\/([^/]+)\/feed-to-time$/);
  if (feedScratchMatch) {
    const scratchId = feedScratchMatch[1]!;
    if (!findUserScratch(db, userId, scratchId)) {
      return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, "scratch_missing", "time_doubt") };
    }
    const result = feedScratchToTime(db, userId, scratchId, {
      clientDoubtId: typeof payload.client_doubt_id === "string" ? payload.client_doubt_id : null
    });
    if (result.kind === "ok") {
      return { kind: result.created ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
    }
    return { kind: "repair", appliedRevision: getUserRevision(db, userId), repairItem: createRepair(db, userId, item, `scratch_feed_${result.kind}`, "time_doubt") };
  }

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

export const POST = withApiRoute(
  "sync.mutations.post",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<SyncMutationsBody>(request);
    const baseRevision = Number.isFinite(body?.baseRevision) ? Number(body?.baseRevision) : 0;
    const requestDeviceId = typeof body?.deviceId === "string" && body.deviceId.trim() ? body.deviceId : null;
    const mutations = Array.isArray(body?.mutations) ? body.mutations : [];
    if (!mutations.length) return errorJson(400, "mutations is required");

    let conflictRevision: number | null = null;
    let result:
      | {
          applied: AppliedMutationResult[];
          skipped: AppliedMutationResult[];
          repairItems: RepairItemResponse[];
          newRevision: number;
          lastSequence: number;
        }
      | null = null;

    try {
      await updateDb((db) => {
        const currentRevision = getUserRevision(db, userId);
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
          .sort((a, b) => a.clientOrder - b.clientOrder);

        if (!normalized.length) throw new Error("mutations is required");

        const existing = normalized.map((entry) => findAppliedClientMutation(db, userId, entry.clientMutationId));
        const allAlreadyApplied = existing.every(Boolean);
        if (!allAlreadyApplied && currentRevision !== baseRevision) {
          conflictRevision = currentRevision;
          throw new Error("revision_conflict");
        }

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

          const outcome = applyMutation(db, userId, entry);
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
    } catch (error) {
      if (conflictRevision !== null) {
        return errorJson(409, `revision_conflict:${conflictRevision}`);
      }
      return errorJson(400, error instanceof Error ? error.message : "failed to apply mutations");
    }

    if (!result) return errorJson(500, "failed to apply mutations");
    return okJson(result);
  },
  { rateLimit: { bucket: "sync-mutations", max: 90, windowMs: 60 * 1000 } }
);
