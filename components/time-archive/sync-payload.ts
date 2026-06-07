import type { StarMapStatePatch } from "@/components/thinking/star-map";
import type { LifeStore, ThinkingStore } from "@/components/zhihuo-model";

export type UserExportPayload = {
  version: "2026-03-03";
  exported_at: string;
  user_id: string;
  user_email: string;
  life: {
    doubts: Array<{
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
    }>;
    notes: Array<{
      id: string;
      doubt_id: string;
      note_text: string;
      created_at: string;
    }>;
  };
  thinking: {
    spaces: Array<{
      id: string;
      userId: string;
      rootQuestionText: string;
      status: "active" | "hidden";
      createdAt: string;
      lastActivityAt?: string | null;
      writtenToTimeAt: string | null;
      sourceTimeDoubtId: string | null;
    }>;
    nodes: Array<{
      id: string;
      spaceId: string;
      parentNodeId: string | null;
      rawQuestionText: string;
      imageAssetId?: string | null;
      noteText?: string | null;
      answerText?: string | null;
      createdAt: string;
      orderIndex: number;
      isSuggested: boolean;
      state: "normal" | "hidden";
      dimension: string;
    }>;
    space_meta: Array<{
      spaceId: string;
      exportVersion: number;
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
      starMapSceneSignature?: string | null;
      starMapCuratedScene?: unknown;
      starMapCuratedAt?: string | null;
      starMapStarPlacements?: unknown;
      starMapPlacementsSignature?: string | null;
      starMapPlacementsUpdatedAt?: string | null;
    }>;
    inbox: Record<string, Array<{ id: string; rawText: string; createdAt: string }>>;
    scratch?: Array<{
      id: string;
      userId: string;
      rawText: string;
      createdAt: string;
      updatedAt: string;
      archivedAt: string | null;
      deletedAt: string | null;
      derivedSpaceId: string | null;
      fedTimeDoubtId: string | null;
    }>;
    media_assets?: Array<{
      id: string;
      user_id: string;
      file_name: string;
      mime_type: string;
      byte_size: number;
      sha256: string;
      width: number | null;
      height: number | null;
      created_at: string;
      uploaded_at: string | null;
      deleted_at: string | null;
      content_base64: string;
    }>;
  };
  audit: Array<Record<string, never>>;
};

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function hasMeaningfulLocalData(lifeStore: LifeStore, thinkingStore: ThinkingStore) {
  return (
    lifeStore.doubts.length > 0 ||
    lifeStore.notes.length > 0 ||
    thinkingStore.spaces.length > 0 ||
    thinkingStore.nodes.length > 0 ||
    thinkingStore.mediaAssets.length > 0 ||
    thinkingStore.scratch.length > 0 ||
    Object.values(thinkingStore.inbox).some((items) => items.length > 0)
  );
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

export function normalizeSceneLike(value: unknown): NonNullable<StarMapStatePatch["curatedScene"]> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NonNullable<StarMapStatePatch["curatedScene"]>)
    : null;
}

export function normalizeStarPlacements(value: unknown): NonNullable<StarMapStatePatch["starPlacements"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const placements: NonNullable<StarMapStatePatch["starPlacements"]> = {};
  for (const [starId, rawPlacement] of Object.entries(value as Record<string, unknown>)) {
    if (!rawPlacement || typeof rawPlacement !== "object" || Array.isArray(rawPlacement)) continue;
    const item = rawPlacement as Record<string, unknown>;
    const ring = Number(item.ring);
    if (ring !== 1 && ring !== 2 && ring !== 3 && ring !== 4) continue;
    const angle = Number(item.angle);
    const drift = Number(item.drift);
    placements[starId] = {
      ring,
      angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0,
      drift: Number.isFinite(drift) ? Math.max(-2, Math.min(2, drift)) : 0
    };
  }
  return placements;
}

