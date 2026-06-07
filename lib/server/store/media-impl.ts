import type { DbState, ThinkingMediaAssetRecord } from "@/lib/server/types";
import { ensureMeta, markSpaceActivity, requireSpace, userSpaces } from "@/lib/server/store/shared";
import { bumpUserRevision } from "@/lib/server/store/sync-impl";
import { nowIso } from "@/lib/server/utils";

export function listThinkingMediaAssets(db: DbState, userId: string) {
  return db.thinking_media_assets.filter((asset) => asset.user_id === userId && !asset.deleted_at);
}

export function requireMediaAsset(db: DbState, userId: string, assetId: string) {
  return db.thinking_media_assets.find((asset) => asset.id === assetId && asset.user_id === userId && !asset.deleted_at) ?? null;
}

export function getMediaAssetReferenceCount(db: DbState, userId: string, assetId: string) {
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

export function pruneUnusedMediaAsset(db: DbState, userId: string, assetId: string) {
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
  markSpaceActivity(space);
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
  markSpaceActivity(space);
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, background_asset_ids: meta.background_asset_ids, background_selected_asset_id: meta.background_selected_asset_id };
}
