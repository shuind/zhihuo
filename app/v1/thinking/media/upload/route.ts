import { NextRequest } from "next/server";

import { updateUserDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { upsertThinkingMediaAsset } from "@/lib/server/store";
import { createId, nowIso } from "@/lib/server/utils";
import { deleteThinkingMediaAssetFile, writeThinkingMediaAssetFile, sha256Hex } from "@/lib/server/media";
import { maxThinkingImageBytes, validateThinkingImage } from "@/lib/server/image-upload";

export const POST = withApiRoute(
  "thinking.media.upload",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maxThinkingImageBytes() + 64 * 1024) {
      return errorJson(413, "image is too large");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorJson(400, "form data is required");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) return errorJson(400, "file is required");
    if (file.size <= 0) return errorJson(400, "image is empty");
    if (file.size > maxThinkingImageBytes()) return errorJson(413, "image is too large");

    const assetIdRaw = formData.get("asset_id");
    const assetId = typeof assetIdRaw === "string" && assetIdRaw.trim() ? assetIdRaw.trim() : createId();
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(assetId)) return errorJson(400, "invalid asset id");
    const fileNameRaw = formData.get("file_name");
    const fileName = (typeof fileNameRaw === "string" && fileNameRaw.trim() ? fileNameRaw.trim() : file.name || "image").slice(0, 160);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validateThinkingImage(bytes);
    if (!validated) return errorJson(415, "unsupported or invalid image");
    const mimeType = validated.mimeType;
    const sha256 = sha256Hex(bytes);
    const width = validated.width;
    const height = validated.height;

    try {
      await writeThinkingMediaAssetFile(userId, assetId, bytes);
      await updateUserDbScoped(userId, ["thinking_media_assets"], (db) => {
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
      await deleteThinkingMediaAssetFile(userId, assetId).catch(() => undefined);
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
