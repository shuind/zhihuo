import type {
  DbState,
  DimensionKey,
  DoubtNoteRecord,
  DoubtRecord,
  ThinkingMediaAssetRecord,
  ThinkingNodeLinkRecord,
  ThinkingNodeRecord,
  ThinkingScratchRecord,
  ThinkingSnapshot,
  ThinkingSpaceMetaRecord,
  ThinkingSpaceRecord,
  UserSyncStateRecord,
  AppliedClientMutationRecord,
  SyncOperationLogRecord,
  SyncRepairItemRecord
} from "@/lib/server/types";
import {
  MAX_ACTIVE_SPACES,
  MAX_SPACE_NODES,
  buildSuggestedQuestions,
  classifyDimension,
  collapseWhitespace,
  createId,
  formatDateTime,
  normalizeQuestionInput,
  nowIso,
  textOverlapScore,
  tokenizeText
} from "@/lib/server/utils";

const TRACK_PREFIX = "track:";
const ORGANIZE_MOVE_THRESHOLD = 0.52;
const ORGANIZE_MOVE_DELTA = 0.16;
type LegacyTrackDirectionHint = "hypothesis" | "memory" | "counterpoint" | "worry" | "constraint" | "aside";

function isTrackDirectionHint(value: unknown): value is LegacyTrackDirectionHint {
  return (
    value === "hypothesis" ||
    value === "memory" ||
    value === "counterpoint" ||
    value === "worry" ||
    value === "constraint" ||
    value === "aside"
  );
}

function isTrackDirectionSetting(value: unknown): value is LegacyTrackDirectionHint | null {
  return value === null || isTrackDirectionHint(value);
}

function parseRange(range: string | null) {
  if (range === "week" || range === "month" || range === "all") return range;
  return "all";
}

function isWithinRange(iso: string, range: "week" | "month" | "all") {
  if (range === "all") return true;
  const now = Date.now();
  const span = range === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return now - new Date(iso).getTime() <= span;
}

function userDoubts(db: DbState, userId: string) {
  return db.doubts.filter((item) => item.user_id === userId);
}

function userSpaces(db: DbState, userId: string) {
  return db.thinking_spaces.filter((item) => item.user_id === userId);
}

function normalizeSpaceStatus(status: string | null | undefined): "active" | "hidden" {
  return status === "active" ? "active" : "hidden";
}

function isSpaceActive(space: ThinkingSpaceRecord) {
  return normalizeSpaceStatus(space.status) === "active";
}

function userScratch(db: DbState, userId: string) {
  return db.thinking_scratch.filter((item) => item.user_id === userId);
}

function requireUser(db: DbState, userId: string) {
  return db.users.find((item) => item.id === userId && !item.deleted_at) ?? null;
}

function ensureUserSyncState(db: DbState, userId: string): UserSyncStateRecord {
  const existing = db.user_sync_state.find((item) => item.user_id === userId);
  if (existing) return existing;
  const created: UserSyncStateRecord = {
    user_id: userId,
    revision: 0,
    last_sequence: 0,
    updated_at: nowIso()
  };
  db.user_sync_state.push(created);
  return created;
}

export function getUserRevision(db: DbState, userId: string) {
  return db.user_sync_state.find((item) => item.user_id === userId)?.revision ?? 0;
}

export function getUserLastSequence(db: DbState, userId: string) {
  return db.user_sync_state.find((item) => item.user_id === userId)?.last_sequence ?? 0;
}

export function bumpUserRevision(db: DbState, userId: string) {
  const state = ensureUserSyncState(db, userId);
  state.revision += 1;
  state.updated_at = nowIso();
  return state.revision;
}

export function appendSyncOperationLog(
  db: DbState,
  userId: string,
  input: {
    clientMutationId: string;
    deviceId: string;
    clientOrder: number;
    clientUpdatedAt?: string | null;
    op: string;
    payload?: Record<string, unknown> | null;
    appliedRevision: number;
  }
): SyncOperationLogRecord {
  const state = ensureUserSyncState(db, userId);
  state.last_sequence += 1;
  state.updated_at = nowIso();
  const record: SyncOperationLogRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: input.clientMutationId,
    device_id: input.deviceId,
    client_order: Number.isFinite(input.clientOrder) ? input.clientOrder : 0,
    client_updated_at: typeof input.clientUpdatedAt === "string" ? input.clientUpdatedAt : null,
    op: input.op,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    applied_revision: Number.isFinite(input.appliedRevision) ? input.appliedRevision : state.revision,
    server_sequence: state.last_sequence,
    created_at: nowIso()
  };
  db.sync_operation_log.push(record);
  return record;
}

