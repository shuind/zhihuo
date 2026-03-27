import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { convertScratchToSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.scratch.to_space",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: ReturnType<typeof convertScratchToSpace> = { kind: "not_found" } as ReturnType<typeof convertScratchToSpace>;
    await updateDbScoped(["thinking_scratch", "thinking_spaces", "thinking_space_meta"], (db) => {
      result = convertScratchToSpace(db, userId, params.id);
    });

    if (result.kind === "not_found") return errorJson(404, "随记不存在");
    if (result.kind === "not_available") return errorJson(409, "这条随记已不在待处理列表中");
    if (result.kind === "invalid") return errorJson(400, "随记内容无效");
    if (result.kind === "over_limit") return errorJson(409, "活跃空间已达上限");
    return okJson({ ok: true, space_id: result.space.id, converted: result.converted });
  },
  { rateLimit: { bucket: "thinking-scratch-to-space", max: 80, windowMs: 60 * 1000 } }
);
