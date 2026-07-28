import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MEDIA_ROOT = path.join(process.cwd(), "data", "thinking-media");

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function getThinkingMediaRoot() {
  return MEDIA_ROOT;
}

export function getThinkingMediaUserDir(userId: string) {
  return path.join(MEDIA_ROOT, safeSegment(userId));
}

export function getThinkingMediaAssetPath(userId: string, assetId: string) {
  return path.join(getThinkingMediaUserDir(userId), safeSegment(assetId));
}

export async function ensureThinkingMediaUserDir(userId: string) {
  await mkdir(getThinkingMediaUserDir(userId), { recursive: true });
}

export async function writeThinkingMediaAssetFile(userId: string, assetId: string, bytes: Uint8Array) {
  await ensureThinkingMediaUserDir(userId);
  await writeFile(getThinkingMediaAssetPath(userId, assetId), bytes);
}

export async function readThinkingMediaAssetFile(userId: string, assetId: string) {
  return readFile(getThinkingMediaAssetPath(userId, assetId));
}

export async function deleteThinkingMediaAssetFile(userId: string, assetId: string) {
  await rm(getThinkingMediaAssetPath(userId, assetId), { force: true });
}

export async function deleteThinkingMediaUserDirectory(userId: string) {
  await rm(getThinkingMediaUserDir(userId), { recursive: true, force: true });
}

export async function deleteMarkedThinkingMediaFiles(
  userId: string,
  assets: Array<{ id: string; user_id: string; deleted_at: string | null }>
) {
  const deletedAssetIds = assets
    .filter((asset) => asset.user_id === userId && Boolean(asset.deleted_at))
    .map((asset) => asset.id);
  await Promise.all(deletedAssetIds.map((assetId) => deleteThinkingMediaAssetFile(userId, assetId)));
}

export async function deleteThinkingMediaAssetFiles(userId: string, assetIds: string[]) {
  await Promise.all([...new Set(assetIds)].map((assetId) => deleteThinkingMediaAssetFile(userId, assetId)));
}

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