export function recordSyncRepairItem(
  db: DbState,
  userId: string,
  input: {
    clientMutationId: string;
    op: string;
    payload?: Record<string, unknown> | null;
    reason: string;
    destinationClass?: string | null;
    originalTargetId?: string | null;
  }
): SyncRepairItemRecord {
  const existing = db.sync_repair_items.find(
    (item) => item.user_id === userId && item.client_mutation_id === input.clientMutationId && !item.resolved_at
  );
  if (existing) {
    existing.reason = input.reason;
    existing.destination_class = typeof input.destinationClass === "string" ? input.destinationClass : null;
    existing.original_target_id = typeof input.originalTargetId === "string" ? input.originalTargetId : null;
    existing.payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    return existing;
  }
  const repairItem: SyncRepairItemRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: input.clientMutationId,
    op: input.op,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    reason: input.reason,
    destination_class: typeof input.destinationClass === "string" ? input.destinationClass : null,
    original_target_id: typeof input.originalTargetId === "string" ? input.originalTargetId : null,
    created_at: nowIso(),
    resolved_at: null
  };
  db.sync_repair_items.push(repairItem);
  return repairItem;
}

export function listUserSyncRepairItems(db: DbState, userId: string) {
  return db.sync_repair_items
    .filter((item) => item.user_id === userId && !item.resolved_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function findAppliedClientMutation(db: DbState, userId: string, clientMutationId: string) {
  return (
    db.applied_client_mutations.find(
      (item) => item.user_id === userId && item.client_mutation_id === clientMutationId
    ) ?? null
  );
}

export function recordAppliedClientMutation(
  db: DbState,
  userId: string,
  clientMutationId: string,
  op: string,
  baseRevision: number,
  appliedRevision: number
): AppliedClientMutationRecord {
  const existing = findAppliedClientMutation(db, userId, clientMutationId);
  if (existing) return existing;
  const record: AppliedClientMutationRecord = {
    id: createId(),
    user_id: userId,
    client_mutation_id: clientMutationId,
    op,
    base_revision: Number.isFinite(baseRevision) ? baseRevision : 0,
    applied_revision: Number.isFinite(appliedRevision) ? appliedRevision : 0,
    created_at: nowIso()
  };
  db.applied_client_mutations.push(record);
  return record;
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

function requireDoubt(db: DbState, userId: string, doubtId: string) {
  return db.doubts.find((item) => item.id === doubtId && item.user_id === userId && !item.deleted_at) ?? null;
}

function requireSpace(db: DbState, userId: string, spaceId: string) {
  const space = db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
  if (!space) return null;
  space.status = normalizeSpaceStatus(space.status);
  return space;
}

function getSpaceForRead(db: DbState, userId: string, spaceId: string) {
  const space = db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
  if (!space) return null;
  return {
    ...space,
    status: normalizeSpaceStatus(space.status)
  };
}

function requireScratch(db: DbState, userId: string, scratchId: string) {
  return db.thinking_scratch.find((item) => item.id === scratchId && item.user_id === userId && !item.deleted_at) ?? null;
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

function sanitizeMeta(meta: ThinkingSpaceMetaRecord) {
  if (!Object.prototype.hasOwnProperty.call(meta, "background_text")) meta.background_text = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "background_version")) meta.background_version = 0;
  if (!Object.prototype.hasOwnProperty.call(meta, "background_asset_ids")) meta.background_asset_ids = [];
  if (!Object.prototype.hasOwnProperty.call(meta, "background_selected_asset_id")) meta.background_selected_asset_id = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "suggestion_decay")) meta.suggestion_decay = 0;
  if (!Object.prototype.hasOwnProperty.call(meta, "last_track_id")) meta.last_track_id = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "last_organized_order")) meta.last_organized_order = -1;
  if (!Object.prototype.hasOwnProperty.call(meta, "parking_track_id")) meta.parking_track_id = createId();
  if (!Object.prototype.hasOwnProperty.call(meta, "pending_track_id")) meta.pending_track_id = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "empty_track_ids")) meta.empty_track_ids = [];
  if (!Object.prototype.hasOwnProperty.call(meta, "milestone_node_ids")) meta.milestone_node_ids = [];
  if (!Object.prototype.hasOwnProperty.call(meta, "track_direction_hints")) meta.track_direction_hints = {};
  if (typeof meta.background_version !== "number" || !Number.isFinite(meta.background_version) || meta.background_version < 0) {
    meta.background_version = 0;
  }
  if (typeof meta.suggestion_decay !== "number" || !Number.isFinite(meta.suggestion_decay) || meta.suggestion_decay < 0) {
    meta.suggestion_decay = 0;
  }
  if (typeof meta.last_organized_order !== "number" || !Number.isFinite(meta.last_organized_order)) {
    meta.last_organized_order = -1;
  }
  if (typeof meta.parking_track_id !== "string" || !meta.parking_track_id.trim()) {
    meta.parking_track_id = createId();
  }
  if (typeof meta.pending_track_id !== "string" || !meta.pending_track_id.trim()) {
    meta.pending_track_id = null;
  }
  if (!Array.isArray(meta.empty_track_ids)) {
    meta.empty_track_ids = [];
  } else {
    meta.empty_track_ids = meta.empty_track_ids.filter((id) => typeof id === "string" && id.trim());
  }
  if (!Array.isArray(meta.background_asset_ids)) {
    meta.background_asset_ids = [];
  } else {
    meta.background_asset_ids = meta.background_asset_ids.filter((id) => typeof id === "string" && id.trim());
  }
  if (typeof meta.background_selected_asset_id !== "string" || !meta.background_selected_asset_id.trim()) {
    meta.background_selected_asset_id = null;
  } else if (!meta.background_asset_ids.includes(meta.background_selected_asset_id)) {
    meta.background_selected_asset_id = meta.background_asset_ids[0] ?? null;
  }
  if (!meta.pending_track_id && meta.empty_track_ids.length) {
    meta.pending_track_id = meta.empty_track_ids[0] ?? null;
  }
  meta.empty_track_ids = meta.pending_track_id ? [meta.pending_track_id] : [];
  if (!Array.isArray(meta.milestone_node_ids)) {
    meta.milestone_node_ids = [];
  } else {
    meta.milestone_node_ids = meta.milestone_node_ids.filter((id) => typeof id === "string").slice(0, 3);
  }
  if (!meta.track_direction_hints || typeof meta.track_direction_hints !== "object" || Array.isArray(meta.track_direction_hints)) {
    meta.track_direction_hints = {};
  } else {
    meta.track_direction_hints = Object.fromEntries(
      Object.entries(meta.track_direction_hints).filter(([trackId, hint]) => typeof trackId === "string" && isTrackDirectionSetting(hint))
    );
  }
  return meta;
}

