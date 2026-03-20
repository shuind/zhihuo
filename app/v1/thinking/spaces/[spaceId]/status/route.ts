import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { setSpaceStatus } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.status",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ status?: string }>(request);
    const status = body?.status;
    if (status !== "active" && status !== "hidden") {
      return errorJson(400, "status 仅支持 active 或 hidden");
    }

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    let kind: "ok" | "not_found" | "over_limit" = "not_found";
    let nextStatus: string | null = null;
    await updateDb((db) => {
      const result = setSpaceStatus(db, userId, params.spaceId, status);
      kind = result.kind;
      if (result.kind === "ok") nextStatus = result.space.status;
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "over_limit") return errorJson(409, "活跃空间已达上限");
    return okJson({ ok: true, status: nextStatus });
  },
  { rateLimit: { bucket: "thinking-space-status", max: 60, windowMs: 60 * 1000 } }
);
