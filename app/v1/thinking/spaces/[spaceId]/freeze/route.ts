import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { writeSpaceToTime } from "@/lib/server/store";

// Legacy alias. Frontend should call /write-to-time instead.
export const POST = withApiRoute(
  "thinking.spaces.freeze",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "not_found" | "readonly" | "invalid" | "ok" = "not_found";
    let response: { space_id: string; status: "hidden"; written_at: string } | null = null;

    await updateDb((db) => {
      const result = writeSpaceToTime(db, userId, params.spaceId);
      kind = result.kind;
      if (result.kind !== "ok") return;
      response = {
        space_id: result.space.id,
        status: "hidden",
        written_at: result.doubt.created_at
      };
    });

    if (kind === "not_found" || !response) return errorJson(404, "空间不存在");
    if (kind === "readonly") return errorJson(409, "该空间已写入时间");
    if (kind === "invalid") return errorJson(400, "写入时间失败");
    return okJson(response);
  },
  { rateLimit: { bucket: "thinking-space-freeze", max: 30, windowMs: 60 * 1000 } }
);