function createDefaultMeta(spaceId: string) {
  return {
    space_id: spaceId,
    user_freeze_note: null,
    export_version: 1,
    background_text: null,
    background_version: 0,
    background_asset_ids: [],
    background_selected_asset_id: null,
    suggestion_decay: 0,
    last_track_id: null,
    last_organized_order: -1,
    parking_track_id: createId(),
    pending_track_id: null,
    empty_track_ids: [],
    milestone_node_ids: [],
    track_direction_hints: {}
  } satisfies ThinkingSpaceMetaRecord;
}

function ensureMeta(db: DbState, spaceId: string) {
  const existing = db.thinking_space_meta.find((meta) => meta.space_id === spaceId);
  if (existing) return sanitizeMeta(existing);
  const next = createDefaultMeta(spaceId);
  db.thinking_space_meta.push(next);
  return next;
}

function getMetaForRead(db: DbState, spaceId: string) {
  const existing = db.thinking_space_meta.find((meta) => meta.space_id === spaceId);
  if (!existing) return createDefaultMeta(spaceId);
  return sanitizeMeta(JSON.parse(JSON.stringify(existing)) as ThinkingSpaceMetaRecord);
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

function getTrackDirectionHints(meta: ThinkingSpaceMetaRecord) {
  sanitizeMeta(meta);
  return meta.track_direction_hints ?? {};
}

export function listThinkingMediaAssets(db: DbState, userId: string) {
  return db.thinking_media_assets.filter((asset) => asset.user_id === userId && !asset.deleted_at);
}

function requireMediaAsset(db: DbState, userId: string, assetId: string) {
  return db.thinking_media_assets.find((asset) => asset.id === assetId && asset.user_id === userId && !asset.deleted_at) ?? null;
}

function getMediaAssetReferenceCount(db: DbState, userId: string, assetId: string) {
  let count = 0;
  const userSpaceIds = new Set(userSpaces(db, userId).map((space) => space.id));
  for (const node of db.thinking_nodes) {
    if (!userSpaceIds.has(node.space_id)) continue;
    if (node.image_asset_id === assetId) count += 1;
  }
  for (const meta of db.thinking_space_meta) {
    if (!userSpaceIds.has(meta.space_id)) continue;
    if ((meta.background_asset_ids ?? []).includes(assetId)) count += 1;
    if (meta.background_selected_asset_id === assetId) count += 1;
  }
  return count;
}

function pruneUnusedMediaAsset(db: DbState, userId: string, assetId: string) {
  if (!assetId) return false;
  if (getMediaAssetReferenceCount(db, userId, assetId) > 0) return false;
  const existing = db.thinking_media_assets.find((asset) => asset.id === assetId && asset.user_id === userId);
  if (!existing) return false;
  existing.deleted_at = nowIso();
  return true;
}

export function upsertThinkingMediaAsset(
  db: DbState,
  userId: string,
  asset: {
    id: string;
    file_name: string;
    mime_type: string;
    byte_size: number;
    sha256: string;
    width: number | null;
    height: number | null;
    created_at?: string;
    uploaded_at?: string | null;
    deleted_at?: string | null;
  }
) {
  const existing = db.thinking_media_assets.find((item) => item.id === asset.id && item.user_id === userId);
  if (existing) {
    existing.file_name = asset.file_name;
    existing.mime_type = asset.mime_type;
    existing.byte_size = Number.isFinite(asset.byte_size) ? Math.max(0, Number(asset.byte_size)) : 0;
    existing.sha256 = asset.sha256;
    existing.width = asset.width;
    existing.height = asset.height;
    existing.deleted_at = asset.deleted_at ?? null;
    existing.uploaded_at = asset.uploaded_at ?? existing.uploaded_at;
    return existing;
  }
  const record: ThinkingMediaAssetRecord = {
    id: asset.id,
    user_id: userId,
    file_name: asset.file_name,
    mime_type: asset.mime_type,
    byte_size: Number.isFinite(asset.byte_size) ? Math.max(0, Number(asset.byte_size)) : 0,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    created_at: asset.created_at ?? nowIso(),
    uploaded_at: asset.uploaded_at ?? null,
    deleted_at: asset.deleted_at ?? null
  };
  db.thinking_media_assets.unshift(record);
  return record;
}

export function setNodeImageAsset(db: DbState, userId: string, nodeId: string, assetId: string | null) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const nextAssetId = typeof assetId === "string" && assetId.trim() ? assetId : null;
  if (nextAssetId && !requireMediaAsset(db, userId, nextAssetId)) {
    return { kind: "asset_not_found" as const };
  }

  const previousAssetId = node.image_asset_id ?? null;
  if (previousAssetId === nextAssetId) return { kind: "ok" as const, node };

  node.image_asset_id = nextAssetId;
  if (previousAssetId) pruneUnusedMediaAsset(db, userId, previousAssetId);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, node };
}

