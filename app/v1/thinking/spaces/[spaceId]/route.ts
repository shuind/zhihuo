import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getSpaceView } from "@/lib/server/store";

export const GET = withApiRoute(
  "thinking.spaces.detail",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    const db = await readDb();
    const space = getSpaceView(db, userId, params.spaceId);
    if (!space) return errorJson(404, "空间不存在");
    return okJson(space);
  }
);
