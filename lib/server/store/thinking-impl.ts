import type {
  DbState,
  DimensionKey,
  DoubtRecord,
  ThinkingMediaAssetRecord,
  ThinkingNodeLinkRecord,
  ThinkingNodeRecord,
  ThinkingScratchRecord,
  ThinkingSnapshot,
  ThinkingSpaceMetaRecord,
  ThinkingSpaceRecord,
  StarMapPlacementRecord
} from "@/lib/server/types";
import {
  ensureMeta,
  getMetaForRead,
  getSpaceForRead,
  appendAuditLog,
  isPlainRecord,
  isSpaceActive,
  markSpaceActivity,
  normalizeLetterLines,
  normalizeSpaceStatus,
  normalizeStarMapPlacements,
  requireDoubt,
  requireScratch,
  requireSpace,
  requireUser,
  sanitizeMeta,
  userDoubts,
  userScratch,
  userSpaces
} from "@/lib/server/store/shared";
import {
  listThinkingMediaAssets,
  pruneUnusedMediaAsset,
  requireMediaAsset
} from "@/lib/server/store/media-impl";
import { createDoubt, createDoubtAt } from "@/lib/server/store/life-impl";
import {
  bumpUserRevision,
  getUserLastSequence,
  getUserRevision,
  listUserSyncRepairItems
} from "@/lib/server/store/sync-impl";
import {
  MAX_ACTIVE_SPACES,
  MAX_SPACE_NODES,
  buildSuggestedQuestions,
  classifyDimension,
  collapseWhitespace,
  createId,
  formatDateTime,
  normalizeMultilineText,
  normalizeQuestionInput,
  nowIso,
  textOverlapScore,
  tokenizeText
} from "@/lib/server/utils";

