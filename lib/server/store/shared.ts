import type {
  DbState,
  StarMapPlacementRecord,
  ThinkingSpaceMetaRecord,
  ThinkingSpaceRecord
} from "@/lib/server/types";
import { createId, nowIso } from "@/lib/server/utils";

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

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeStarMapPlacements(value: unknown): Record<string, StarMapPlacementRecord> {
  if (!isPlainRecord(value)) return {};
  const placements: Record<string, StarMapPlacementRecord> = {};
  for (const [starId, rawPlacement] of Object.entries(value)) {
    if (!starId || !isPlainRecord(rawPlacement)) continue;
    const ring = Number(rawPlacement.ring);
    if (ring !== 1 && ring !== 2 && ring !== 3 && ring !== 4) continue;
    const angle = Number(rawPlacement.angle);
    const drift = Number(rawPlacement.drift);
    placements[starId] = {
      ring,
      angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0,
      drift: Number.isFinite(drift) ? Math.max(-2, Math.min(2, drift)) : 0
    };
  }
  return placements;
}

export function normalizeLetterLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function userDoubts(db: DbState, userId: string) {
  return db.doubts.filter((item) => item.user_id === userId);
}

export function userSpaces(db: DbState, userId: string) {
  return db.thinking_spaces.filter((item) => item.user_id === userId);
}

export function normalizeSpaceStatus(status: string | null | undefined): "active" | "hidden" {
  return status === "active" ? "active" : "hidden";
}

export function isSpaceActive(space: ThinkingSpaceRecord) {
  return normalizeSpaceStatus(space.status) === "active";
}

export function userScratch(db: DbState, userId: string) {
  return db.thinking_scratch.filter((item) => item.user_id === userId);
}

export function requireUser(db: DbState, userId: string) {
  return db.users.find((item) => item.id === userId && !item.deleted_at) ?? null;
}

export function requireDoubt(db: DbState, userId: string, doubtId: string) {
  return db.doubts.find((item) => item.id === doubtId && item.user_id === userId && !item.deleted_at) ?? null;
}

export function requireSpace(db: DbState, userId: string, spaceId: string) {
  const space = db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
  if (!space) return null;
  space.status = normalizeSpaceStatus(space.status);
  if (typeof space.last_activity_at !== "string" || !space.last_activity_at.trim()) {
    space.last_activity_at = space.created_at;
  }
  return space;
}

export function getSpaceForRead(db: DbState, userId: string, spaceId: string) {
  const space = db.thinking_spaces.find((item) => item.id === spaceId && item.user_id === userId) ?? null;
  if (!space) return null;
  return {
    ...space,
    status: normalizeSpaceStatus(space.status),
    last_activity_at:
      typeof space.last_activity_at === "string" && space.last_activity_at.trim() ? space.last_activity_at : space.created_at
  };
}

export function markSpaceActivity(space: ThinkingSpaceRecord, at?: string | null) {
  const next = typeof at === "string" && at.trim() ? at : nowIso();
  const current = typeof space.last_activity_at === "string" && space.last_activity_at.trim() ? space.last_activity_at : space.created_at;
  const currentTime = new Date(current).getTime();
  const nextTime = new Date(next).getTime();
  if (!Number.isFinite(currentTime) || (Number.isFinite(nextTime) && nextTime > currentTime)) {
    space.last_activity_at = next;
  }
}

export function requireScratch(db: DbState, userId: string, scratchId: string) {
  return db.thinking_scratch.find((item) => item.id === scratchId && item.user_id === userId && !item.deleted_at) ?? null;
}

export function sanitizeMeta(meta: ThinkingSpaceMetaRecord) {
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
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_scene_signature")) meta.star_map_scene_signature = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_curated_scene")) meta.star_map_curated_scene = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_curated_at")) meta.star_map_curated_at = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_star_placements")) meta.star_map_star_placements = {};
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_placements_signature")) meta.star_map_placements_signature = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "star_map_placements_updated_at")) meta.star_map_placements_updated_at = null;
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
  if (typeof meta.star_map_scene_signature !== "string" || !meta.star_map_scene_signature.trim()) {
    meta.star_map_scene_signature = null;
  }
  if (!isPlainRecord(meta.star_map_curated_scene)) {
    meta.star_map_curated_scene = null;
  }
  if (typeof meta.star_map_curated_at !== "string" || !meta.star_map_curated_at.trim()) {
    meta.star_map_curated_at = null;
  }
  meta.star_map_star_placements = normalizeStarMapPlacements(meta.star_map_star_placements);
  if (typeof meta.star_map_placements_signature !== "string" || !meta.star_map_placements_signature.trim()) {
    meta.star_map_placements_signature = null;
  }
  if (typeof meta.star_map_placements_updated_at !== "string" || !meta.star_map_placements_updated_at.trim()) {
    meta.star_map_placements_updated_at = null;
  }
  return meta;
}

export function createDefaultMeta(spaceId: string) {
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
    track_direction_hints: {},
    star_map_scene_signature: null,
    star_map_curated_scene: null,
    star_map_curated_at: null,
    star_map_star_placements: {},
    star_map_placements_signature: null,
    star_map_placements_updated_at: null
  } satisfies ThinkingSpaceMetaRecord;
}

export function ensureMeta(db: DbState, spaceId: string) {
  const existing = db.thinking_space_meta.find((meta) => meta.space_id === spaceId);
  if (existing) return sanitizeMeta(existing);
  const next = createDefaultMeta(spaceId);
  db.thinking_space_meta.push(next);
  return next;
}

export function getMetaForRead(db: DbState, spaceId: string) {
  const existing = db.thinking_space_meta.find((meta) => meta.space_id === spaceId);
  if (!existing) return createDefaultMeta(spaceId);
  return sanitizeMeta(JSON.parse(JSON.stringify(existing)) as ThinkingSpaceMetaRecord);
}

export function appendAuditLog(
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
