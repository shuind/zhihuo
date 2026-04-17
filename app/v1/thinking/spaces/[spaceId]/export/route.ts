import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { exportSpace } from "@/lib/server/store";

export const GET = withApiRoute(
  "thinking.spaces.export",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    const db = await readDb();
    const result = exportSpace(db, userId, params.spaceId);
    if (!result) return errorJson(404, "空间不存在");
    return okJson(result);
  }
);