const TRACK_PREFIX = "track:";
const ORGANIZE_MOVE_THRESHOLD = 0.52;
const ORGANIZE_MOVE_DELTA = 0.16;

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function getUserSyncSnapshot(db: DbState, userId: string) {
  if (!requireUser(db, userId)) return null;
  const doubts = userDoubts(db, userId)
    .filter((item) => !item.deleted_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const doubtIds = new Set(doubts.map((item) => item.id));
  const notes = db.doubt_notes.filter((item) => doubtIds.has(item.doubt_id));
  const thinking = getThinkingSnapshot(db, userId);
  const revision = getUserRevision(db, userId);
  const lastSequence = getUserLastSequence(db, userId);
  const repairItems = listUserSyncRepairItems(db, userId);
  return {
    revision,
    lastSequence,
    repairItems,
    life: {
      doubts,
      notes
    },
    thinking
  };
}

function maxOrderIndex(nodes: ThinkingNodeRecord[]) {
  return nodes.reduce((max, node) => Math.max(max, node.order_index), -1);
}

function toTrackParentId(trackId: string) {
  return `${TRACK_PREFIX}${trackId}`;
}

function normalizeTrackId(raw: string | null | undefined) {
  if (!raw) return null;
  const compact = collapseWhitespace(raw);
  if (!compact) return null;
  if (compact === "__new__") return "__new__";
  if (compact.startsWith(TRACK_PREFIX)) return compact.slice(TRACK_PREFIX.length);
  if (compact.startsWith("branch:")) return `legacy-${compact.slice("branch:".length)}`;
  return compact;
}

function trackIdFromNode(node: ThinkingNodeRecord) {
  const normalized = normalizeTrackId(node.parent_node_id);
  if (normalized && normalized !== "__new__") return normalized;
  return `legacy-${node.dimension}`;
}

function getSpaceNodes(db: DbState, spaceId: string) {
  return db.thinking_nodes
    .filter((node) => node.space_id === spaceId && node.state === "normal")
    .sort((a, b) => a.order_index - b.order_index);
}

function getTrackMap(nodes: ThinkingNodeRecord[]) {
  const tracks = new Map<string, ThinkingNodeRecord[]>();
  for (const node of nodes) {
    const trackId = trackIdFromNode(node);
    const list = tracks.get(trackId);
    if (list) list.push(node);
    else tracks.set(trackId, [node]);
  }
  for (const list of tracks.values()) list.sort((a, b) => a.order_index - b.order_index);
  return tracks;
}

function getTrackProfile(nodes: ThinkingNodeRecord[]) {
  const seed = nodes.slice(0, 3);
  const tokens = tokenizeText(seed.map((item) => item.raw_question_text).join(" "));
  const dimensions = new Map<DimensionKey, number>();
  for (const item of seed) dimensions.set(item.dimension, (dimensions.get(item.dimension) ?? 0) + 1);
  let majorDimension: DimensionKey = seed[0]?.dimension ?? "definition";
  let majorCount = 0;
  for (const [dimension, count] of dimensions.entries()) {
    if (count > majorCount) {
      majorDimension = dimension;
      majorCount = count;
    }
  }
  return { tokens, majorDimension };
}

function scoreNodeForTrack(node: ThinkingNodeRecord, profile: ReturnType<typeof getTrackProfile>, sticky = false) {
  const nodeTokens = tokenizeText(node.raw_question_text);
  const overlap = textOverlapScore(nodeTokens, profile.tokens);
  const dimensionBonus = profile.majorDimension === node.dimension ? 0.18 : 0;
  const stickyBonus = sticky ? 0.14 : 0;
  return overlap + dimensionBonus + stickyBonus;
}

function enforceMaxNodes(db: DbState, spaceId: string) {
  const normals = getSpaceNodes(db, spaceId);
  if (normals.length <= MAX_SPACE_NODES) return;
  const hideIds = new Set(normals.slice(0, normals.length - MAX_SPACE_NODES).map((node) => node.id));
  db.thinking_nodes = db.thinking_nodes.map((node) =>
    node.space_id === spaceId && hideIds.has(node.id) ? { ...node, state: "hidden" as const } : node
  );
}

function chooseFallbackTrackId(nodes: ThinkingNodeRecord[]) {
  if (!nodes.length) return null;
  const latest = [...nodes].sort((a, b) => b.order_index - a.order_index)[0];
  return latest ? trackIdFromNode(latest) : null;
}

function getParkingTrackId(meta: ThinkingSpaceMetaRecord) {
  if (typeof meta.parking_track_id === "string" && meta.parking_track_id.trim()) return meta.parking_track_id;
  const next = createId();
  meta.parking_track_id = next;
  return next;
}

function getEmptyTrackIds(meta: ThinkingSpaceMetaRecord) {
  sanitizeMeta(meta);
  return meta.empty_track_ids ?? [];
}

function removeEmptyTrackId(meta: ThinkingSpaceMetaRecord, trackId: string) {
  meta.empty_track_ids = getEmptyTrackIds(meta).filter((id) => id !== trackId);
  if (meta.pending_track_id === trackId) meta.pending_track_id = null;
}

function getPendingTrackId(meta: ThinkingSpaceMetaRecord) {
  sanitizeMeta(meta);
  return meta.pending_track_id ?? null;
}

function setPendingTrackId(meta: ThinkingSpaceMetaRecord, trackId: string | null) {
  meta.pending_track_id = trackId;
  meta.empty_track_ids = trackId ? [trackId] : [];
}

function trackQuestionPreview(text: string, limit = 46) {
  const compact = collapseWhitespace(text);
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit)}...`;
}

function deriveTrackEdgePreview(nodes: ThinkingNodeRecord[]) {
  if (!nodes.length) return { firstNode: null, lastNode: null } as const;
  const ordered = [...nodes].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) return aTime - bTime;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return a.order_index - b.order_index;
  });
  const firstNode = collapseWhitespace(ordered[0]?.raw_question_text ?? "");
  const lastNode = collapseWhitespace(ordered[ordered.length - 1]?.raw_question_text ?? "");
  return {
    firstNode: firstNode || null,
    lastNode: lastNode || firstNode || null
  } as const;
}

function echoKey(text: string) {
  return text.toLowerCase().replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
}

export function createThinkingSpace(
  db: DbState,
  userId: string,
  rootQuestionText: string,
  sourceTimeDoubtId: string | null,
  options?: {
    clientSpaceId?: string | null;
    clientParkingTrackId?: string | null;
    clientUpdatedAt?: string | null;
  }
) {
  const cleaned = collapseWhitespace(rootQuestionText);
  if (!cleaned) return null;

  const normalized = normalizeQuestionInput(cleaned, null);
  // Space titles should accept short scratch content (e.g. single-character notes).
  const finalRootText = normalized.ok ? normalized.text : cleaned;
  const converted = normalized.ok ? normalized.converted : false;
  const createdAsStatement = normalized.ok ? !normalized.is_question : true;
  const suggestedQuestions = normalized.ok ? normalized.suggested_questions.slice(0, 3) : [];
  const questionSuggestion = suggestedQuestions[0] ?? null;

  const activeCount = userSpaces(db, userId).filter((space) => isSpaceActive(space)).length;
  if (activeCount >= MAX_ACTIVE_SPACES) return { over_limit: true as const };
  const now = options?.clientUpdatedAt ?? nowIso();
  const preferredSpaceId =
    typeof options?.clientSpaceId === "string" && options.clientSpaceId.trim() ? options.clientSpaceId : null;
  const preferredParkingTrackId =
    typeof options?.clientParkingTrackId === "string" && options.clientParkingTrackId.trim() ? options.clientParkingTrackId : null;
  if (preferredSpaceId) {
    const existed = db.thinking_spaces.find((space) => space.id === preferredSpaceId && space.user_id === userId);
    if (existed) {
      ensureMeta(db, existed.id);
      return {
        over_limit: false as const,
        space: existed,
        converted,
        created_as_statement: createdAsStatement,
        suggested_questions: suggestedQuestions,
        question_suggestion: questionSuggestion
      };
    }
  }
  const space: ThinkingSpaceRecord = {
    id: preferredSpaceId ?? createId(),
    user_id: userId,
    root_question_text: finalRootText,
    status: "active",
    created_at: now,
    frozen_at: null,
    last_activity_at: now,
    source_time_doubt_id: sourceTimeDoubtId
  };
  db.thinking_spaces.unshift(space);
  db.thinking_space_meta.unshift({
    space_id: space.id,
    user_freeze_note: null,
    export_version: 1,
    background_text: null,
    background_version: 0,
    background_asset_ids: [],
    background_selected_asset_id: null,
    suggestion_decay: 0,
    last_track_id: null,
    last_organized_order: -1,
    parking_track_id: preferredParkingTrackId ?? createId(),
    pending_track_id: null,
    empty_track_ids: [],
    milestone_node_ids: [],
    track_direction_hints: {}
  });
  bumpUserRevision(db, userId);
  return {
    over_limit: false as const,
    space,
    converted,
    created_as_statement: createdAsStatement,
    suggested_questions: suggestedQuestions,
    question_suggestion: questionSuggestion
  };
}

export function listThinkingSpaces(db: DbState, userId: string) {
  const rawSpaces = userSpaces(db, userId);
  const ids = new Set(rawSpaces.map((space) => space.id));
  const spaceMeta = db.thinking_space_meta.filter((meta) => ids.has(meta.space_id)).map(sanitizeMeta);
  const nodesBySpace = new Map<string, ThinkingNodeRecord[]>();
  for (const node of db.thinking_nodes.filter((node) => ids.has(node.space_id) && node.state === "normal")) {
    const list = nodesBySpace.get(node.space_id);
    if (list) list.push(node);
    else nodesBySpace.set(node.space_id, [node]);
  }
  const spaces = rawSpaces
    .map((space) => ({
      ...space,
      status: normalizeSpaceStatus(space.status),
      last_activity_at: getSpaceLastActivity(space, nodesBySpace.get(space.id) ?? [])
    }))
    .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  const seenBindings = new Set<string>();
  const seenDoubtIds = new Set<string>();
  const seenSpaceIds = new Set<string>();
  const timeLinks = spaces
    .filter((space) => typeof space.source_time_doubt_id === "string")
    .filter((space) => {
      const doubtId = space.source_time_doubt_id as string;
      const bindingKey = `${space.id}:${doubtId}`;
      if (seenBindings.has(bindingKey) || seenDoubtIds.has(doubtId) || seenSpaceIds.has(space.id)) return false;
      seenBindings.add(bindingKey);
      seenDoubtIds.add(doubtId);
      seenSpaceIds.add(space.id);
      return true;
    })
    .map((space) => {
      return {
        doubt_id: space.source_time_doubt_id as string,
        space_id: space.id,
        status: space.status,
        reentry: {
          question_entry: {
            space_id: space.id,
            root_question_text: space.root_question_text
          }
        }
      };
    });
  return { spaces, space_meta: spaceMeta, time_links: timeLinks };
}

export function createThinkingSpaceFromDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const existing = userSpaces(db, userId)
    .filter((space) => space.source_time_doubt_id === doubt.id)
    .map((space) => ({ space, lastActivityAt: getSpaceLastActivity(space, getSpaceNodes(db, space.id)) }))
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())[0]?.space;
  if (existing) {
    existing.status = normalizeSpaceStatus(existing.status);
    if (existing.status === "hidden") {
      const activeCount = userSpaces(db, userId).filter((space) => isSpaceActive(space)).length;
      if (activeCount >= MAX_ACTIVE_SPACES) return { over_limit: true as const };
      existing.status = "active";
      existing.frozen_at = null;
      markSpaceActivity(existing);
      bumpUserRevision(db, userId);
    }
    return { over_limit: false as const, space: existing, restored: true as const };
  }
  return createThinkingSpace(db, userId, doubt.raw_text, doubt.id);
}

function getSpaceLastActivity(space: ThinkingSpaceRecord, nodes: ThinkingNodeRecord[]) {
  let latest = new Date(space.last_activity_at ?? space.created_at).getTime();
  if (!Number.isFinite(latest)) latest = new Date(space.created_at).getTime();
  for (const node of nodes) {
    const nodeTime = new Date(node.created_at).getTime();
    if (Number.isFinite(nodeTime)) latest = Math.max(latest, nodeTime);
  }
  return new Date(latest).toISOString();
}

export function listThinkingScratch(db: DbState, userId: string) {
  return userScratch(db, userId)
    .filter((item) => !item.deleted_at && !item.archived_at && !item.derived_space_id && !item.fed_time_doubt_id)
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function createThinkingScratch(
  db: DbState,
  userId: string,
  rawText: string,
  options?: { clientEntityId?: string | null; clientUpdatedAt?: string | null }
) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  const now = options?.clientUpdatedAt ?? nowIso();
  const preferredId = typeof options?.clientEntityId === "string" && options.clientEntityId.trim() ? options.clientEntityId : null;
  if (preferredId) {
    const existed = db.thinking_scratch.find((item) => item.id === preferredId && item.user_id === userId && !item.deleted_at);
    if (existed) return existed;
  }
  const scratch: ThinkingScratchRecord = {
    id: preferredId ?? createId(),
    user_id: userId,
    raw_text: normalized,
    created_at: now,
    updated_at: now,
    archived_at: null,
    deleted_at: null,
    derived_space_id: null,
    fed_time_doubt_id: null
  };
  db.thinking_scratch.unshift(scratch);
  bumpUserRevision(db, userId);
  return scratch;
}

export function deleteThinkingScratch(db: DbState, userId: string, scratchId: string) {
  const scratch = requireScratch(db, userId, scratchId);
  if (!scratch) return null;
  scratch.deleted_at = nowIso();
  bumpUserRevision(db, userId);
  return scratch;
}

export function convertScratchToSpace(
  db: DbState,
  userId: string,
  scratchId: string,
  options?: {
    clientSpaceId?: string | null;
    clientParkingTrackId?: string | null;
    clientUpdatedAt?: string | null;
  }
) {
  const scratch = requireScratch(db, userId, scratchId);
  if (!scratch) return { kind: "not_found" as const };
  if (scratch.fed_time_doubt_id) return { kind: "not_available" as const };

  if (scratch.derived_space_id) {
    const existing = requireSpace(db, userId, scratch.derived_space_id);
    if (existing) return { kind: "ok" as const, space: existing, converted: false as const };
  }

  const result = createThinkingSpace(db, userId, scratch.raw_text, null, {
    clientSpaceId: options?.clientSpaceId ?? null,
    clientParkingTrackId: options?.clientParkingTrackId ?? null,
    clientUpdatedAt: options?.clientUpdatedAt ?? null
  });
  if (!result) return { kind: "invalid" as const };
  if (result.over_limit) return { kind: "over_limit" as const };

  scratch.derived_space_id = result.space.id;
  scratch.updated_at = nowIso();
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, space: result.space, converted: true as const };
}

export function feedScratchToTime(
  db: DbState,
  userId: string,
  scratchId: string,
  options?: { clientDoubtId?: string | null }
) {
  const scratch = requireScratch(db, userId, scratchId);
  if (!scratch) return { kind: "not_found" as const };
  if (scratch.derived_space_id) return { kind: "not_available" as const };

  if (scratch.fed_time_doubt_id) {
    const existing = requireDoubt(db, userId, scratch.fed_time_doubt_id);
    if (existing) {
      return { kind: "ok" as const, doubt: existing, created: false as const };
    }
  }

  const preferredDoubtId =
    typeof options?.clientDoubtId === "string" && options.clientDoubtId.trim() ? options.clientDoubtId : null;
  const doubt = preferredDoubtId
    ? createDoubt(db, userId, scratch.raw_text, {
        clientEntityId: preferredDoubtId,
        clientUpdatedAt: scratch.created_at
      })
    : createDoubtAt(db, userId, scratch.raw_text, scratch.created_at);
  if (!doubt) return { kind: "invalid" as const };
  doubt.created_at = scratch.created_at;

  scratch.fed_time_doubt_id = doubt.id;
  scratch.updated_at = nowIso();
  bumpUserRevision(db, userId);

  return { kind: "ok" as const, doubt, created: true as const };
}

export function addQuestionToSpace(
  db: DbState,
  userId: string,
  spaceId: string,
  rawText: string,
  options?: {
    track_id?: string | null;
    from_suggestion?: boolean;
    client_node_id?: string | null;
    client_created_at?: string | null;
  }
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const parkingTrackId = getParkingTrackId(meta);
  const normalized = normalizeQuestionInput(rawText, null);
  if (!normalized.ok) {
    return {
      kind: "invalid" as const,
      reason: "too_short" as const,
      suggested_questions: normalized.suggested_questions
    };
  }

  const quota = Math.max(0, 3 - (meta.suggestion_decay ?? 0));
  const suggestedQuestions = normalized.suggested_questions.slice(0, quota);

  const nodes = getSpaceNodes(db, spaceId);
  const preferredNodeId =
    typeof options?.client_node_id === "string" && options.client_node_id.trim() ? options.client_node_id : null;
  if (preferredNodeId) {
    const existed = nodes.find((item) => item.id === preferredNodeId);
    if (existed) {
      return {
        kind: "ok" as const,
        node: existed,
        normalized_question_text: existed.raw_question_text,
        converted: false,
        note_text: existed.note_text ?? null,
        track_id: trackIdFromNode(existed),
        suggested_questions: suggestedQuestions
      };
    }
  }
  const trackMap = getTrackMap(nodes);
  const requestedTrackId = normalizeTrackId(options?.track_id ?? null);
  const pendingTrackId = getPendingTrackId(meta);
  let trackId: string | null = null;
  if (requestedTrackId && requestedTrackId !== "__new__" && pendingTrackId === requestedTrackId) {
    trackId = requestedTrackId;
    removeEmptyTrackId(meta, requestedTrackId);
  } else if (requestedTrackId && requestedTrackId !== "__new__" && trackMap.has(requestedTrackId)) {
    trackId = requestedTrackId;
    removeEmptyTrackId(meta, requestedTrackId);
  } else if (requestedTrackId && requestedTrackId !== "__new__" && requestedTrackId !== parkingTrackId) {
    trackId = requestedTrackId;
    removeEmptyTrackId(meta, requestedTrackId);
  } else if (requestedTrackId === "__new__") {
    trackId = createId();
  } else if (meta.last_track_id && trackMap.has(meta.last_track_id)) {
    trackId = meta.last_track_id;
  } else {
    trackId = chooseFallbackTrackId(nodes.filter((node) => trackIdFromNode(node) !== parkingTrackId));
  }
  if (!trackId) trackId = createId();
  if (trackId === parkingTrackId) trackId = createId();

  const node: ThinkingNodeRecord = {
    id: preferredNodeId ?? createId(),
    space_id: spaceId,
    parent_node_id: toTrackParentId(trackId),
    raw_question_text: normalized.text,
    note_text: normalized.raw_note,
    answer_text: null,
    created_at: options?.client_created_at ?? nowIso(),
    order_index: maxOrderIndex(nodes) + 1,
    is_suggested: Boolean(options?.from_suggestion),
    state: "normal",
    dimension: classifyDimension(normalized.text)
  };
  db.thinking_nodes.push(node);
  meta.last_track_id = trackId;
  meta.suggestion_decay = options?.from_suggestion ? Math.min(3, (meta.suggestion_decay ?? 0) + 1) : 0;
  markSpaceActivity(space, node.created_at);
  enforceMaxNodes(db, spaceId);
  bumpUserRevision(db, userId);

  return {
    kind: "ok" as const,
    node,
    normalized_question_text: normalized.text,
    converted: normalized.converted,
    note_text: normalized.raw_note,
    track_id: trackId,
    suggested_questions: suggestedQuestions
  };
}

export function writeSpaceToTime(
  db: DbState,
  userId: string,
  spaceId: string,
  _writeNote?: string | null,
  options?: {
    preserveOriginalTime?: boolean;
    clientDoubtId?: string | null;
    letterTitle?: string | null;
    letterLines?: string[] | null;
    letterVariant?: string | null;
    letterSealText?: string | null;
  }
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const preserveOriginalTime = options?.preserveOriginalTime !== false;
  const edgePreview = deriveTrackEdgePreview(getSpaceNodes(db, spaceId));
  let doubt: DoubtRecord | null = null;
  if (space.source_time_doubt_id) {
    doubt = requireDoubt(db, userId, space.source_time_doubt_id);
  }
  const writtenAt = preserveOriginalTime ? doubt?.created_at ?? space.created_at : nowIso();
  const letterTitle = typeof options?.letterTitle === "string" ? options.letterTitle.trim() || null : null;
  const letterLines = normalizeLetterLines(options?.letterLines);
  const letterVariant = typeof options?.letterVariant === "string" ? options.letterVariant.trim() || null : null;
  const letterSealText = typeof options?.letterSealText === "string" ? options.letterSealText.trim() || null : null;
  if (doubt) {
    doubt.raw_text = space.root_question_text;
    doubt.first_node_preview = edgePreview.firstNode;
    doubt.last_node_preview = edgePreview.lastNode;
    doubt.letter_title = letterTitle;
    doubt.letter_lines = letterLines;
    doubt.letter_variant = letterVariant;
    doubt.letter_seal_text = letterSealText;
    doubt.created_at = writtenAt;
    doubt.archived_at = null;
  } else {
    const preferredDoubtId =
      typeof options?.clientDoubtId === "string" && options.clientDoubtId.trim() ? options.clientDoubtId : null;
    doubt = preferredDoubtId
      ? createDoubt(db, userId, space.root_question_text, {
          clientEntityId: preferredDoubtId,
          clientUpdatedAt: writtenAt
        })
      : createDoubtAt(db, userId, space.root_question_text, writtenAt);
    if (!doubt) return { kind: "invalid" as const };
    doubt.created_at = writtenAt;
    doubt.first_node_preview = edgePreview.firstNode;
    doubt.last_node_preview = edgePreview.lastNode;
    doubt.letter_title = letterTitle;
    doubt.letter_lines = letterLines;
    doubt.letter_variant = letterVariant;
    doubt.letter_seal_text = letterSealText;
    space.source_time_doubt_id = doubt.id;
  }

  space.status = "hidden";
  space.frozen_at = writtenAt;
  markSpaceActivity(space, writtenAt);
  ensureMeta(db, spaceId);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, space, doubt };
}

function computeOrganizeCandidates(
  db: DbState,
  spaceId: string,
  fromOrderIndex?: number
) {
  const meta = ensureMeta(db, spaceId);
  const parkingTrackId = getParkingTrackId(meta);
  const nodes = getSpaceNodes(db, spaceId);
  const checkpoint = typeof fromOrderIndex === "number" && Number.isFinite(fromOrderIndex) ? fromOrderIndex : meta.last_organized_order ?? -1;
  const candidates = nodes.filter((node) => node.order_index > checkpoint);
  if (!candidates.length)
    return {
      candidates: [] as Array<{ nodeId: string; preview: string; fromTrackId: string; suggestedTrackId: string; score: number }>,
      maxOrder: checkpoint
    };

  const tracks = getTrackMap(nodes);
  tracks.delete(parkingTrackId);
  const profiles = new Map<string, ReturnType<typeof getTrackProfile>>();
  for (const [trackId, trackNodes] of tracks.entries()) {
    profiles.set(trackId, getTrackProfile(trackNodes));
  }

  const result: Array<{ nodeId: string; preview: string; fromTrackId: string; suggestedTrackId: string; score: number }> = [];
  for (const node of candidates) {
    const currentTrackId = trackIdFromNode(node);
    if (currentTrackId === parkingTrackId) continue;
    const currentProfile = profiles.get(currentTrackId);
    if (!currentProfile) continue;

    const currentScore = scoreNodeForTrack(node, currentProfile, true);
    let bestTrackId = currentTrackId;
    let bestScore = currentScore;
    for (const [trackId, profile] of profiles.entries()) {
      if (trackId === currentTrackId) continue;
      const score = scoreNodeForTrack(node, profile);
      if (score > bestScore) {
        bestScore = score;
        bestTrackId = trackId;
      }
    }

    if (bestTrackId !== currentTrackId && bestScore >= ORGANIZE_MOVE_THRESHOLD && bestScore - currentScore >= ORGANIZE_MOVE_DELTA) {
      result.push({
        nodeId: node.id,
        preview: trackQuestionPreview(node.raw_question_text),
        fromTrackId: currentTrackId,
        suggestedTrackId: bestTrackId,
        score: Number(bestScore.toFixed(3))
      });
      continue;
    }
    const currentTrackNodes = tracks.get(currentTrackId) ?? [];
    if (currentScore < 0.18 && currentTrackNodes.length > 1) {
      result.push({
        nodeId: node.id,
        preview: trackQuestionPreview(node.raw_question_text),
        fromTrackId: currentTrackId,
        suggestedTrackId: "__new__",
        score: Number(currentScore.toFixed(3))
      });
    }
  }

  const maxOrder = Math.max(checkpoint, ...candidates.map((item) => item.order_index));
  return { candidates: result, maxOrder };
}

export function organizeSpacePreview(
  db: DbState,
  userId: string,
  spaceId: string,
  fromOrderIndex?: number
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;
  if (space.status !== "active") return { kind: "readonly" as const, candidates: [] as unknown[] };
  const preview = computeOrganizeCandidates(db, spaceId, fromOrderIndex);
  return {
    kind: "ok" as const,
    candidates: preview.candidates
  };
}

export function organizeSpaceApply(
  db: DbState,
  userId: string,
  spaceId: string,
  moves: Array<{ node_id: string; target_track_id: string }>,
  fromOrderIndex?: number
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;
  if (space.status !== "active") return { kind: "readonly" as const, moved_count: 0 };
  const meta = ensureMeta(db, spaceId);
  const parkingTrackId = getParkingTrackId(meta);
  const nodes = getSpaceNodes(db, spaceId);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const movedIds = new Set<string>();
  let movedCount = 0;
  for (const move of moves) {
    const node = nodeMap.get(move.node_id);
    if (!node) continue;
    const normalizedTarget = normalizeTrackId(move.target_track_id);
    const nextTrackId =
      normalizedTarget === "__new__" || !normalizedTarget ? createId() : normalizedTarget === parkingTrackId ? parkingTrackId : normalizedTarget;
    if (trackIdFromNode(node) === nextTrackId) continue;
    node.parent_node_id = toTrackParentId(nextTrackId);
    movedIds.add(node.id);
    movedCount += 1;
    if (nextTrackId !== parkingTrackId) meta.last_track_id = nextTrackId;
  }

  const preview = computeOrganizeCandidates(db, spaceId, fromOrderIndex);
  meta.last_organized_order = preview.maxOrder;
  if (movedCount > 0) {
    markSpaceActivity(space);
    bumpUserRevision(db, userId);
  }
  return { kind: "ok" as const, moved_count: movedCount, moved_node_ids: [...movedIds] };
}

export function rebuildSpace(db: DbState, userId: string, spaceId: string) {
  const preview = organizeSpacePreview(db, userId, spaceId);
  if (!preview) return null;
  if (preview.kind === "readonly") return { rebuilt: false as const, nodes_added: 0, moved_count: 0 };
  const applied = organizeSpaceApply(
    db,
    userId,
    spaceId,
    preview.candidates.map((item) => ({ node_id: item.nodeId, target_track_id: item.suggestedTrackId }))
  );
  if (!applied || applied.kind !== "ok") return { rebuilt: false as const, nodes_added: 0, moved_count: 0 };
  return { rebuilt: true as const, nodes_added: 0, moved_count: applied.moved_count };
}

export function getSpaceView(db: DbState, userId: string, spaceId: string) {
  const space = getSpaceForRead(db, userId, spaceId);
  if (!space) return null;

  const nodes = getSpaceNodes(db, spaceId);
  const meta = getMetaForRead(db, spaceId);
  const parkingTrackId = getParkingTrackId(meta);
  const pendingTrackId = getPendingTrackId(meta);
  const tracks = getTrackMap(nodes);
  if (!tracks.has(parkingTrackId)) tracks.set(parkingTrackId, []);
  if (pendingTrackId && pendingTrackId !== parkingTrackId && !tracks.has(pendingTrackId)) {
    tracks.set(pendingTrackId, []);
  }
  const echoes = new Map<string, Array<{ trackId: string; nodeId: string }>>();
  for (const node of nodes) {
    const key = echoKey(node.raw_question_text);
    if (!key) continue;
    const list = echoes.get(key);
    const entry = { trackId: trackIdFromNode(node), nodeId: node.id };
    if (list) list.push(entry);
    else echoes.set(key, [entry]);
  }

  const trackRows = [...tracks.entries()]
    .map(([trackId, trackNodes]) => ({
      trackId,
      firstOrder: trackNodes[0]?.order_index ?? Number.MAX_SAFE_INTEGER,
      title: trackId === parkingTrackId ? "先放这里" : trackNodes[0]?.raw_question_text ?? "新方向",
      isParking: trackId === parkingTrackId,
      isEmpty: trackId === pendingTrackId && trackNodes.length === 0,
      nodes: trackNodes
    }))
    .sort((a, b) => {
      if (a.trackId === parkingTrackId) return 1;
      if (b.trackId === parkingTrackId) return -1;
      return a.firstOrder - b.firstOrder;
    });

  const trackPayload = trackRows.map((track) => ({
    id: track.trackId,
    title_question_text: track.title,
    is_parking: track.isParking,
    is_empty: track.isEmpty,
    node_count: track.nodes.length,
    nodes: track.nodes.map((node) => {
      const key = echoKey(node.raw_question_text);
      const related = key ? (echoes.get(key) ?? []).filter((item) => item.trackId !== track.trackId) : [];
      const jump = related[0] ?? null;
      return {
        id: node.id,
        raw_question_text: node.raw_question_text,
        image_asset_id: node.image_asset_id ?? null,
        note_text: node.note_text ?? null,
        answer_text: node.answer_text ?? null,
        created_at: node.created_at,
        is_suggested: node.is_suggested,
        echo_track_id: jump?.trackId ?? null,
        echo_node_id: jump?.nodeId ?? null
      };
    })
  }));

  let currentTrackId: string | null = null;
  if (meta.last_track_id && tracks.has(meta.last_track_id)) currentTrackId = meta.last_track_id;
  if (!currentTrackId) currentTrackId = chooseFallbackTrackId(nodes);
  if (!currentTrackId) currentTrackId = trackRows.find((track) => track.trackId !== parkingTrackId)?.trackId ?? parkingTrackId;
  if (!meta.last_track_id && currentTrackId === parkingTrackId && trackRows.some((track) => track.trackId !== parkingTrackId)) {
    currentTrackId = trackRows.find((track) => track.trackId !== parkingTrackId)?.trackId ?? parkingTrackId;
  }
  const preferredReadableTrackId =
    trackRows.find(
      (track) => track.trackId !== parkingTrackId && track.trackId !== pendingTrackId && track.nodes.length > 0
    )?.trackId ?? null;
  const currentTrack = currentTrackId ? trackRows.find((track) => track.trackId === currentTrackId) : null;
  const currentIsPendingEmpty = Boolean(pendingTrackId && currentTrackId === pendingTrackId && (currentTrack?.nodes.length ?? 0) === 0);
  const currentIsNonParkingEmpty = Boolean(currentTrackId && currentTrackId !== parkingTrackId && (currentTrack?.nodes.length ?? 0) === 0);
  if (currentIsPendingEmpty || currentIsNonParkingEmpty) {
    const fallbackTrackId =
      preferredReadableTrackId ??
      trackRows.find((track) => track.trackId !== pendingTrackId && track.nodes.length > 0)?.trackId ??
      null;
    if (fallbackTrackId) {
      currentTrackId = fallbackTrackId;
      if (meta.last_track_id !== currentTrackId) meta.last_track_id = currentTrackId;
    }
  }

  const suggestionQuota = Math.max(0, 3 - (meta.suggestion_decay ?? 0));
  const suggestedQuestions = buildSuggestedQuestions(space.root_question_text, null, suggestionQuota);

  return {
    root: {
      ...space,
      last_activity_at: getSpaceLastActivity(space, nodes)
    },
    current_track_id: currentTrackId,
    tracks: trackPayload,
    suggested_questions: suggestedQuestions,
    background_text: meta.background_text ?? null,
    background_version: meta.background_version ?? 0,
    background_asset_ids: meta.background_asset_ids ?? [],
    background_selected_asset_id: meta.background_selected_asset_id ?? null,
    parking_track_id: parkingTrackId,
    pending_track_id: pendingTrackId,
    empty_track_ids: getEmptyTrackIds(meta)
  };
}

export function setActiveTrack(db: DbState, userId: string, spaceId: string, trackId: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  const meta = ensureMeta(db, spaceId);
  const nodes = getSpaceNodes(db, spaceId);
  const tracks = getTrackMap(nodes);
  const parkingTrackId = getParkingTrackId(meta);
  if (!trackId) {
    meta.last_track_id = null;
    markSpaceActivity(space);
    bumpUserRevision(db, userId);
    return { kind: "ok" as const, track_id: null };
  }
  const normalized = normalizeTrackId(trackId);
  if (!normalized || normalized === "__new__") return { kind: "track_not_found" as const };
  if (!tracks.has(normalized) && normalized !== parkingTrackId && getPendingTrackId(meta) !== normalized) {
    return { kind: "track_not_found" as const };
  }
  meta.last_track_id = normalized;
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, track_id: normalized };
}

export function createEmptyTrack(db: DbState, userId: string, spaceId: string, preferredTrackId?: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const nodes = getSpaceNodes(db, spaceId);
  const trackMap = getTrackMap(nodes);
  const existing = getPendingTrackId(meta);
  let clearedStalePending = false;
  if (existing) {
    if (trackMap.has(existing)) {
      removeEmptyTrackId(meta, existing);
      clearedStalePending = true;
    } else {
      meta.last_track_id = existing;
      return { kind: "ok" as const, track_id: existing };
    }
  }
  const preferred =
    typeof preferredTrackId === "string" && preferredTrackId.trim() ? normalizeTrackId(preferredTrackId) : null;
  const preferredExisting = preferred && preferred !== "__new__" && trackMap.has(preferred) ? preferred : null;
  if (preferredExisting) {
    const changed = clearedStalePending || meta.last_track_id !== preferredExisting;
    meta.last_track_id = preferredExisting;
    if (changed) {
      markSpaceActivity(space);
      bumpUserRevision(db, userId);
    }
    return { kind: "ok" as const, track_id: preferredExisting };
  }
  const trackId = preferred && preferred !== "__new__" ? preferred : createId();
  setPendingTrackId(meta, trackId);
  meta.last_track_id = trackId;
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, track_id: trackId };
}

export function updateTrackDirectionHint(
  db: DbState,
  userId: string,
  spaceId: string,
  trackId: string,
  _directionHint: string | null
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  const normalized = normalizeTrackId(trackId);
  if (!normalized || normalized === "__new__") return { kind: "track_not_found" as const };

  const nodes = getSpaceNodes(db, spaceId);
  const tracks = getTrackMap(nodes);
  const meta = ensureMeta(db, spaceId);
  const parkingTrackId = getParkingTrackId(meta);
  if (!tracks.has(normalized) && normalized !== parkingTrackId) return { kind: "track_not_found" as const };
  return { kind: "ok" as const, track_id: normalized, direction_hint: null };
}

export function updateSpaceBackground(
  db: DbState,
  userId: string,
  spaceId: string,
  backgroundText: string | null,
  options?: { backgroundAssetIds?: string[]; backgroundSelectedAssetId?: string | null }
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const previousBackgroundAssetIds = new Set(meta.background_asset_ids ?? []);
  const normalized = backgroundText ? collapseWhitespace(backgroundText) : "";
  if (!normalized) {
    if (meta.background_text !== null) {
      meta.background_text = null;
      meta.background_version = (meta.background_version ?? 0) + 1;
      markSpaceActivity(space);
      bumpUserRevision(db, userId);
    }
  } else {
    if (normalized.length < 100 || normalized.length > 300) return { kind: "invalid_length" as const };

    if (meta.background_text !== normalized) {
      meta.background_text = normalized;
      meta.background_version = (meta.background_version ?? 0) + 1;
      markSpaceActivity(space);
      bumpUserRevision(db, userId);
    }
  }
  if (options) {
    const nextIds = Array.isArray(options.backgroundAssetIds)
      ? options.backgroundAssetIds.filter((id) => typeof id === "string" && id.trim())
      : meta.background_asset_ids ?? [];
    for (const assetId of nextIds) {
      if (!requireMediaAsset(db, userId, assetId)) return { kind: "asset_not_found" as const };
    }
    const beforeIds = [...(meta.background_asset_ids ?? [])];
    const beforeSelected = meta.background_selected_asset_id ?? null;
    meta.background_asset_ids = nextIds;
    meta.background_selected_asset_id =
      typeof options.backgroundSelectedAssetId === "string" && nextIds.includes(options.backgroundSelectedAssetId)
        ? options.backgroundSelectedAssetId
        : nextIds[0] ?? null;
    const changed =
      beforeIds.length !== nextIds.length ||
      beforeIds.some((assetId, index) => assetId !== nextIds[index]) ||
      beforeSelected !== meta.background_selected_asset_id;
    for (const assetId of previousBackgroundAssetIds) {
      if (!nextIds.includes(assetId)) pruneUnusedMediaAsset(db, userId, assetId);
    }
    if (changed) {
      markSpaceActivity(space);
      bumpUserRevision(db, userId);
    }
  }
  return {
    kind: "ok" as const,
    background_text: meta.background_text,
    background_version: meta.background_version ?? 0,
    background_asset_ids: meta.background_asset_ids ?? [],
    background_selected_asset_id: meta.background_selected_asset_id ?? null
  };
}

export type StarMapStatePatch = {
  sceneSignature?: string | null;
  curatedScene?: Record<string, unknown> | null;
  curatedAt?: string | null;
  placementsSignature?: string | null;
  starPlacements?: Record<string, StarMapPlacementRecord> | null;
  placementsUpdatedAt?: string | null;
};

export function updateSpaceStarMapState(db: DbState, userId: string, spaceId: string, patch: StarMapStatePatch) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (!isSpaceActive(space)) return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const before = stableJson({
    sceneSignature: meta.star_map_scene_signature ?? null,
    curatedScene: meta.star_map_curated_scene ?? null,
    curatedAt: meta.star_map_curated_at ?? null,
    placementsSignature: meta.star_map_placements_signature ?? null,
    starPlacements: meta.star_map_star_placements ?? {},
    placementsUpdatedAt: meta.star_map_placements_updated_at ?? null
  });

  if (Object.prototype.hasOwnProperty.call(patch, "curatedScene")) {
    if (patch.curatedScene === null) {
      meta.star_map_curated_scene = null;
      meta.star_map_scene_signature = null;
      meta.star_map_curated_at = null;
    } else {
      const sceneSignature = typeof patch.sceneSignature === "string" && patch.sceneSignature.trim() ? patch.sceneSignature : null;
      if (!sceneSignature || !isPlainRecord(patch.curatedScene)) return { kind: "invalid_scene" as const };
      meta.star_map_curated_scene = patch.curatedScene;
      meta.star_map_scene_signature = sceneSignature;
      meta.star_map_curated_at = typeof patch.curatedAt === "string" && patch.curatedAt.trim() ? patch.curatedAt : nowIso();
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "starPlacements")) {
    const nextStarPlacements = patch.starPlacements ?? null;
    if (!nextStarPlacements || !Object.keys(nextStarPlacements).length) {
      meta.star_map_star_placements = {};
      meta.star_map_placements_signature = null;
      meta.star_map_placements_updated_at = null;
    } else {
      const placementsSignature =
        typeof patch.placementsSignature === "string" && patch.placementsSignature.trim() ? patch.placementsSignature : null;
      const placements = normalizeStarMapPlacements(nextStarPlacements);
      if (!placementsSignature || !Object.keys(placements).length) return { kind: "invalid_placements" as const };
      meta.star_map_star_placements = placements;
      meta.star_map_placements_signature = placementsSignature;
      meta.star_map_placements_updated_at =
        typeof patch.placementsUpdatedAt === "string" && patch.placementsUpdatedAt.trim()
          ? patch.placementsUpdatedAt
          : nowIso();
    }
  }

  const after = stableJson({
    sceneSignature: meta.star_map_scene_signature ?? null,
    curatedScene: meta.star_map_curated_scene ?? null,
    curatedAt: meta.star_map_curated_at ?? null,
    placementsSignature: meta.star_map_placements_signature ?? null,
    starPlacements: meta.star_map_star_placements ?? {},
    placementsUpdatedAt: meta.star_map_placements_updated_at ?? null
  });
  const changed = before !== after;
  if (changed) {
    markSpaceActivity(space);
    bumpUserRevision(db, userId);
  }

  return {
    kind: "ok" as const,
    changed,
    star_map_scene_signature: meta.star_map_scene_signature ?? null,
    star_map_curated_scene: meta.star_map_curated_scene ?? null,
    star_map_curated_at: meta.star_map_curated_at ?? null,
    star_map_star_placements: meta.star_map_star_placements ?? {},
    star_map_placements_signature: meta.star_map_placements_signature ?? null,
    star_map_placements_updated_at: meta.star_map_placements_updated_at ?? null
  };
}

export function updateSpaceRootQuestion(db: DbState, userId: string, spaceId: string, rootQuestionText: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };

  const normalized = collapseWhitespace(rootQuestionText);
  if (!normalized) return { kind: "invalid_empty" as const };
  if (normalized.length > 220) return { kind: "invalid_length" as const };
  if (space.root_question_text === normalized) {
    return { kind: "ok" as const, root_question_text: space.root_question_text, changed: false as const };
  }

  space.root_question_text = normalized;
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, root_question_text: space.root_question_text, changed: true as const };
}

export function moveNode(db: DbState, userId: string, nodeId: string, targetTrackId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return null;
  if (space.status !== "active") return { readonly: true as const };

  const normalizedTarget = normalizeTrackId(targetTrackId);
  const nextTrackId = normalizedTarget === "__new__" || !normalizedTarget ? createId() : normalizedTarget;
  if (trackIdFromNode(node) === nextTrackId) return { readonly: false as const, node, track_id: nextTrackId };
  const meta = ensureMeta(db, node.space_id);
  removeEmptyTrackId(meta, nextTrackId);
  node.parent_node_id = toTrackParentId(nextTrackId);
  node.order_index = maxOrderIndex(getSpaceNodes(db, node.space_id)) + 1;
  node.dimension = classifyDimension(node.raw_question_text);
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { readonly: false as const, node, track_id: nextTrackId };
}

export function updateNodeQuestion(db: DbState, userId: string, nodeId: string, rawQuestionText: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const normalized = normalizeQuestionInput(rawQuestionText, null);
  if (!normalized.ok) return { kind: "invalid" as const };

  node.raw_question_text = normalized.text;
  node.dimension = classifyDimension(normalized.text);
  db.thinking_node_links = db.thinking_node_links.filter((link) => link.source_node_id !== nodeId && link.target_node_id !== nodeId);
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, node };
}

export function copyNode(
  db: DbState,
  userId: string,
  nodeId: string,
  targetTrackId?: string | null,
  options?: { clientNodeId?: string | null; clientCreatedAt?: string | null }
) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const normalizedTarget = normalizeTrackId(targetTrackId);
  const nextTrackId =
    normalizedTarget === "__new__" || !normalizedTarget ? trackIdFromNode(node) : normalizedTarget;
  const meta = ensureMeta(db, node.space_id);
  removeEmptyTrackId(meta, nextTrackId);

  const nextNode: ThinkingNodeRecord = {
    id:
      typeof options?.clientNodeId === "string" && options.clientNodeId.trim() ? options.clientNodeId : createId(),
    space_id: node.space_id,
    parent_node_id: toTrackParentId(nextTrackId),
    raw_question_text: node.raw_question_text,
    note_text: node.note_text ?? null,
    answer_text: node.answer_text ?? null,
    image_asset_id: node.image_asset_id ?? null,
    created_at:
      typeof options?.clientCreatedAt === "string" && options.clientCreatedAt.trim() ? options.clientCreatedAt : nowIso(),
    order_index: maxOrderIndex(getSpaceNodes(db, node.space_id)) + 1,
    is_suggested: false,
    state: "normal",
    dimension: classifyDimension(node.raw_question_text)
  };
  db.thinking_nodes.push(nextNode);
  markSpaceActivity(space, nextNode.created_at);
  enforceMaxNodes(db, node.space_id);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, node: nextNode, track_id: nextTrackId };
}

export function markNodeMisplaced(db: DbState, userId: string, nodeId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return null;
  if (space.status !== "active") return { readonly: true as const };
  const meta = ensureMeta(db, node.space_id);
  const parkingTrackId = getParkingTrackId(meta);
  node.parent_node_id = toTrackParentId(parkingTrackId);
  node.dimension = classifyDimension(node.raw_question_text);
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { readonly: false as const, node, track_id: parkingTrackId };
}

export function deleteNode(db: DbState, userId: string, nodeId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };
  const previousAssetId = node.image_asset_id ?? null;

  db.thinking_nodes = db.thinking_nodes.filter((item) => item.id !== nodeId);
  db.thinking_node_links = db.thinking_node_links.filter((link) => link.source_node_id !== nodeId && link.target_node_id !== nodeId);
  const meta = ensureMeta(db, node.space_id);
  meta.milestone_node_ids = (meta.milestone_node_ids ?? []).filter((id) => id !== nodeId);
  const fallback = chooseFallbackTrackId(getSpaceNodes(db, node.space_id));
  if (!fallback) meta.last_track_id = null;
  else if (!meta.last_track_id || !getTrackMap(getSpaceNodes(db, node.space_id)).has(meta.last_track_id)) meta.last_track_id = fallback;
  if (previousAssetId) pruneUnusedMediaAsset(db, userId, previousAssetId);
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, space_id: node.space_id };
}

export function updateNodeAnswer(db: DbState, userId: string, nodeId: string, answerText: string | null) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const normalized = typeof answerText === "string" ? answerText.trim() : "";
  node.answer_text = normalized || null;
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, node };
}

export function linkThinkingNode(db: DbState, userId: string, nodeId: string, targetNodeIdInput: string) {
  const sourceNode = db.thinking_nodes.find((item) => item.id === nodeId);
  const targetNode = db.thinking_nodes.find((item) => item.id === targetNodeIdInput);
  if (!sourceNode || !targetNode) return { kind: "not_found" as const };
  if (sourceNode.space_id !== targetNode.space_id) return { kind: "invalid_target" as const };
  if (sourceNode.id === targetNode.id) return { kind: "invalid_target" as const };
  const space = requireSpace(db, userId, sourceNode.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const pair = [sourceNode.id, targetNode.id].sort();
  const sourceNodeId = pair[0];
  const targetNodeId = pair[1];
  const existed = db.thinking_node_links.find(
    (link) =>
      link.space_id === sourceNode.space_id &&
      link.source_node_id === sourceNodeId &&
      link.target_node_id === targetNodeId &&
      link.link_type === "related"
  );
  if (existed) return { kind: "ok" as const, link: existed };

  const score = textOverlapScore(tokenizeText(sourceNode.raw_question_text), tokenizeText(targetNode.raw_question_text));
  const link: ThinkingNodeLinkRecord = {
    id: createId(),
    space_id: sourceNode.space_id,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    link_type: "related",
    score: Number(score.toFixed(3)),
    created_at: nowIso()
  };
  db.thinking_node_links.push(link);
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, link };
}

export function setSpaceStatus(db: DbState, userId: string, spaceId: string, targetStatus: "active" | "hidden") {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };

  if (targetStatus === "hidden") {
    space.status = "hidden";
    markSpaceActivity(space);
    bumpUserRevision(db, userId);
    return { kind: "ok" as const, space };
  }

  if (space.status === "active") return { kind: "ok" as const, space };
  const activeCount = userSpaces(db, userId).filter((item) => isSpaceActive(item)).length;
  if (activeCount >= MAX_ACTIVE_SPACES) return { kind: "over_limit" as const };
  space.status = "active";
  space.frozen_at = null;
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, space };
}

export function deleteThinkingSpace(db: DbState, userId: string, spaceId: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };

  db.thinking_spaces = db.thinking_spaces.filter((item) => item.id !== spaceId);
  db.thinking_nodes = db.thinking_nodes.filter((item) => item.space_id !== spaceId);
  db.thinking_space_meta = db.thinking_space_meta.filter((item) => item.space_id !== spaceId);
  db.thinking_inbox = db.thinking_inbox.filter((item) => item.space_id !== spaceId);
  db.thinking_node_links = db.thinking_node_links.filter((item) => item.space_id !== spaceId);

  appendAuditLog(db, {
    userId,
    action: "delete_space",
    targetType: "thinking_space",
    targetId: spaceId,
    detail: `deleted space ${space.root_question_text.slice(0, 60)}`
  });
  for (const asset of listThinkingMediaAssets(db, userId)) {
    pruneUnusedMediaAsset(db, userId, asset.id);
  }
  bumpUserRevision(db, userId);
  return { kind: "ok" as const };
}

export function getThinkingSnapshot(db: DbState, userId: string): ThinkingSnapshot {
  const spaces = userSpaces(db, userId)
    .map((space) => ({
      ...space,
      status: normalizeSpaceStatus(space.status)
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const spaceIds = new Set(spaces.map((space) => space.id));
  const nodes = db.thinking_nodes
    .filter((node) => spaceIds.has(node.space_id))
    .sort((a, b) => a.order_index - b.order_index);
  const metas = db.thinking_space_meta
    .filter((meta) => spaceIds.has(meta.space_id))
    .map((meta) => sanitizeMeta(JSON.parse(JSON.stringify(meta)) as ThinkingSpaceMetaRecord));
  const inbox = db.thinking_inbox.filter((item) => spaceIds.has(item.space_id));

  const inboxMap: ThinkingSnapshot["inbox"] = {};
  for (const item of inbox) {
    if (!inboxMap[item.space_id]) inboxMap[item.space_id] = [];
    inboxMap[item.space_id].push({
      id: item.id,
      rawText: item.raw_text,
      createdAt: item.created_at
    });
  }
  for (const key of Object.keys(inboxMap)) {
    inboxMap[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  const scratch = userScratch(db, userId)
    .filter((item) => !item.deleted_at)
    .map((item) => ({
      id: item.id,
      userId: item.user_id,
      rawText: item.raw_text,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      archivedAt: item.archived_at,
      deletedAt: item.deleted_at,
      derivedSpaceId: item.derived_space_id,
      fedTimeDoubtId: item.fed_time_doubt_id
    }));

  return {
    spaces: spaces.map((space) => ({
      id: space.id,
      userId: space.user_id,
      rootQuestionText: space.root_question_text,
      status: normalizeSpaceStatus(space.status),
      createdAt: space.created_at,
      lastActivityAt: getSpaceLastActivity(space, nodes.filter((node) => node.space_id === space.id && node.state === "normal")),
      writtenToTimeAt: normalizeSpaceStatus(space.status) === "hidden" ? space.frozen_at : null,
      sourceTimeDoubtId: space.source_time_doubt_id
    })),
    nodes: nodes.map((node) => ({
      id: node.id,
      spaceId: node.space_id,
      parentNodeId: node.parent_node_id,
      rawQuestionText: node.raw_question_text,
      imageAssetId: node.image_asset_id ?? null,
      noteText: node.note_text ?? null,
      answerText: node.answer_text ?? null,
      createdAt: node.created_at,
      orderIndex: node.order_index,
      isSuggested: node.is_suggested,
      state: node.state,
      dimension: node.dimension
    })),
    spaceMeta: metas.map((meta) => ({
      spaceId: meta.space_id,
      exportVersion: meta.export_version,
      backgroundText: meta.background_text ?? null,
      backgroundVersion: meta.background_version ?? 0,
      backgroundAssetIds: meta.background_asset_ids ?? [],
      backgroundSelectedAssetId: meta.background_selected_asset_id ?? null,
      suggestionDecay: meta.suggestion_decay ?? 0,
      lastTrackId: meta.last_track_id ?? null,
      lastOrganizedOrder: meta.last_organized_order ?? -1,
      parkingTrackId: meta.parking_track_id ?? null,
      pendingTrackId: meta.pending_track_id ?? null,
      emptyTrackIds: meta.empty_track_ids ?? [],
      starMapSceneSignature: meta.star_map_scene_signature ?? null,
      starMapCuratedScene: meta.star_map_curated_scene ?? null,
      starMapCuratedAt: meta.star_map_curated_at ?? null,
      starMapStarPlacements: meta.star_map_star_placements ?? {},
      starMapPlacementsSignature: meta.star_map_placements_signature ?? null,
      starMapPlacementsUpdatedAt: meta.star_map_placements_updated_at ?? null
    })),
    mediaAssets: listThinkingMediaAssets(db, userId).map((asset) => ({
      id: asset.id,
      userId: asset.user_id,
      fileName: asset.file_name,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      createdAt: asset.created_at,
      uploadedAt: asset.uploaded_at,
      deletedAt: asset.deleted_at
    })),
    inbox: inboxMap,
    scratch,
    assistEnabled: true
  };
}

export function replaceThinkingSnapshot(db: DbState, userId: string, snapshot: ThinkingSnapshot) {
  const nextSpaces: ThinkingSpaceRecord[] = (snapshot.spaces ?? []).map((space) => {
    const status = normalizeSpaceStatus(space.status);
    const createdAt = typeof space.createdAt === "string" ? space.createdAt : nowIso();
    const explicitActivity =
      typeof (space as { lastActivityAt?: string | null }).lastActivityAt === "string"
        ? ((space as { lastActivityAt?: string | null }).lastActivityAt ?? null)
        : null;
    const writtenAt =
      typeof (space as { writtenToTimeAt?: string | null }).writtenToTimeAt === "string"
        ? ((space as { writtenToTimeAt?: string | null }).writtenToTimeAt ?? null)
        : typeof (space as { frozenAt?: string | null }).frozenAt === "string"
          ? ((space as { frozenAt?: string | null }).frozenAt ?? null)
          : null;
    return {
      id: typeof space.id === "string" ? space.id : createId(),
      user_id: userId,
      root_question_text: collapseWhitespace(space.rootQuestionText ?? ""),
      status,
      created_at: createdAt,
      frozen_at: status === "hidden" ? writtenAt : null,
      last_activity_at: explicitActivity ?? (status === "hidden" ? writtenAt : null) ?? createdAt,
      source_time_doubt_id: typeof space.sourceTimeDoubtId === "string" ? space.sourceTimeDoubtId : null
    };
  });
  const spaceIds = new Set(nextSpaces.map((space) => space.id));

  const nextNodes: ThinkingNodeRecord[] = (snapshot.nodes ?? [])
    .filter((node) => typeof node.spaceId === "string" && spaceIds.has(node.spaceId))
    .map((node) => ({
      id: typeof node.id === "string" ? node.id : createId(),
      space_id: node.spaceId,
      parent_node_id: typeof node.parentNodeId === "string" ? node.parentNodeId : null,
      raw_question_text: normalizeMultilineText(node.rawQuestionText ?? ""),
      image_asset_id: typeof node.imageAssetId === "string" && node.imageAssetId.trim() ? node.imageAssetId : null,
      note_text: typeof node.noteText === "string" ? collapseWhitespace(node.noteText) : null,
      answer_text: typeof node.answerText === "string" ? node.answerText.trim() || null : null,
      created_at: typeof node.createdAt === "string" ? node.createdAt : nowIso(),
      order_index: Number.isFinite(node.orderIndex) ? node.orderIndex : 0,
      is_suggested: Boolean(node.isSuggested),
      state: node.state === "hidden" ? ("hidden" as const) : ("normal" as const),
      dimension: node.dimension ?? "definition"
    }))
    .filter((node) => node.raw_question_text);
  const nextNodesBySpace = new Map<string, ThinkingNodeRecord[]>();
  for (const node of nextNodes) {
    const list = nextNodesBySpace.get(node.space_id);
    if (list) list.push(node);
    else nextNodesBySpace.set(node.space_id, [node]);
  }
  for (const space of nextSpaces) {
    space.last_activity_at = getSpaceLastActivity(space, nextNodesBySpace.get(space.id) ?? []);
  }

  const nextMeta: ThinkingSpaceMetaRecord[] = (snapshot.spaceMeta ?? [])
    .filter((meta) => typeof meta.spaceId === "string" && spaceIds.has(meta.spaceId))
    .map((meta) =>
      sanitizeMeta({
        space_id: meta.spaceId,
        user_freeze_note: null,
        export_version: Number.isFinite(meta.exportVersion) && meta.exportVersion > 0 ? meta.exportVersion : 1,
        background_text: typeof meta.backgroundText === "string" ? collapseWhitespace(meta.backgroundText) : null,
        background_version:
          typeof meta.backgroundVersion === "number" && Number.isFinite(meta.backgroundVersion) && meta.backgroundVersion >= 0
            ? meta.backgroundVersion
            : 0,
        background_asset_ids: Array.isArray(meta.backgroundAssetIds)
          ? meta.backgroundAssetIds.filter((id) => typeof id === "string" && id.trim())
          : [],
        background_selected_asset_id:
          typeof meta.backgroundSelectedAssetId === "string" && meta.backgroundSelectedAssetId.trim()
            ? meta.backgroundSelectedAssetId
            : null,
        suggestion_decay:
          typeof meta.suggestionDecay === "number" && Number.isFinite(meta.suggestionDecay) && meta.suggestionDecay >= 0
            ? meta.suggestionDecay
            : 0,
        last_track_id: typeof meta.lastTrackId === "string" ? meta.lastTrackId : null,
        last_organized_order:
          Number.isFinite(meta.lastOrganizedOrder) && typeof meta.lastOrganizedOrder === "number" ? meta.lastOrganizedOrder : -1,
        parking_track_id: typeof meta.parkingTrackId === "string" ? meta.parkingTrackId : null,
        pending_track_id: typeof meta.pendingTrackId === "string" ? meta.pendingTrackId : null,
        empty_track_ids: Array.isArray(meta.emptyTrackIds)
          ? meta.emptyTrackIds.filter((id) => typeof id === "string")
          : [],
        milestone_node_ids: [],
        track_direction_hints: {},
        star_map_scene_signature:
          typeof meta.starMapSceneSignature === "string" && meta.starMapSceneSignature.trim()
            ? meta.starMapSceneSignature
            : null,
        star_map_curated_scene: isPlainRecord(meta.starMapCuratedScene) ? meta.starMapCuratedScene : null,
        star_map_curated_at:
          typeof meta.starMapCuratedAt === "string" && meta.starMapCuratedAt.trim() ? meta.starMapCuratedAt : null,
        star_map_star_placements: normalizeStarMapPlacements(meta.starMapStarPlacements),
        star_map_placements_signature:
          typeof meta.starMapPlacementsSignature === "string" && meta.starMapPlacementsSignature.trim()
            ? meta.starMapPlacementsSignature
            : null,
        star_map_placements_updated_at:
          typeof meta.starMapPlacementsUpdatedAt === "string" && meta.starMapPlacementsUpdatedAt.trim()
            ? meta.starMapPlacementsUpdatedAt
            : null
      })
    );

  const rawInbox = snapshot.inbox ?? {};
  const nextInbox = Object.entries(rawInbox).flatMap(([spaceId, list]) => {
    if (!spaceIds.has(spaceId)) return [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : createId(),
        space_id: spaceId,
        raw_text: collapseWhitespace(item.rawText ?? ""),
        created_at: typeof item.createdAt === "string" ? item.createdAt : nowIso()
      }))
      .filter((item) => item.raw_text);
  });
  const nextScratch: ThinkingScratchRecord[] = (snapshot.scratch ?? [])
    .filter((item) => item && typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      user_id: userId,
      raw_text: collapseWhitespace(item.rawText ?? ""),
      created_at: typeof item.createdAt === "string" ? item.createdAt : nowIso(),
      updated_at: typeof item.updatedAt === "string" ? item.updatedAt : nowIso(),
      archived_at: typeof item.archivedAt === "string" ? item.archivedAt : null,
      deleted_at: typeof item.deletedAt === "string" ? item.deletedAt : null,
      derived_space_id: typeof item.derivedSpaceId === "string" ? item.derivedSpaceId : null,
      fed_time_doubt_id: typeof item.fedTimeDoubtId === "string" ? item.fedTimeDoubtId : null
    }))
    .filter((item) => item.raw_text);

  const nextMediaAssets: ThinkingMediaAssetRecord[] = (snapshot.mediaAssets ?? [])
    .filter((asset) => asset && typeof asset.id === "string" && typeof asset.userId === "string" && asset.userId === userId)
    .map((asset) => ({
      id: asset.id,
      user_id: userId,
      file_name: typeof asset.fileName === "string" ? asset.fileName : "image",
      mime_type: typeof asset.mimeType === "string" && asset.mimeType.trim() ? asset.mimeType : "application/octet-stream",
      byte_size: Number.isFinite(asset.byteSize) ? Math.max(0, Number(asset.byteSize)) : 0,
      sha256: typeof asset.sha256 === "string" ? asset.sha256 : "",
      width: asset.width === null || asset.width === undefined ? null : Number(asset.width),
      height: asset.height === null || asset.height === undefined ? null : Number(asset.height),
      created_at: typeof asset.createdAt === "string" ? asset.createdAt : nowIso(),
      uploaded_at: typeof asset.uploadedAt === "string" ? asset.uploadedAt : null,
      deleted_at: typeof asset.deletedAt === "string" ? asset.deletedAt : null
    }));

  const userSpaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  db.thinking_spaces = [...db.thinking_spaces.filter((space) => space.user_id !== userId), ...nextSpaces];
  db.thinking_nodes = [
    ...db.thinking_nodes.filter((node) => !userSpaceIds.has(node.space_id)),
    ...nextNodes.sort((a, b) => a.order_index - b.order_index)
  ];
  db.thinking_space_meta = [...db.thinking_space_meta.filter((meta) => !userSpaceIds.has(meta.space_id)), ...nextMeta];
  db.thinking_node_links = db.thinking_node_links.filter((link) => !userSpaceIds.has(link.space_id));
  db.thinking_inbox = [...db.thinking_inbox.filter((item) => !userSpaceIds.has(item.space_id)), ...nextInbox];
  db.thinking_scratch = [...db.thinking_scratch.filter((item) => item.user_id !== userId), ...nextScratch];
  db.thinking_media_assets = [...db.thinking_media_assets.filter((asset) => asset.user_id !== userId), ...nextMediaAssets];
  bumpUserRevision(db, userId);
}

export function exportSpace(db: DbState, userId: string, spaceId: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;

  const nodes = getSpaceNodes(db, spaceId);
  const meta = sanitizeMeta(db.thinking_space_meta.find((item) => item.space_id === spaceId) ?? ensureMeta(db, spaceId));
  const tracks = getTrackMap(nodes);
  const orderedTracks = [...tracks.entries()].sort(
    (a, b) => (a[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER) - (b[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER)
  );

  const lines: string[] = [];
  lines.push(`# ${space.root_question_text}`);
  lines.push("");
  lines.push(`- 创建时间：${formatDateTime(space.created_at)}`);
  lines.push("");
  const mediaAssetIds = new Set(listThinkingMediaAssets(db, userId).map((asset) => asset.id));

  orderedTracks.forEach(([, trackNodes], index) => {
    lines.push(`## 方向 ${index + 1}`);
    for (const node of trackNodes) {
      lines.push(`- ${node.raw_question_text}`);
      if (node.image_asset_id && mediaAssetIds.has(node.image_asset_id)) {
        lines.push(`  - 图片：${node.image_asset_id}`);
      }
      if (node.note_text) lines.push(`  - 附注：${node.note_text}`);
    }
    lines.push("");
  });

  if ((meta.background_asset_ids ?? []).length) {
    lines.push("## 空间图集");
    for (const assetId of meta.background_asset_ids ?? []) {
      if (!mediaAssetIds.has(assetId)) continue;
      lines.push(`- ${assetId}${meta.background_selected_asset_id === assetId ? "（当前选中）" : ""}`);
    }
    lines.push("");
  }

  return { markdown: lines.join("\n") };
}