export function setSpaceBackgroundAssets(
  db: DbState,
  userId: string,
  spaceId: string,
  backgroundAssetIds: string[],
  backgroundSelectedAssetId: string | null
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };
  const meta = ensureMeta(db, spaceId);
  const nextIds = backgroundAssetIds.filter((id) => typeof id === "string" && id.trim());
  for (const assetId of nextIds) {
    if (!requireMediaAsset(db, userId, assetId)) return { kind: "asset_not_found" as const };
  }
  meta.background_asset_ids = nextIds;
  meta.background_selected_asset_id = nextIds.includes(backgroundSelectedAssetId ?? "") ? (backgroundSelectedAssetId ?? null) : nextIds[0] ?? null;
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, background_asset_ids: meta.background_asset_ids, background_selected_asset_id: meta.background_selected_asset_id };
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

function appendAuditLog(
  db: DbState,
  payload: { userId: string; action: string; targetType: string; targetId: string; detail: string }
) {
  db.audit_logs.push({
    id: createId(),
    user_id: payload.userId,
    action: payload.action,
    target_type: payload.targetType,
    target_id: payload.targetId,
    detail: payload.detail,
    created_at: nowIso()
  });
}

function toTimestamp(value: string | null | undefined) {
  if (typeof value !== "string" || !value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toDateKeyInTimeZone(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type SystemMonitorMetrics = {
  users: {
    total: number;
    new_today: number;
  };
  active_users: {
    d1: number;
    d3: number;
  };
  content: {
    time_entries_total: number;
    spaces_total: number;
    spaces_settled: number;
    thought_items_total: number;
    scratch_open_total: number;
  };
  flow_3d: Array<{
    date: string;
    users_new: number;
    time_entries_new: number;
    spaces_new: number;
    writes_to_time: number;
  }>;
  generated_at: string;
};

export function getSystemMonitorMetrics(db: DbState): SystemMonitorMetrics {
  const now = Date.now();
  const monitorTimeZone = "Asia/Shanghai";
  const todayKey = toDateKeyInTimeZone(now, monitorTimeZone);
  const trendKeys = [shiftDateKey(todayKey, -2), shiftDateKey(todayKey, -1), todayKey];
  const trendKeySet = new Set(trendKeys);
  const start3dKey = trendKeys[0];

  const activeUsers = db.users.filter((user) => !user.deleted_at);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));

  const doubts = db.doubts.filter((item) => !item.deleted_at && activeUserIds.has(item.user_id));
  const spaces = db.thinking_spaces.filter((item) => activeUserIds.has(item.user_id));
  const spaceIds = new Set(spaces.map((space) => space.id));
  const spaceUserById = new Map(spaces.map((space) => [space.id, space.user_id]));
  const nodes = db.thinking_nodes.filter((node) => spaceIds.has(node.space_id));
  const thoughtItems = nodes.filter((node) => node.state === "normal");
  const scratchEvents = db.thinking_scratch.filter((item) => !item.deleted_at && activeUserIds.has(item.user_id));
  const scratchOpen = scratchEvents.filter((item) => !item.archived_at && !item.derived_space_id && !item.fed_time_doubt_id);
  const audits = db.audit_logs.filter((item) => activeUserIds.has(item.user_id));

  const countOnDate = <T>(items: T[], dateSelector: (item: T) => string | null | undefined, targetDateKey: string) => {
    let count = 0;
    for (const item of items) {
      const timestamp = toTimestamp(dateSelector(item));
      if (timestamp === null) continue;
      if (toDateKeyInTimeZone(timestamp, monitorTimeZone) === targetDateKey) count += 1;
    }
    return count;
  };

  const activeD1 = new Set<string>();
  const activeD3 = new Set<string>();
  const markActive = (userId: string, at: string | null | undefined) => {
    const timestamp = toTimestamp(at);
    if (timestamp === null) return;
    const dateKey = toDateKeyInTimeZone(timestamp, monitorTimeZone);
    if (dateKey === todayKey) activeD1.add(userId);
    if (dateKey >= start3dKey && dateKey <= todayKey) activeD3.add(userId);
  };

  for (const item of doubts) markActive(item.user_id, item.created_at);
  for (const item of spaces) markActive(item.user_id, item.created_at);
  for (const item of nodes) {
    const userId = spaceUserById.get(item.space_id);
    if (!userId) continue;
    markActive(userId, item.created_at);
  }
  for (const item of scratchEvents) markActive(item.user_id, item.updated_at || item.created_at);
  for (const item of audits) markActive(item.user_id, item.created_at);

  const trends = new Map<
    string,
    { date: string; users_new: number; time_entries_new: number; spaces_new: number; writes_to_time: number }
  >();
  for (const dateKey of trendKeys) {
    trends.set(dateKey, { date: dateKey, users_new: 0, time_entries_new: 0, spaces_new: 0, writes_to_time: 0 });
  }

  const appendTrend = (
    at: string | null | undefined,
    field: "users_new" | "time_entries_new" | "spaces_new" | "writes_to_time"
  ) => {
    const timestamp = toTimestamp(at);
    if (timestamp === null) return;
    const key = toDateKeyInTimeZone(timestamp, monitorTimeZone);
    if (!trendKeySet.has(key)) return;
    const row = trends.get(key);
    if (!row) return;
    row[field] += 1;
  };

  for (const user of activeUsers) appendTrend(user.created_at, "users_new");
  for (const doubt of doubts) appendTrend(doubt.created_at, "time_entries_new");
  for (const space of spaces) appendTrend(space.created_at, "spaces_new");
  for (const space of spaces) appendTrend(space.frozen_at, "writes_to_time");
  const spacesSettled = spaces.filter((space) => typeof space.frozen_at === "string" && space.frozen_at.length > 0).length;

  return {
    users: {
      total: activeUsers.length,
      new_today: countOnDate(activeUsers, (item) => item.created_at, todayKey)
    },
    active_users: {
      d1: activeD1.size,
      d3: activeD3.size
    },
    content: {
      time_entries_total: doubts.length,
      spaces_total: spaces.length,
      spaces_settled: spacesSettled,
      thought_items_total: thoughtItems.length,
      scratch_open_total: scratchOpen.length
    },
    flow_3d: trendKeys.map((dateKey) => trends.get(dateKey)!),
    generated_at: nowIso()
  };
}

export function listDoubts(db: DbState, userId: string, query: { range: string | null; includeArchived: boolean }) {
  const range = parseRange(query.range);
  return userDoubts(db, userId)
    .filter((item) => !item.deleted_at)
    .filter((item) => isWithinRange(item.created_at, range))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function createDoubt(
  db: DbState,
  userId: string,
  rawText: string,
  options?: { clientEntityId?: string | null; clientUpdatedAt?: string | null }
) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  return createDoubtAt(db, userId, normalized, options?.clientUpdatedAt ?? nowIso(), {
    clientEntityId: options?.clientEntityId ?? null
  });
}

export function createDoubtAt(
  db: DbState,
  userId: string,
  rawText: string,
  createdAt: string,
  options?: { clientEntityId?: string | null }
) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  const preferredId = typeof options?.clientEntityId === "string" && options.clientEntityId.trim() ? options.clientEntityId : null;
  if (preferredId) {
    const existed = db.doubts.find((item) => item.id === preferredId && item.user_id === userId && !item.deleted_at);
    if (existed) return existed;
  }
  const item: DoubtRecord = {
    id: preferredId ?? createId(),
    user_id: userId,
    raw_text: normalized,
    first_node_preview: null,
    last_node_preview: null,
    created_at: createdAt,
    archived_at: null,
    deleted_at: null
  };
  db.doubts.unshift(item);
  bumpUserRevision(db, userId);
  return item;
}

