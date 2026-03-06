import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteThinkingSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.delete",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" = "not_found";
    await updateDb((db) => {
      const result = deleteThinkingSpace(db, userId, params.spaceId);
      kind = result.kind;
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    return okJson({ ok: true });
  },
  { rateLimit: { bucket: "thinking-space-delete", max: 40, windowMs: 60 * 1000 } }
);
