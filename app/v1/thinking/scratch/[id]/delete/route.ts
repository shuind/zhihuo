import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteThinkingScratch } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.scratch.delete",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let scratch = null;
    await updateDb((db) => {
      scratch = deleteThinkingScratch(db, userId, params.id);
    });

    if (!scratch) return errorJson(404, "随记不存在");
    return okJson({ ok: true, scratch });
  },
  { rateLimit: { bucket: "thinking-scratch-delete", max: 120, windowMs: 60 * 1000 } }
);
