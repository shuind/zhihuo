import type { ThinkingSnapshot } from "@/lib/server/types";
import { createId, nowIso } from "@/lib/server/utils";

type RawRecord = Record<string, unknown>;

export type LifeImportSnapshot = {
  doubts?: Array<{
    id?: string;
    raw_text?: string;
    first_node_preview?: string | null;
    last_node_preview?: string | null;
    letter_title?: string | null;
    letter_lines?: string[] | string | null;
    letter_variant?: string | null;
    letter_seal_text?: string | null;
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
};

export type NormalizedUserImport = {
  life: LifeImportSnapshot;
  thinking: ThinkingSnapshot;
  mediaFiles: Array<{ assetId: string; contentBase64: string }>;
};

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

function asRecords(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter((item): item is RawRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function pickString(record: RawRecord, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "";
}

function pickNullableString(record: RawRecord, ...keys: string[]) {
  const value = pickString(record, ...keys);
  return value || null;
}

function pickNumber(record: RawRecord, fallback: number, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function pickBoolean(record: RawRecord, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return false;
}

function pickStringArray(record: RawRecord, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((item): item is string => typeof item === "string");
  }
  return [];
}

function pickRecord(record: RawRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as RawRecord;
  }
  return {};
}

function pickNullableRecord(record: RawRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as RawRecord;
  }
  return null;
}

function pickDimension(record: RawRecord): ThinkingSnapshot["nodes"][number]["dimension"] {
  const value = pickString(record, "dimension");
  return value === "resource" || value === "risk" || value === "value" || value === "path" || value === "evidence"
    ? value
    : "definition";
}

function normalizeInbox(value: unknown): ThinkingSnapshot["inbox"] {
  if (Array.isArray(value)) {
    const result: ThinkingSnapshot["inbox"] = {};
    for (const item of asRecords(value)) {
      const spaceId = pickString(item, "spaceId", "space_id");
      const rawText = pickString(item, "rawText", "raw_text");
      if (!spaceId || !rawText) continue;
      if (!result[spaceId]) result[spaceId] = [];
      result[spaceId].push({
        id: pickString(item, "id") || createId(),
        rawText,
        createdAt: pickString(item, "createdAt", "created_at") || nowIso()
      });
    }
    return result;
  }

  const result: ThinkingSnapshot["inbox"] = {};
  for (const [spaceId, items] of Object.entries(asRecord(value))) {
    result[spaceId] = asRecords(items)
      .map((item) => ({
        id: pickString(item, "id") || createId(),
        rawText: pickString(item, "rawText", "raw_text"),
        createdAt: pickString(item, "createdAt", "created_at") || nowIso()
      }))
      .filter((item) => item.rawText);
  }
  return result;
}

export function normalizeUserImportPayload(payload: unknown, userId: string): NormalizedUserImport {
  const root = asRecord(payload);
  const life = asRecord(root.life);
  const thinking = asRecord(root.thinking);
  const spaces = asRecords(thinking.spaces);
  const nodes = asRecords(thinking.nodes);
  const metas = asRecords(thinking.space_meta ?? thinking.spaceMeta);
  const scratch = asRecords(thinking.scratch);
  const mediaAssets = asRecords(thinking.media_assets ?? thinking.mediaAssets);
  const rawNodeLinks = thinking.node_links ?? thinking.nodeLinks;
  const nodeLinks = asRecords(rawNodeLinks);

  return {
    life: {
      doubts: asRecords(life.doubts) as LifeImportSnapshot["doubts"],
      notes: asRecords(life.notes) as LifeImportSnapshot["notes"]
    },
    thinking: {
      spaces: spaces.map((space) => {
        const status = pickString(space, "status") === "hidden" ? ("hidden" as const) : ("active" as const);
        const frozenAt = pickNullableString(space, "writtenToTimeAt", "written_to_time_at", "frozenAt", "frozen_at");
        return {
          id: pickString(space, "id") || createId(),
          userId,
          rootQuestionText: pickString(space, "rootQuestionText", "root_question_text"),
          status,
          createdAt: pickString(space, "createdAt", "created_at") || nowIso(),
          lastActivityAt: pickNullableString(space, "lastActivityAt", "last_activity_at") ?? undefined,
          writtenToTimeAt: frozenAt,
          sourceTimeDoubtId: pickNullableString(space, "sourceTimeDoubtId", "source_time_doubt_id")
        };
      }),
      nodes: nodes.map((node) => ({
        id: pickString(node, "id") || createId(),
        spaceId: pickString(node, "spaceId", "space_id"),
        parentNodeId: pickNullableString(node, "parentNodeId", "parent_node_id"),
        rawQuestionText: pickString(node, "rawQuestionText", "raw_question_text"),
        imageAssetId: pickNullableString(node, "imageAssetId", "image_asset_id"),
        noteText: pickNullableString(node, "noteText", "note_text"),
        answerText: pickNullableString(node, "answerText", "answer_text"),
        createdAt: pickString(node, "createdAt", "created_at") || nowIso(),
        orderIndex: pickNumber(node, 0, "orderIndex", "order_index"),
        isSuggested: pickBoolean(node, "isSuggested", "is_suggested"),
        state: pickString(node, "state") === "hidden" ? ("hidden" as const) : ("normal" as const),
        dimension: pickDimension(node)
      })),
      spaceMeta: metas.map((meta) => ({
        spaceId: pickString(meta, "spaceId", "space_id"),
        exportVersion: pickNumber(meta, 1, "exportVersion", "export_version"),
        backgroundText: pickNullableString(meta, "backgroundText", "background_text"),
        backgroundVersion: pickNumber(meta, 0, "backgroundVersion", "background_version"),
        backgroundAssetIds: pickStringArray(meta, "backgroundAssetIds", "background_asset_ids"),
        backgroundSelectedAssetId: pickNullableString(meta, "backgroundSelectedAssetId", "background_selected_asset_id"),
        suggestionDecay: pickNumber(meta, 0, "suggestionDecay", "suggestion_decay"),
        lastTrackId: pickNullableString(meta, "lastTrackId", "last_track_id"),
        lastOrganizedOrder: pickNumber(meta, -1, "lastOrganizedOrder", "last_organized_order"),
        parkingTrackId: pickNullableString(meta, "parkingTrackId", "parking_track_id"),
        pendingTrackId: pickNullableString(meta, "pendingTrackId", "pending_track_id"),
        emptyTrackIds: pickStringArray(meta, "emptyTrackIds", "empty_track_ids"),
        milestoneNodeIds: pickStringArray(meta, "milestoneNodeIds", "milestone_node_ids"),
        trackDirectionHints: pickRecord(meta, "trackDirectionHints", "track_direction_hints") as Record<string, string | null>,
        starMapSceneSignature: pickNullableString(meta, "starMapSceneSignature", "star_map_scene_signature"),
        starMapCuratedScene: pickNullableRecord(meta, "starMapCuratedScene", "star_map_curated_scene"),
        starMapCuratedAt: pickNullableString(meta, "starMapCuratedAt", "star_map_curated_at"),
        starMapStarPlacements: pickRecord(meta, "starMapStarPlacements", "star_map_star_placements") as NonNullable<
          ThinkingSnapshot["spaceMeta"][number]["starMapStarPlacements"]
        >,
        starMapPlacementsSignature: pickNullableString(meta, "starMapPlacementsSignature", "star_map_placements_signature"),
        starMapPlacementsUpdatedAt: pickNullableString(meta, "starMapPlacementsUpdatedAt", "star_map_placements_updated_at")
      })),
      ...(rawNodeLinks !== undefined
        ? {
            nodeLinks: nodeLinks.map((link) => ({
              id: pickString(link, "id") || createId(),
              spaceId: pickString(link, "spaceId", "space_id"),
              sourceNodeId: pickString(link, "sourceNodeId", "source_node_id"),
              targetNodeId: pickString(link, "targetNodeId", "target_node_id"),
              linkType: "related" as const,
              score: pickNumber(link, 0, "score"),
              createdAt: pickString(link, "createdAt", "created_at") || nowIso()
            }))
          }
        : {}),
      inbox: normalizeInbox(thinking.inbox),
      scratch: scratch.map((item) => ({
        id: pickString(item, "id") || createId(),
        userId,
        rawText: pickString(item, "rawText", "raw_text"),
        createdAt: pickString(item, "createdAt", "created_at") || nowIso(),
        updatedAt: pickString(item, "updatedAt", "updated_at") || nowIso(),
        archivedAt: pickNullableString(item, "archivedAt", "archived_at"),
        deletedAt: pickNullableString(item, "deletedAt", "deleted_at"),
        derivedSpaceId: pickNullableString(item, "derivedSpaceId", "derived_space_id"),
        fedTimeDoubtId: pickNullableString(item, "fedTimeDoubtId", "fed_time_doubt_id")
      })),
      mediaAssets: mediaAssets.map((asset) => ({
        id: pickString(asset, "id") || createId(),
        userId,
        fileName: pickString(asset, "fileName", "file_name") || "image",
        mimeType: pickString(asset, "mimeType", "mime_type") || "application/octet-stream",
        byteSize: pickNumber(asset, 0, "byteSize", "byte_size"),
        sha256: pickString(asset, "sha256"),
        width: pickNumber(asset, Number.NaN, "width"),
        height: pickNumber(asset, Number.NaN, "height"),
        createdAt: pickString(asset, "createdAt", "created_at") || nowIso(),
        uploadedAt: pickNullableString(asset, "uploadedAt", "uploaded_at"),
        deletedAt: pickNullableString(asset, "deletedAt", "deleted_at")
      })).map((asset) => ({
        ...asset,
        width: Number.isFinite(asset.width) ? asset.width : null,
        height: Number.isFinite(asset.height) ? asset.height : null
      })),
      assistEnabled: true
    },
    mediaFiles: mediaAssets
      .map((asset) => ({
        assetId: pickString(asset, "id"),
        contentBase64: pickString(asset, "contentBase64", "content_base64")
      }))
      .filter((asset) => asset.assetId && asset.contentBase64)
  };
}

export function validateUserImportReferences(payload: NormalizedUserImport) {
  const doubts = payload.life.doubts ?? [];
  const notes = payload.life.notes ?? [];
  const spaces = payload.thinking.spaces ?? [];
  const nodes = payload.thinking.nodes ?? [];
  const metas = payload.thinking.spaceMeta ?? [];
  const nodeLinks = payload.thinking.nodeLinks ?? [];
  const scratch = payload.thinking.scratch ?? [];
  const mediaAssets = payload.thinking.mediaAssets ?? [];

  const doubtIds = new Set(doubts.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const spaceIds = new Set(spaces.map((item) => item.id));
  const nodeIds = new Set(nodes.map((item) => item.id));
  const mediaIds = new Set(mediaAssets.map((item) => item.id));

  const brokenNotes = notes.filter((item) => !doubtIds.has(item.doubt_id ?? ""));
  const brokenNodes = nodes.filter(
    (item) => !spaceIds.has(item.spaceId) || (item.imageAssetId ? !mediaIds.has(item.imageAssetId) : false)
  );
  const brokenMeta = metas.filter((item) => {
    if (!spaceIds.has(item.spaceId)) return true;
    if ((item.backgroundAssetIds ?? []).some((assetId) => !mediaIds.has(assetId))) return true;
    if (item.backgroundSelectedAssetId && !mediaIds.has(item.backgroundSelectedAssetId)) return true;
    return (item.milestoneNodeIds ?? []).some((nodeId) => !nodeIds.has(nodeId));
  });
  const brokenInbox = Object.keys(payload.thinking.inbox ?? {}).filter((spaceId) => !spaceIds.has(spaceId));
  const brokenLinks = nodeLinks.filter(
    (link) => !spaceIds.has(link.spaceId) || !nodeIds.has(link.sourceNodeId) || !nodeIds.has(link.targetNodeId)
  );
  const brokenScratch = scratch.filter(
    (item) =>
      (item.derivedSpaceId ? !spaceIds.has(item.derivedSpaceId) : false) ||
      (item.fedTimeDoubtId ? !doubtIds.has(item.fedTimeDoubtId) : false)
  );

  return {
    ok:
      brokenNotes.length +
        brokenNodes.length +
        brokenMeta.length +
        brokenInbox.length +
        brokenLinks.length +
        brokenScratch.length ===
      0,
    broken: {
      notes: brokenNotes.length,
      nodes: brokenNodes.length,
      space_meta: brokenMeta.length,
      inbox: brokenInbox.length,
      node_links: brokenLinks.length,
      scratch: brokenScratch.length
    }
  };
}