export function getDoubtDetail(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const notes = db.doubt_notes
    .filter((note) => note.doubt_id === doubtId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return { doubt, notes };
}

export function replaceLifeSnapshot(
  db: DbState,
  userId: string,
  snapshot: {
    doubts?: Array<{
      id?: string;
      raw_text?: string;
      first_node_preview?: string | null;
      last_node_preview?: string | null;
      created_at?: string;
      archived_at?: string | null;
      deleted_at?: string | null;
    }>;
    notes?: Array<{
      id?: string;
      doubt_id?: string;
      note_text?: string;
      created_at?: string;
    }>;
  }
) {
  const nextDoubts: DoubtRecord[] = (snapshot.doubts ?? [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      user_id: userId,
      raw_text: collapseWhitespace(item.raw_text ?? ""),
      first_node_preview:
        typeof item.first_node_preview === "string" ? collapseWhitespace(item.first_node_preview) || null : null,
      last_node_preview:
        typeof item.last_node_preview === "string" ? collapseWhitespace(item.last_node_preview) || null : null,
      created_at: typeof item.created_at === "string" ? item.created_at : nowIso(),
      archived_at: typeof item.archived_at === "string" ? item.archived_at : null,
      deleted_at: typeof item.deleted_at === "string" ? item.deleted_at : null
    }))
    .filter((item) => item.raw_text);

  const doubtIds = new Set(nextDoubts.map((item) => item.id));
  const nextNotes: DoubtNoteRecord[] = (snapshot.notes ?? [])
    .filter((item) => typeof item.doubt_id === "string" && doubtIds.has(item.doubt_id))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      doubt_id: item.doubt_id as string,
      note_text: collapseWhitespace(item.note_text ?? "").slice(0, 42),
      created_at: typeof item.created_at === "string" ? item.created_at : nowIso()
    }))
    .filter((item) => item.note_text);

  db.doubts = [...db.doubts.filter((item) => item.user_id !== userId), ...nextDoubts];
  db.doubt_notes = [
    ...db.doubt_notes.filter((item) => {
      const parent = db.doubts.find((doubt) => doubt.id === item.doubt_id);
      return parent?.user_id !== userId;
    }),
    ...nextNotes
  ];
  bumpUserRevision(db, userId);
}

