import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingSpaceFromDoubt } from "@/lib/server/store";

export const POST = withApiRoute(
  "doubts.to_thinking",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let overLimit = false;
    let created = false;
    let spaceId: string | null = null;

    await updateDbScoped(["doubts", "thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createThinkingSpaceFromDoubt(db, userId, params.id);
      if (!result) return;
      found = true;
      if (result.over_limit) {
        overLimit = true;
        return;
      }
      spaceId = result.space.id;
      created = !("restored" in result);
    });

    if (!found) return errorJson(404, "时间记录不存在");
    if (overLimit) return errorJson(409, "活跃空间已达上限");
    return okJson({ space_id: spaceId, created }, { status: created ? 201 : 200 });
  },
  { rateLimit: { bucket: "doubts-to-thinking", max: 60, windowMs: 60 * 1000 } }
);
