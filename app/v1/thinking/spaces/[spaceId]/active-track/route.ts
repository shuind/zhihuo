import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { setActiveTrack } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.active_track",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ track_id?: string | null }>(request);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "track_not_found" = "not_found";
    let trackId: string | null = null;
    await updateDb((db) => {
      const result = setActiveTrack(db, userId, params.spaceId, typeof body?.track_id === "string" ? body.track_id : null);
      kind = result.kind;
      if (result.kind === "ok") trackId = result.track_id;
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "track_not_found") return errorJson(404, "轨道不存在");
    return okJson({ ok: true, track_id: trackId });
  },
  { rateLimit: { bucket: "thinking-space-track", max: 120, windowMs: 60 * 1000 } }
);