export function deleteAllUserData(db: DbState, userId: string, reason: string) {
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) return null;

  const spaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  const doubtIds = new Set(db.doubts.filter((doubt) => doubt.user_id === userId).map((doubt) => doubt.id));

  const counts = {
    doubts: doubtIds.size,
    notes: db.doubt_notes.filter((note) => doubtIds.has(note.doubt_id)).length,
    spaces: spaceIds.size,
    nodes: db.thinking_nodes.filter((node) => spaceIds.has(node.space_id)).length,
    inbox: db.thinking_inbox.filter((item) => spaceIds.has(item.space_id)).length,
    links: db.thinking_node_links.filter((link) => spaceIds.has(link.space_id)).length,
    scratch: db.thinking_scratch.filter((item) => item.user_id === userId).length
  };

  db.doubt_notes = db.doubt_notes.filter((note) => !doubtIds.has(note.doubt_id));
  db.doubts = db.doubts.filter((doubt) => doubt.user_id !== userId);
  db.thinking_nodes = db.thinking_nodes.filter((node) => !spaceIds.has(node.space_id));
  db.thinking_inbox = db.thinking_inbox.filter((item) => !spaceIds.has(item.space_id));
  db.thinking_space_meta = db.thinking_space_meta.filter((meta) => !spaceIds.has(meta.space_id));
  db.thinking_node_links = db.thinking_node_links.filter((link) => !spaceIds.has(link.space_id));
  db.thinking_spaces = db.thinking_spaces.filter((space) => space.user_id !== userId);
  db.thinking_scratch = db.thinking_scratch.filter((item) => item.user_id !== userId);
  db.thinking_media_assets = db.thinking_media_assets.filter((item) => item.user_id !== userId);
  db.user_sync_state = db.user_sync_state.filter((item) => item.user_id !== userId);
  db.applied_client_mutations = db.applied_client_mutations.filter((item) => item.user_id !== userId);
  db.sync_operation_log = db.sync_operation_log.filter((item) => item.user_id !== userId);
  db.sync_repair_items = db.sync_repair_items.filter((item) => item.user_id !== userId);

  user.deleted_at = nowIso();
  appendAuditLog(db, {
    userId,
    action: "delete_all_data",
    targetType: "user",
    targetId: userId,
    detail: `reason=${reason}; doubts=${counts.doubts}; notes=${counts.notes}; spaces=${counts.spaces}; nodes=${counts.nodes}; inbox=${counts.inbox}; links=${counts.links}; scratch=${counts.scratch}`
  });

  return counts;
}
