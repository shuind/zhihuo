import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateTrackDirectionHint } from "@/lib/server/store";
import type { TrackDirectionHint } from "@/lib/server/types";

function normalizeDirectionHint(input: string | null | undefined): TrackDirectionHint | null | false {
  if (input == null) return null;
  if (
    input === "hypothesis" ||
    input === "memory" ||
    input === "counterpoint" ||
    input === "worry" ||
    input === "constraint" ||
    input === "aside"
  ) {
    return input;
  }
  return false;
}

export const POST = withApiRoute(
  "thinking.spaces.track_direction",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ track_id?: string; direction_hint?: string | null }>(request);
    if (!body || typeof body.track_id !== "string") return errorJson(400, "缺少 track_id");
    const trackIdInput = body.track_id;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "track_not_found" | "invalid_hint" | null = null;
    let trackId: string | null = null;
    let directionHint: string | null = null;
    const normalizedHint = normalizeDirectionHint(body.direction_hint);
    if (normalizedHint === false) return errorJson(400, "方向提示无效");

    await updateDb((db) => {
      const result = updateTrackDirectionHint(db, userId, params.spaceId, trackIdInput, normalizedHint);
      kind = result.kind;
      if (result.kind === "ok") {
        trackId = result.track_id;
        directionHint = result.direction_hint;
      }
    });

    if (!kind || kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "track_not_found") return errorJson(404, "方向不存在");
    if (kind === "invalid_hint") return errorJson(400, "方向提示无效");

    return okJson({
      ok: true,
      track_id: trackId,
      direction_hint: directionHint
    });
  },
  { rateLimit: { bucket: "thinking-track-direction", max: 80, windowMs: 60 * 1000 } }
);
