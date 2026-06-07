import {
  addQuestionToSpace,
  createEmptyTrack,
  createThinkingSpace,
  deleteThinkingSpace,
  getUserRevision,
  organizeSpaceApply,
  setActiveTrack,
  updateSpaceBackground,
  updateSpaceRootQuestion,
  updateSpaceStarMapState,
  writeSpaceToTime
} from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import { createRepair, findUserSpace } from "@/lib/server/sync/mutation-handler-utils";
import { requireString } from "@/lib/server/sync/mutation-payload";
import { buildStarMapPatch } from "@/lib/server/sync/mutation-star-map";
import type { ApplyMutationResult, NormalizedMutation } from "@/lib/server/sync/mutation-types";

export function applySpaceMutation(
  db: DbState,
  userId: string,
  item: NormalizedMutation
): ApplyMutationResult | null {
  const payload = item.payload;

  if (item.op === "/v1/thinking/spaces") {
    const rootQuestionText = requireString(payload, "root_question_text");
    if (!rootQuestionText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "root_question_required", "space")
      };
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_create_failed", "space")
      };
    }
    if ("over_limit" in created && created.over_limit) {
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "space")
      };
    }
    if (space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "space")
      };
    }
    const rawText = requireString(payload, "raw_text");
    if (!rawText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "raw_text_required", "space")
      };
    }
    const added = addQuestionToSpace(db, userId, spaceId, rawText, {
      track_id: requireString(payload, "track_id"),
      from_suggestion: payload.from_suggestion === true,
      client_node_id: requireString(payload, "client_node_id"),
      client_created_at: requireString(payload, "client_created_at") ?? requireString(payload, "client_updated_at") ?? item.clientTime
    });
    if (added.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `question_add_${added.kind}`, "space")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const renameSpaceMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/rename$/);
  if (renameSpaceMatch) {
    const spaceId = renameSpaceMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "space")
      };
    }
    if (space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "space")
      };
    }
    const rootQuestionText = requireString(payload, "root_question_text");
    if (!rootQuestionText) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "root_question_required", "space")
      };
    }
    const renamed = updateSpaceRootQuestion(db, userId, spaceId, rootQuestionText);
    if (renamed.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `space_rename_${renamed.kind}`, "space")
      };
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "time_doubt")
      };
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `write_to_time_${written.kind}`, "time_doubt")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const backgroundMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/background$/);
  if (backgroundMatch) {
    const spaceId = backgroundMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "space")
      };
    }
    if (space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "space")
      };
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `background_${result.kind}`, "space")
      };
    }
    return { kind: "applied", appliedRevision: getUserRevision(db, userId) };
  }

  const starMapMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/star-map$/);
  if (starMapMatch) {
    const spaceId = starMapMatch[1]!;
    const space = findUserSpace(db, userId, spaceId);
    if (!space) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "space")
      };
    }
    if (space.status !== "active") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_readonly", "space")
      };
    }
    const patch = buildStarMapPatch(payload);
    if (!patch) {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "star_map_invalid", "space")
      };
    }
    const result = updateSpaceStarMapState(db, userId, spaceId, patch);
    if (result.kind !== "ok") {
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, `star_map_${result.kind}`, "space")
      };
    }
    return { kind: result.changed ? "applied" : "skipped", appliedRevision: getUserRevision(db, userId) };
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
      return {
        kind: "repair",
        appliedRevision: getUserRevision(db, userId),
        repairItem: createRepair(db, userId, item, "space_missing", "space")
      };
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

  return null;
}
