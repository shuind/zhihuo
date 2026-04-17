import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { upsertThinkingMediaAsset } from "@/lib/server/store";
import { createId, nowIso } from "@/lib/server/utils";
import { writeThinkingMediaAssetFile, sha256Hex } from "@/lib/server/media";

export const POST = withApiRoute(
  "thinking.media.upload",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorJson(400, "form data is required");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) return errorJson(400, "file is required");

    const assetIdRaw = formData.get("asset_id");
    const assetId = typeof assetIdRaw === "string" && assetIdRaw.trim() ? assetIdRaw.trim() : createId();
    const fileNameRaw = formData.get("file_name");
    const mimeTypeRaw = formData.get("mime_type");
    const widthRaw = formData.get("width");
    const heightRaw = formData.get("height");

    const fileName = typeof fileNameRaw === "string" && fileNameRaw.trim() ? fileNameRaw.trim() : file.name || "image";
    const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw.trim() ? mimeTypeRaw.trim() : file.type || "application/octet-stream";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const width = typeof widthRaw === "string" && Number.isFinite(Number(widthRaw)) ? Number(widthRaw) : null;
    const height = typeof heightRaw === "string" && Number.isFinite(Number(heightRaw)) ? Number(heightRaw) : null;

    try {
      await writeThinkingMediaAssetFile(userId, assetId, bytes);
      await updateDbScoped(["thinking_media_assets"], (db) => {
        upsertThinkingMediaAsset(db, userId, {
          id: assetId,
          file_name: fileName,
          mime_type: mimeType,
          byte_size: bytes.byteLength,
          sha256,
          width,
          height,
          created_at: nowIso(),
          uploaded_at: nowIso(),
          deleted_at: null
        });
      });
    } catch (error) {
      return errorJson(500, error instanceof Error ? error.message : "media upload failed");
    }

    return okJson({
      ok: true,
      asset_id: assetId,
      file_name: fileName,
      mime_type: mimeType,
      byte_size: bytes.byteLength,
      sha256,
      width,
      height,
      uploaded_at: nowIso()
    });
  },
  { rateLimit: { bucket: "thinking-media-upload", max: 60, windowMs: 60 * 1000 } }
);