export function archiveDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  doubt.archived_at = doubt.archived_at ? null : nowIso();
  bumpUserRevision(db, userId);
  return doubt;
}

export function ensureDoubtArchived(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return { kind: "not_found" as const };
  if (doubt.archived_at) return { kind: "ok" as const, doubt, changed: false as const };
  doubt.archived_at = nowIso();
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, doubt, changed: true as const };
}

export function deleteDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return false;
  doubt.deleted_at = nowIso();
  db.doubt_notes = db.doubt_notes.filter((note) => note.doubt_id !== doubtId);
  appendAuditLog(db, {
    userId,
    action: "delete_doubt",
    targetType: "doubt",
    targetId: doubtId,
    detail: "deleted doubt and derived structures"
  });

  const deletingSpaces = new Set(db.thinking_spaces.filter((space) => space.source_time_doubt_id === doubtId).map((space) => space.id));
  if (deletingSpaces.size) {
    db.thinking_spaces = db.thinking_spaces.filter((space) => !deletingSpaces.has(space.id));
    db.thinking_nodes = db.thinking_nodes.filter((node) => !deletingSpaces.has(node.space_id));
    db.thinking_space_meta = db.thinking_space_meta.filter((meta) => !deletingSpaces.has(meta.space_id));
    db.thinking_inbox = db.thinking_inbox.filter((item) => !deletingSpaces.has(item.space_id));
    db.thinking_node_links = db.thinking_node_links.filter((link) => !deletingSpaces.has(link.space_id));
  }
  bumpUserRevision(db, userId);
  return true;
}

