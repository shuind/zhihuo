import { NextRequest } from "next/server";

import { readUserDb } from "@/lib/server/db";
import { errorJson, getUserId, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { readThinkingMediaAssetFile } from "@/lib/server/media";

export const GET = withApiRoute(
  "thinking.media.get",
  async (_request: NextRequest, { params }: { params: { assetId: string } }) => {
    const userId = getUserId(_request);
    if (!userId) return unauthorizedJson();

    const db = await readUserDb(userId, ["thinking_media_assets"]);
    const asset = db.thinking_media_assets.find(
      (item) => item.id === params.assetId && item.user_id === userId && !item.deleted_at
    );
    if (!asset) return errorJson(404, "media asset not found");

    try {
      const bytes = await readThinkingMediaAssetFile(userId, asset.id);
      return new Response(bytes, {
        headers: {
          "content-type": asset.mime_type || "application/octet-stream",
          "cache-control": "private, max-age=86400, immutable",
          "content-length": String(bytes.byteLength),
          "content-disposition": "inline",
          "x-content-type-options": "nosniff"
        }
      });
    } catch {
      return errorJson(404, "media file missing");
    }
  }
);