export function canonicalizeExportPayload(payload: UserExportPayload) {
  const rawSpaces = Array.isArray(payload.thinking.spaces) ? (payload.thinking.spaces as Array<Record<string, unknown>>) : [];
  const rawNodes = Array.isArray(payload.thinking.nodes) ? (payload.thinking.nodes as Array<Record<string, unknown>>) : [];
  const rawMeta = Array.isArray(payload.thinking.space_meta) ? (payload.thinking.space_meta as Array<Record<string, unknown>>) : [];
  const rawScratch = Array.isArray(payload.thinking.scratch) ? (payload.thinking.scratch as Array<Record<string, unknown>>) : [];
  const rawMediaAssets = Array.isArray(payload.thinking.media_assets)
    ? (payload.thinking.media_assets as Array<Record<string, unknown>>)
    : [];
  const rawInbox = payload.thinking.inbox as unknown;
  const normalizedInboxEntries = Array.isArray(rawInbox)
    ? (rawInbox as Array<Record<string, unknown>>).reduce<Record<string, Array<Record<string, unknown>>>>((acc, item) => {
        const spaceId = typeof item.space_id === "string" ? item.space_id : typeof item.spaceId === "string" ? item.spaceId : "";
        if (!spaceId) return acc;
        if (!acc[spaceId]) acc[spaceId] = [];
        acc[spaceId].push(item);
        return acc;
      }, {})
    : Object.fromEntries(
        Object.entries((rawInbox ?? {}) as Record<string, unknown>).map(([spaceId, items]) => [
          spaceId,
          Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []
        ])
      );

  return {
    life: {
      doubts: [...payload.life.doubts]
        .map((item) => ({
          id: item.id,
          raw_text: item.raw_text,
          first_node_preview: item.first_node_preview ?? null,
          last_node_preview: item.last_node_preview ?? null,
          letter_title: item.letter_title ?? null,
          letter_lines: normalizeLetterLines(item.letter_lines),
          letter_variant: item.letter_variant ?? null,
          letter_seal_text: item.letter_seal_text ?? null,
          created_at: item.created_at,
          archived_at: item.archived_at ?? null,
          deleted_at: item.deleted_at ?? null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      notes: [...payload.life.notes]
        .map((item) => ({
          id: item.id,
          doubt_id: item.doubt_id,
          note_text: item.note_text,
          created_at: item.created_at
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    },
    thinking: {
      spaces: rawSpaces
        .map((item) => ({
          id: item.id,
          rootQuestionText:
            typeof item.rootQuestionText === "string"
              ? item.rootQuestionText
              : typeof item.root_question_text === "string"
                ? item.root_question_text
                : "",
          status: item.status,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          lastActivityAt:
            typeof item.lastActivityAt === "string"
              ? item.lastActivityAt
              : typeof item.last_activity_at === "string"
                ? item.last_activity_at
                : null,
          writtenToTimeAt:
            typeof item.writtenToTimeAt === "string"
              ? item.writtenToTimeAt
              : typeof item.written_to_time_at === "string"
                ? item.written_to_time_at
                : typeof item.frozenAt === "string"
                  ? item.frozenAt
                  : typeof item.frozen_at === "string"
                    ? item.frozen_at
                    : null,
          sourceTimeDoubtId:
            typeof item.sourceTimeDoubtId === "string"
              ? item.sourceTimeDoubtId
              : typeof item.source_time_doubt_id === "string"
                ? item.source_time_doubt_id
                : null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      nodes: rawNodes
        .map((item) => ({
          id: item.id,
          spaceId: typeof item.spaceId === "string" ? item.spaceId : typeof item.space_id === "string" ? item.space_id : "",
          parentNodeId:
            typeof item.parentNodeId === "string"
              ? item.parentNodeId
              : typeof item.parent_node_id === "string"
                ? item.parent_node_id
                : null,
          rawQuestionText:
            typeof item.rawQuestionText === "string"
              ? item.rawQuestionText
              : typeof item.raw_question_text === "string"
                ? item.raw_question_text
                : "",
          imageAssetId:
            typeof item.imageAssetId === "string"
              ? item.imageAssetId
              : typeof item.image_asset_id === "string"
                ? item.image_asset_id
                : null,
          noteText:
            typeof item.noteText === "string" ? item.noteText : typeof item.note_text === "string" ? item.note_text : null,
          answerText:
            typeof item.answerText === "string"
              ? item.answerText
              : typeof item.answer_text === "string"
                ? item.answer_text
                : null,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          orderIndex:
            typeof item.orderIndex === "number"
              ? item.orderIndex
              : typeof item.order_index === "number"
                ? item.order_index
                : 0,
          isSuggested: item.isSuggested === true || item.is_suggested === true,
          state: item.state,
          dimension: item.dimension
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      space_meta: rawMeta
        .map((item) => ({
          spaceId: typeof item.spaceId === "string" ? item.spaceId : typeof item.space_id === "string" ? item.space_id : "",
          exportVersion:
            typeof item.exportVersion === "number"
              ? item.exportVersion
              : typeof item.export_version === "number"
                ? item.export_version
                : 1,
          backgroundText:
            typeof item.backgroundText === "string"
              ? item.backgroundText
              : typeof item.background_text === "string"
                ? item.background_text
                : null,
          backgroundVersion:
            typeof item.backgroundVersion === "number"
              ? item.backgroundVersion
              : typeof item.background_version === "number"
                ? item.background_version
                : 0,
          backgroundAssetIds: [...(((item.backgroundAssetIds ?? item.background_asset_ids ?? []) as string[]) ?? [])].sort(),
          backgroundSelectedAssetId:
            typeof item.backgroundSelectedAssetId === "string"
              ? item.backgroundSelectedAssetId
              : typeof item.background_selected_asset_id === "string"
                ? item.background_selected_asset_id
                : null,
          suggestionDecay:
            typeof item.suggestionDecay === "number"
              ? item.suggestionDecay
              : typeof item.suggestion_decay === "number"
                ? item.suggestion_decay
                : 0,
          lastTrackId:
            typeof item.lastTrackId === "string"
              ? item.lastTrackId
              : typeof item.last_track_id === "string"
                ? item.last_track_id
                : null,
          lastOrganizedOrder:
            typeof item.lastOrganizedOrder === "number"
              ? item.lastOrganizedOrder
              : typeof item.last_organized_order === "number"
                ? item.last_organized_order
                : -1,
          parkingTrackId:
            typeof item.parkingTrackId === "string"
              ? item.parkingTrackId
              : typeof item.parking_track_id === "string"
                ? item.parking_track_id
                : null,
          pendingTrackId:
            typeof item.pendingTrackId === "string"
              ? item.pendingTrackId
              : typeof item.pending_track_id === "string"
                ? item.pending_track_id
                : null,
          emptyTrackIds: [...(((item.emptyTrackIds ?? item.empty_track_ids ?? []) as string[]) ?? [])].sort(),
          starMapSceneSignature:
            typeof item.starMapSceneSignature === "string"
              ? item.starMapSceneSignature
              : typeof item.star_map_scene_signature === "string"
                ? item.star_map_scene_signature
                : null,
          starMapCuratedScene: normalizeSceneLike(item.starMapCuratedScene ?? item.star_map_curated_scene),
          starMapCuratedAt:
            typeof item.starMapCuratedAt === "string"
              ? item.starMapCuratedAt
              : typeof item.star_map_curated_at === "string"
                ? item.star_map_curated_at
                : null,
          starMapStarPlacements: normalizeStarPlacements(item.starMapStarPlacements ?? item.star_map_star_placements),
          starMapPlacementsSignature:
            typeof item.starMapPlacementsSignature === "string"
              ? item.starMapPlacementsSignature
              : typeof item.star_map_placements_signature === "string"
                ? item.star_map_placements_signature
                : null,
          starMapPlacementsUpdatedAt:
            typeof item.starMapPlacementsUpdatedAt === "string"
              ? item.starMapPlacementsUpdatedAt
              : typeof item.star_map_placements_updated_at === "string"
                ? item.star_map_placements_updated_at
                : null
        }))
        .sort((a, b) => a.spaceId.localeCompare(b.spaceId)),
      media_assets: rawMediaAssets
        .map((item) => ({
          id: item.id,
          user_id: typeof item.user_id === "string" ? item.user_id : typeof item.userId === "string" ? item.userId : "",
          file_name: typeof item.file_name === "string" ? item.file_name : typeof item.fileName === "string" ? item.fileName : "image",
          mime_type: typeof item.mime_type === "string" ? item.mime_type : typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
          byte_size:
            typeof item.byte_size === "number"
              ? item.byte_size
              : typeof item.byteSize === "number"
                ? item.byteSize
                : 0,
          sha256: typeof item.sha256 === "string" ? item.sha256 : "",
          width: typeof item.width === "number" ? item.width : null,
          height: typeof item.height === "number" ? item.height : null,
          created_at: typeof item.created_at === "string" ? item.created_at : typeof item.createdAt === "string" ? item.createdAt : "",
          uploaded_at:
            typeof item.uploaded_at === "string"
              ? item.uploaded_at
              : typeof item.uploadedAt === "string"
                ? item.uploadedAt
                : null,
          deleted_at:
            typeof item.deleted_at === "string"
              ? item.deleted_at
              : typeof item.deletedAt === "string"
                ? item.deletedAt
                : null,
          content_base64:
            typeof item.content_base64 === "string"
              ? item.content_base64
              : typeof item.contentBase64 === "string"
                ? item.contentBase64
                : ""
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      inbox: Object.fromEntries(
        Object.entries(normalizedInboxEntries)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([spaceId, items]) => [
            spaceId,
            [...items]
              .map((item) => ({
                id: item.id,
                rawText: typeof item.rawText === "string" ? item.rawText : typeof item.raw_text === "string" ? item.raw_text : "",
                createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : ""
              }))
              .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          ])
      ),
      scratch: rawScratch
        .map((item) => ({
          id: item.id,
          rawText: typeof item.rawText === "string" ? item.rawText : typeof item.raw_text === "string" ? item.raw_text : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : typeof item.updated_at === "string" ? item.updated_at : "",
          archivedAt:
            typeof item.archivedAt === "string" ? item.archivedAt : typeof item.archived_at === "string" ? item.archived_at : null,
          deletedAt:
            typeof item.deletedAt === "string" ? item.deletedAt : typeof item.deleted_at === "string" ? item.deleted_at : null,
          derivedSpaceId:
            typeof item.derivedSpaceId === "string"
              ? item.derivedSpaceId
              : typeof item.derived_space_id === "string"
                ? item.derived_space_id
                : null,
          fedTimeDoubtId:
            typeof item.fedTimeDoubtId === "string"
              ? item.fedTimeDoubtId
              : typeof item.fed_time_doubt_id === "string"
                ? item.fed_time_doubt_id
                : null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
  };
}

export function _arePayloadsEquivalent(localPayload: UserExportPayload, cloudPayload: UserExportPayload) {
  return stableStringify(canonicalizeExportPayload(localPayload)) === stableStringify(canonicalizeExportPayload(cloudPayload));
}

export function getPreferredSpaceIdForQueuedMutation(route: string, body: Record<string, unknown> | null) {
  const clientSpaceId =
    typeof body?.client_space_id === "string" && body.client_space_id.trim() ? body.client_space_id : null;
  if (clientSpaceId && (route === "/v1/thinking/spaces" || /^\/v1\/thinking\/scratch\/[^/]+\/to-space$/.test(route))) {
    return clientSpaceId;
  }
  const spaceRouteMatch = route.match(/^\/v1\/thinking\/spaces\/([^/]+)/);
  return spaceRouteMatch?.[1] ?? null;
}
