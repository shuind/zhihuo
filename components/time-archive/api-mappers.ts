import type { ThinkingSpaceView } from "@/components/thinking-layer";
import { normalizeLetterLines, normalizeSceneLike, normalizeStarPlacements } from "@/components/time-archive/sync-payload";
import {
  DIMENSIONS,
  EMPTY_THINKING_STORE,
  classifyDimension,
  type LifeDoubt,
  type LifeNote,
  type ThinkingNode,
  type ThinkingScratchItem,
  type ThinkingSpace,
  type ThinkingSpaceMeta,
  type ThinkingStore
} from "@/components/zhihuo-model";

export type ApiLifeDoubt = {
  id: string;
  raw_text: string;
  first_node_preview: string | null;
  last_node_preview: string | null;
  letter_title?: string | null;
  letter_lines?: string[] | string | null;
  letter_variant?: string | null;
  letter_seal_text?: string | null;
  created_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

export type ApiLifeNote = {
  id: string;
  doubt_id: string;
  note_text: string;
  created_at: string;
};

export type ApiThinkingSpace = {
  id: string;
  user_id: string;
  root_question_text: string;
  status: "active" | "hidden";
  created_at: string;
  last_activity_at?: string;
  written_to_time_at?: string | null;
  frozen_at?: string | null;
  source_time_doubt_id: string | null;
};

export type ApiThinkingScratch = {
  id: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  derived_space_id: string | null;
  fed_time_doubt_id: string | null;
};

export type ApiThinkingSpaceMeta = {
  space_id: string;
  export_version: number;
  background_text?: string | null;
  background_version?: number;
  background_asset_ids?: string[];
  background_selected_asset_id?: string | null;
  suggestion_decay?: number;
  last_track_id?: string | null;
  last_organized_order?: number;
  parking_track_id?: string | null;
  pending_track_id?: string | null;
  empty_track_ids?: string[];
  user_freeze_note?: string | null;
  milestone_node_ids?: string[];
  track_direction_hints?: Record<string, string | null>;
  star_map_scene_signature?: string | null;
  star_map_curated_scene?: unknown;
  star_map_curated_at?: string | null;
  star_map_star_placements?: unknown;
  star_map_placements_signature?: string | null;
  star_map_placements_updated_at?: string | null;
};

export type ApiThinkingTrackNode = {
  id: string;
  raw_question_text: string;
  image_asset_id?: string | null;
  note_text?: string | null;
  answer_text?: string | null;
  created_at: string;
  is_suggested: boolean;
  dimension?: string | null;
  echo_track_id?: string | null;
  echo_node_id?: string | null;
};

export type ApiThinkingTrack = {
  id: string;
  title_question_text: string;
  is_parking?: boolean;
  is_empty?: boolean;
  node_count: number;
  nodes: ApiThinkingTrackNode[];
};

export type ApiThinkingSpaceView = {
  root: ApiThinkingSpace;
  current_track_id?: string | null;
  tracks?: ApiThinkingTrack[];
  suggested_questions?: string[];
  background_text?: string | null;
  background_version?: number;
  background_asset_ids?: string[];
  background_selected_asset_id?: string | null;
  parking_track_id?: string | null;
  pending_track_id?: string | null;
  empty_track_ids?: string[];
};

export type SyncSnapshotResponse = {
  revision?: number;
  lastSequence?: number;
  repairItems?: Array<{
    id?: string;
    clientMutationId?: string;
    op?: string;
    payload?: Record<string, unknown> | null;
    reason?: string;
    destinationClass?: string | null;
    originalTargetId?: string | null;
    createdAt?: string;
  }>;
  life?: {
    doubts?: ApiLifeDoubt[];
    notes?: ApiLifeNote[];
  };
  thinking?: {
    spaces?: Array<{
      id?: string;
      userId?: string;
      rootQuestionText?: string;
      status?: "active" | "hidden";
      createdAt?: string;
      lastActivityAt?: string | null;
      writtenToTimeAt?: string | null;
      frozenAt?: string | null;
      sourceTimeDoubtId?: string | null;
    }>;
    nodes?: Array<{
      id?: string;
      spaceId?: string;
      parentNodeId?: string | null;
      rawQuestionText?: string;
      imageAssetId?: string | null;
      createdAt?: string;
      orderIndex?: number;
      isSuggested?: boolean;
      state?: "normal" | "hidden";
      dimension?: string;
    }>;
    spaceMeta?: Array<{
      spaceId?: string;
      exportVersion?: number;
      backgroundText?: string | null;
      backgroundVersion?: number;
      backgroundAssetIds?: string[];
      backgroundSelectedAssetId?: string | null;
      suggestionDecay?: number;
      lastTrackId?: string | null;
      lastOrganizedOrder?: number;
      parkingTrackId?: string | null;
      pendingTrackId?: string | null;
      emptyTrackIds?: string[];
      userFreezeNote?: string | null;
      milestoneNodeIds?: string[];
      trackDirectionHints?: Record<string, string | null>;
      starMapSceneSignature?: string | null;
      starMapCuratedScene?: unknown;
      starMapCuratedAt?: string | null;
      starMapStarPlacements?: unknown;
      starMapPlacementsSignature?: string | null;
      starMapPlacementsUpdatedAt?: string | null;
    }>;
    nodeLinks?: Array<Record<string, unknown>>;
    mediaAssets?: Array<{
        id?: string;
        userId?: string;
        fileName?: string;
        mimeType?: string;
        byteSize?: number;
        sha256?: string;
        width?: number | null;
        height?: number | null;
        createdAt?: string;
        uploadedAt?: string | null;
        deletedAt?: string | null;
      }>;
      inbox?: Record<string, Array<{ id?: string; rawText?: string; createdAt?: string }>>;
      scratch?: Array<{
        id?: string;
      userId?: string;
      rawText?: string;
      createdAt?: string;
      updatedAt?: string;
      archivedAt?: string | null;
      deletedAt?: string | null;
      derivedSpaceId?: string | null;
      fedTimeDoubtId?: string | null;
    }>;
  };
  thinking_views?: Record<string, ApiThinkingSpaceView>;
};

export function mapApiLifeDoubt(item: ApiLifeDoubt): LifeDoubt {
  return {
    id: item.id,
    rawText: item.raw_text,
    firstNodePreview: typeof item.first_node_preview === "string" ? item.first_node_preview : null,
    lastNodePreview: typeof item.last_node_preview === "string" ? item.last_node_preview : null,
    letterTitle: typeof item.letter_title === "string" ? item.letter_title : null,
    letterLines: normalizeLetterLines(item.letter_lines),
    letterVariant: typeof item.letter_variant === "string" ? item.letter_variant : null,
    letterSealText: typeof item.letter_seal_text === "string" ? item.letter_seal_text : null,
    createdAt: item.created_at,
    archivedAt: item.archived_at,
    deletedAt: item.deleted_at
  };
}

export function mapApiLifeNote(item: ApiLifeNote): LifeNote {
  return {
    id: item.id,
    doubtId: item.doubt_id,
    noteText: item.note_text,
    createdAt: item.created_at
  };
}

export function mapApiThinkingSpace(item: ApiThinkingSpace): ThinkingSpace {
  return {
    id: item.id,
    userId: item.user_id,
    rootQuestionText: item.root_question_text,
    status: item.status,
    createdAt: item.created_at,
    lastActivityAt: typeof item.last_activity_at === "string" ? item.last_activity_at : item.created_at,
    writtenToTimeAt:
      item.status === "active"
        ? null
        : typeof item.written_to_time_at === "string"
        ? item.written_to_time_at
        : typeof item.frozen_at === "string"
          ? item.frozen_at
          : null,
    sourceTimeDoubtId: item.source_time_doubt_id
  };
}

export function mapApiThinkingScratch(item: ApiThinkingScratch): ThinkingScratchItem {
  return {
    id: item.id,
    rawText: item.raw_text,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    archivedAt: item.archived_at,
    deletedAt: item.deleted_at,
    derivedSpaceId: item.derived_space_id,
    fedTimeDoubtId: item.fed_time_doubt_id
  };
}

export function mapApiThinkingMeta(item: ApiThinkingSpaceMeta): ThinkingSpaceMeta {
  return {
    spaceId: item.space_id,
    exportVersion: item.export_version,
    backgroundText: typeof item.background_text === "string" ? item.background_text : null,
    backgroundVersion: Number.isFinite(item.background_version) ? Number(item.background_version) : 0,
    backgroundAssetIds: Array.isArray(item.background_asset_ids) ? item.background_asset_ids.filter((id) => typeof id === "string") : [],
    backgroundSelectedAssetId:
      typeof item.background_selected_asset_id === "string" ? item.background_selected_asset_id : null,
    suggestionDecay: Number.isFinite(item.suggestion_decay) ? Number(item.suggestion_decay) : 0,
    lastTrackId: typeof item.last_track_id === "string" ? item.last_track_id : null,
    lastOrganizedOrder: Number.isFinite(item.last_organized_order) ? Number(item.last_organized_order) : -1,
    parkingTrackId: typeof item.parking_track_id === "string" ? item.parking_track_id : null,
    pendingTrackId: typeof item.pending_track_id === "string" ? item.pending_track_id : null,
    emptyTrackIds: Array.isArray(item.empty_track_ids) ? item.empty_track_ids.filter((id) => typeof id === "string") : [],
    starMapSceneSignature: typeof item.star_map_scene_signature === "string" ? item.star_map_scene_signature : null,
    starMapCuratedScene: normalizeSceneLike(item.star_map_curated_scene),
    starMapCuratedAt: typeof item.star_map_curated_at === "string" ? item.star_map_curated_at : null,
    starMapStarPlacements: normalizeStarPlacements(item.star_map_star_placements),
    starMapPlacementsSignature:
      typeof item.star_map_placements_signature === "string" ? item.star_map_placements_signature : null,
    starMapPlacementsUpdatedAt:
      typeof item.star_map_placements_updated_at === "string" ? item.star_map_placements_updated_at : null
  };
}

export function normalizeThinkingDimension(value: unknown, fallbackText: string): ThinkingNode["dimension"] {
  if (typeof value === "string" && DIMENSIONS.includes(value as ThinkingNode["dimension"])) {
    return value as ThinkingNode["dimension"];
  }
  return classifyDimension(fallbackText);
}
export function mapApiThinkingView(payload: ApiThinkingSpaceView): ThinkingSpaceView {
  return {
    spaceId: payload.root.id,
    currentTrackId: typeof payload.current_track_id === "string" ? payload.current_track_id : null,
    tracks: (payload.tracks ?? []).map((track) => ({
      id: track.id,
      titleQuestionText: track.title_question_text,
      isParking: track.is_parking === true,
      isEmpty: track.is_empty === true,
      nodes: (track.nodes ?? []).map((node) => ({
        id: node.id,
        questionText: node.raw_question_text,
        imageAssetId: typeof node.image_asset_id === "string" ? node.image_asset_id : null,
        noteText: typeof node.note_text === "string" ? node.note_text : null,
        answerText: typeof node.answer_text === "string" ? node.answer_text : null,
        isSuggested: Boolean(node.is_suggested),
        dimension: normalizeThinkingDimension(node.dimension, node.raw_question_text),
        createdAt: node.created_at,
        echoTrackId: typeof node.echo_track_id === "string" ? node.echo_track_id : null,
        echoNodeId: typeof node.echo_node_id === "string" ? node.echo_node_id : null
      })),
      nodeCount: Math.max(0, track.node_count ?? 0)
    })),
    parkingTrackId: typeof payload.parking_track_id === "string" ? payload.parking_track_id : null,
    pendingTrackId: typeof payload.pending_track_id === "string" ? payload.pending_track_id : null,
    suggestedQuestions: (payload.suggested_questions ?? []).filter((item) => typeof item === "string"),
    backgroundText: typeof payload.background_text === "string" ? payload.background_text : null,
    backgroundVersion: Number.isFinite(payload.background_version) ? Number(payload.background_version) : 0,
    backgroundAssetIds: Array.isArray(payload.background_asset_ids) ? payload.background_asset_ids.filter((id) => typeof id === "string") : [],
    backgroundSelectedAssetId:
      typeof payload.background_selected_asset_id === "string" ? payload.background_selected_asset_id : null
  };
}

export function mapSyncSnapshotThinking(payload?: SyncSnapshotResponse["thinking"]): ThinkingStore {
  return {
    ...EMPTY_THINKING_STORE,
    spaces: Array.isArray(payload?.spaces)
      ? payload.spaces
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: item.id as string,
            userId: typeof item.userId === "string" ? item.userId : "",
            rootQuestionText: typeof item.rootQuestionText === "string" ? item.rootQuestionText : "",
            status: item.status === "hidden" ? "hidden" : "active",
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            lastActivityAt: typeof item.lastActivityAt === "string" ? item.lastActivityAt : undefined,
            writtenToTimeAt:
              item.status !== "hidden"
                ? null
                : typeof item.writtenToTimeAt === "string"
                  ? item.writtenToTimeAt
                  : typeof item.frozenAt === "string"
                    ? item.frozenAt
                    : null,
            sourceTimeDoubtId: typeof item.sourceTimeDoubtId === "string" ? item.sourceTimeDoubtId : null
          }))
      : [],
    nodes: Array.isArray(payload?.nodes)
      ? payload.nodes
          .filter((item) => item && typeof item.id === "string" && typeof item.spaceId === "string")
          .map((item) => ({
            id: item.id as string,
            spaceId: item.spaceId as string,
            parentNodeId: typeof item.parentNodeId === "string" ? item.parentNodeId : null,
            rawQuestionText: typeof item.rawQuestionText === "string" ? item.rawQuestionText : "",
            imageAssetId: typeof item.imageAssetId === "string" ? item.imageAssetId : null,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            orderIndex: Number.isFinite(item.orderIndex) ? Number(item.orderIndex) : 0,
            isSuggested: item.isSuggested === true,
            state: item.state === "hidden" ? "hidden" : "normal",
            dimension:
              item.dimension === "resource" ||
              item.dimension === "risk" ||
              item.dimension === "value" ||
              item.dimension === "path" ||
              item.dimension === "evidence"
                ? item.dimension
                : "definition"
          }))
      : [],
    spaceMeta: Array.isArray(payload?.spaceMeta)
      ? payload.spaceMeta
          .filter((item) => item && typeof item.spaceId === "string")
          .map((item) => ({
            spaceId: item.spaceId as string,
            exportVersion: Number.isFinite(item.exportVersion) ? Number(item.exportVersion) : 1,
            backgroundText: typeof item.backgroundText === "string" ? item.backgroundText : null,
            backgroundVersion: Number.isFinite(item.backgroundVersion) ? Number(item.backgroundVersion) : 0,
            backgroundAssetIds: Array.isArray(item.backgroundAssetIds) ? item.backgroundAssetIds.filter((value) => typeof value === "string") : [],
            backgroundSelectedAssetId: typeof item.backgroundSelectedAssetId === "string" ? item.backgroundSelectedAssetId : null,
            suggestionDecay: Number.isFinite(item.suggestionDecay) ? Number(item.suggestionDecay) : 0,
            lastTrackId: typeof item.lastTrackId === "string" ? item.lastTrackId : null,
            lastOrganizedOrder: Number.isFinite(item.lastOrganizedOrder) ? Number(item.lastOrganizedOrder) : -1,
            parkingTrackId: typeof item.parkingTrackId === "string" ? item.parkingTrackId : null,
            pendingTrackId: typeof item.pendingTrackId === "string" ? item.pendingTrackId : null,
            emptyTrackIds: Array.isArray(item.emptyTrackIds) ? item.emptyTrackIds.filter((value) => typeof value === "string") : [],
            starMapSceneSignature: typeof item.starMapSceneSignature === "string" ? item.starMapSceneSignature : null,
            starMapCuratedScene: normalizeSceneLike(item.starMapCuratedScene),
            starMapCuratedAt: typeof item.starMapCuratedAt === "string" ? item.starMapCuratedAt : null,
            starMapStarPlacements: normalizeStarPlacements(item.starMapStarPlacements),
            starMapPlacementsSignature:
              typeof item.starMapPlacementsSignature === "string" ? item.starMapPlacementsSignature : null,
            starMapPlacementsUpdatedAt:
              typeof item.starMapPlacementsUpdatedAt === "string" ? item.starMapPlacementsUpdatedAt : null
          }))
      : [],
    inbox:
      payload?.inbox && typeof payload.inbox === "object"
        ? Object.fromEntries(
            Object.entries(payload.inbox).map(([spaceId, list]) => [
              spaceId,
              Array.isArray(list)
                ? list
                    .filter((item) => item && typeof item.id === "string")
                    .map((item) => ({
                      id: item.id as string,
                      rawText: typeof item.rawText === "string" ? item.rawText : "",
                      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
                    }))
                : []
            ])
          )
        : {},
    scratch: Array.isArray(payload?.scratch)
      ? payload.scratch
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: item.id as string,
            rawText: typeof item.rawText === "string" ? item.rawText : "",
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
            archivedAt: typeof item.archivedAt === "string" ? item.archivedAt : null,
            deletedAt: typeof item.deletedAt === "string" ? item.deletedAt : null,
            derivedSpaceId: typeof item.derivedSpaceId === "string" ? item.derivedSpaceId : null,
            fedTimeDoubtId: typeof item.fedTimeDoubtId === "string" ? item.fedTimeDoubtId : null
          }))
      : [],
    mediaAssets: Array.isArray(payload?.mediaAssets)
      ? payload.mediaAssets
          .filter((item) => item && typeof item.id === "string")
          .map((item) => ({
            id: item.id as string,
            fileName: typeof item.fileName === "string" ? item.fileName : "image",
            mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
            byteSize: Number.isFinite(item.byteSize) ? Number(item.byteSize) : 0,
            sha256: typeof item.sha256 === "string" ? item.sha256 : "",
            width: Number.isFinite(item.width) ? Number(item.width) : null,
            height: Number.isFinite(item.height) ? Number(item.height) : null,
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
            uploadedAt: typeof item.uploadedAt === "string" ? item.uploadedAt : null,
            deletedAt: typeof item.deletedAt === "string" ? item.deletedAt : null
          }))
      : []
  };
}
