import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createEmptyTrack } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.tracks.create",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    let trackId = "";
    await updateDbScoped(["thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createEmptyTrack(db, userId, params.spaceId);
      kind = result.kind;
      if (result.kind === "ok") trackId = result.track_id;
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true, track_id: trackId });
  },
  { rateLimit: { bucket: "thinking-space-track-create", max: 60, windowMs: 60 * 1000 } }
);