export function upsertDoubtNote(db: DbState, userId: string, doubtId: string, noteText: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const normalized = collapseWhitespace(noteText).slice(0, 42);
  const existing = db.doubt_notes.find((item) => item.doubt_id === doubtId);
  if (!normalized) {
    db.doubt_notes = db.doubt_notes.filter((item) => item.doubt_id !== doubtId);
    bumpUserRevision(db, userId);
    return { deleted: true as const };
  }
  if (existing) {
    existing.note_text = normalized;
    existing.created_at = nowIso();
    bumpUserRevision(db, userId);
    return { deleted: false as const, note: existing };
  }
  const note: DoubtNoteRecord = { id: createId(), doubt_id: doubtId, note_text: normalized, created_at: nowIso() };
  db.doubt_notes.push(note);
  bumpUserRevision(db, userId);
  return { deleted: false as const, note };
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
      const meta = spaceMeta.find((item) => item.space_id === space.id);
      const nodes = nodesBySpace.get(space.id) ?? [];
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const tracks = getTrackMap(nodes);
      const currentTrackId =
        (meta?.last_track_id && tracks.has(meta.last_track_id) ? meta.last_track_id : null) ??
        chooseFallbackTrackId(nodes) ??
        null;
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
      bumpUserRevision(db, userId);
    }
    return { over_limit: false as const, space: existing, restored: true as const };
  }
  return createThinkingSpace(db, userId, doubt.raw_text, doubt.id);
}

function getSpaceLastActivity(space: ThinkingSpaceRecord, nodes: ThinkingNodeRecord[]) {
  let latest = new Date(space.created_at).getTime();
  if (space.frozen_at) latest = Math.max(latest, new Date(space.frozen_at).getTime());
  for (const node of nodes) {
    latest = Math.max(latest, new Date(node.created_at).getTime());
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
  options?: { preserveOriginalTime?: boolean; clientDoubtId?: string | null }
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
  if (doubt) {
    doubt.raw_text = space.root_question_text;
    doubt.first_node_preview = edgePreview.firstNode;
    doubt.last_node_preview = edgePreview.lastNode;
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
    space.source_time_doubt_id = doubt.id;
  }

  space.status = "hidden";
  space.frozen_at = writtenAt;
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
  if (movedCount > 0) bumpUserRevision(db, userId);
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
    bumpUserRevision(db, userId);
    return { kind: "ok" as const, track_id: null };
  }
  const normalized = normalizeTrackId(trackId);
  if (!normalized || normalized === "__new__") return { kind: "track_not_found" as const };
  if (!tracks.has(normalized) && normalized !== parkingTrackId && getPendingTrackId(meta) !== normalized) {
    return { kind: "track_not_found" as const };
  }
  meta.last_track_id = normalized;
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, track_id: normalized };
}

