import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { feedScratchToTime } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.scratch.feed_to_time",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: ReturnType<typeof feedScratchToTime> = { kind: "not_found" } as ReturnType<typeof feedScratchToTime>;
    await updateDb((db) => {
      result = feedScratchToTime(db, userId, params.id);
    });

    if (result.kind === "not_found") return errorJson(404, "随记不存在");
    if (result.kind === "not_available") return errorJson(409, "这条随记已不在待处理列表中");
    if (result.kind === "invalid") return errorJson(400, "随记内容无效");
    return okJson({ ok: true, doubt_id: result.doubt.id, created: result.created });
  },
  { rateLimit: { bucket: "thinking-scratch-feed-to-time", max: 120, windowMs: 60 * 1000 } }
);
