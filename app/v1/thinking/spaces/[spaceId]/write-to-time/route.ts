import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { writeSpaceToTime } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.write_to_time",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let resultKind = "not_found";
    let spaceId: string | null = null;
    let doubtId: string | null = null;
    let writtenAt: string | null = null;

    await updateDb((db) => {
      const written = writeSpaceToTime(db, userId, params.spaceId);
      resultKind = written.kind;
      if (written.kind !== "ok") return;
      spaceId = written.space.id;
      doubtId = written.doubt.id;
      writtenAt = written.doubt.created_at;
    });

    if (resultKind === "readonly") return errorJson(409, "该空间已写入时间");
    if (resultKind === "invalid") return errorJson(400, "写入时间失败");
    if (resultKind === "not_found" || !spaceId || !doubtId || !writtenAt) return errorJson(404, "空间不存在");
    return okJson({
      ok: true,
      space_id: spaceId,
      doubt_id: doubtId,
      written_at: writtenAt,
      status: "hidden"
    });
  },
  { rateLimit: { bucket: "thinking-space-write-to-time", max: 30, windowMs: 60 * 1000 } }
);