export function createEmptyTrack(db: DbState, userId: string, spaceId: string, preferredTrackId?: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const existing = getPendingTrackId(meta);
  if (existing) {
    meta.last_track_id = existing;
    return { kind: "ok" as const, track_id: existing };
  }
  const trackId =
    typeof preferredTrackId === "string" && preferredTrackId.trim() ? preferredTrackId : createId();
  setPendingTrackId(meta, trackId);
  meta.last_track_id = trackId;
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
      bumpUserRevision(db, userId);
    }
  } else {
    if (normalized.length < 100 || normalized.length > 300) return { kind: "invalid_length" as const };

    if (meta.background_text !== normalized) {
      meta.background_text = normalized;
      meta.background_version = (meta.background_version ?? 0) + 1;
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
    if (changed) bumpUserRevision(db, userId);
  }
  return {
    kind: "ok" as const,
    background_text: meta.background_text,
    background_version: meta.background_version ?? 0,
    background_asset_ids: meta.background_asset_ids ?? [],
    background_selected_asset_id: meta.background_selected_asset_id ?? null
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
  bumpUserRevision(db, userId);
  return { readonly: false as const, node, track_id: nextTrackId };
}

export function updateNodeQuestion(db: DbState, userId: string, nodeId: string, rawQuestionText: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, node.space_id);
  const normalized = normalizeQuestionInput(rawQuestionText, null);
  if (!normalized.ok) return { kind: "invalid" as const };

  node.raw_question_text = normalized.text;
  node.dimension = classifyDimension(normalized.text);
  db.thinking_node_links = db.thinking_node_links.filter((link) => link.source_node_id !== nodeId && link.target_node_id !== nodeId);
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
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, link };
}

export function setSpaceStatus(db: DbState, userId: string, spaceId: string, targetStatus: "active" | "hidden") {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };

  if (targetStatus === "hidden") {
    space.status = "hidden";
    bumpUserRevision(db, userId);
    return { kind: "ok" as const, space };
  }

  if (space.status === "active") return { kind: "ok" as const, space };
  const activeCount = userSpaces(db, userId).filter((item) => isSpaceActive(item)).length;
  if (activeCount >= MAX_ACTIVE_SPACES) return { kind: "over_limit" as const };
  space.status = "active";
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
      writtenToTimeAt: space.frozen_at,
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
      emptyTrackIds: meta.empty_track_ids ?? []
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
  const nextSpaces: ThinkingSpaceRecord[] = (snapshot.spaces ?? []).map((space) => ({
    id: typeof space.id === "string" ? space.id : createId(),
    user_id: userId,
    root_question_text: collapseWhitespace(space.rootQuestionText ?? ""),
    status: normalizeSpaceStatus(space.status),
    created_at: typeof space.createdAt === "string" ? space.createdAt : nowIso(),
    frozen_at:
      typeof (space as { writtenToTimeAt?: string | null }).writtenToTimeAt === "string"
        ? (space as { writtenToTimeAt?: string | null }).writtenToTimeAt ?? null
        : typeof (space as { frozenAt?: string | null }).frozenAt === "string"
          ? (space as { frozenAt?: string | null }).frozenAt ?? null
          : null,
    source_time_doubt_id: typeof space.sourceTimeDoubtId === "string" ? space.sourceTimeDoubtId : null
  }));
  const spaceIds = new Set(nextSpaces.map((space) => space.id));

  const nextNodes: ThinkingNodeRecord[] = (snapshot.nodes ?? [])
    .filter((node) => typeof node.spaceId === "string" && spaceIds.has(node.spaceId))
    .map((node) => ({
      id: typeof node.id === "string" ? node.id : createId(),
      space_id: node.spaceId,
      parent_node_id: typeof node.parentNodeId === "string" ? node.parentNodeId : null,
      raw_question_text: collapseWhitespace(node.rawQuestionText ?? ""),
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
        track_direction_hints: {}
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

  orderedTracks.forEach(([trackId, trackNodes], index) => {
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


