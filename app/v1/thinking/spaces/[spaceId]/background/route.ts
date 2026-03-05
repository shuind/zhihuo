import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceBackground } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.background",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ background_text?: string | null }>(request);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: any = null;
    await updateDb((db) => {
      result = updateSpaceBackground(
        db,
        userId,
        params.spaceId,
        typeof body?.background_text === "string" ? body.background_text : null
      );
    });

    if (!result) return errorJson(500, "背景更新失败");
    if (result.kind === "not_found") return errorJson(404, "空间不存在");
    if (result.kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (result.kind === "invalid_length") return errorJson(400, "背景说明需在 100-300 字之间");
    return okJson({
      ok: true,
      background_text: result.background_text,
      background_version: result.background_version
    });
  },
  { rateLimit: { bucket: "thinking-space-background", max: 30, windowMs: 60 * 1000 } }
);
