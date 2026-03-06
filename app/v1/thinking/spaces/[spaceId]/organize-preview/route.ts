import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { organizeSpacePreview } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.organize_preview",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ from_order_index?: number }>(request);
    const fromOrderIndex = Number.isFinite(body?.from_order_index) ? Number(body?.from_order_index) : undefined;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let readonly = false;
    let candidates: Array<{ nodeId: string; preview: string; fromTrackId: string; suggestedTrackId: string; score: number }> = [];
    await updateDb((db) => {
      const result = organizeSpacePreview(db, userId, params.spaceId, fromOrderIndex);
      if (!result) return;
      found = true;
      if (result.kind === "readonly") {
        readonly = true;
        return;
      }
      candidates = result.candidates;
    });

    if (!found) return errorJson(404, "空间不存在");
    if (readonly) return errorJson(409, "空间不是进行中状态");
    return okJson({
      candidates: candidates.map((item) => ({
        node_id: item.nodeId,
        preview: item.preview,
        from_track_id: item.fromTrackId,
        suggested_track_id: item.suggestedTrackId,
        score: item.score
      }))
    });
  },
  { rateLimit: { bucket: "thinking-space-organize-preview", max: 90, windowMs: 60 * 1000 } }
);
