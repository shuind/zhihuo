import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { rebuildSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.rebuild",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    let result: ReturnType<typeof rebuildSpace> = null;
    await updateDb((db) => {
      result = rebuildSpace(db, userId, params.spaceId);
    });
    if (!result) return errorJson(404, "空间不存在");
    return okJson(result);
  },
  { rateLimit: { bucket: "thinking-space-rebuild", max: 90, windowMs: 60 * 1000 } }
);
