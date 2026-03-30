import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateTrackDirectionHint } from "@/lib/server/store";
import type { TrackDirectionHint } from "@/lib/server/types";
import { nowIso } from "@/lib/server/utils";

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
    const body = await parseJsonBody<{
      track_id?: string;
      direction_hint?: string | null;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    if (!body || typeof body.track_id !== "string") return errorJson(400, "track_id is required");

    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);
    const trackIdInput = body.track_id;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "track_not_found" | "invalid_hint" | null = null;
    let trackId: string | null = null;
    let directionHint: string | null = null;
    const normalizedHint = normalizeDirectionHint(body.direction_hint);
    if (normalizedHint === false) return errorJson(400, "invalid direction_hint");

    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = updateTrackDirectionHint(db, userId, params.spaceId, trackIdInput, normalizedHint);
      kind = result.kind;
      if (result.kind === "ok") {
        trackId = result.track_id;
        directionHint = result.direction_hint;
      }
    });

    if (!kind || kind === "not_found") return errorJson(404, "space not found");
    if (kind === "track_not_found") return errorJson(404, "track not found");
    if (kind === "invalid_hint") return errorJson(400, "invalid direction_hint");

    return okJson({
      ok: true,
      track_id: trackId,
      direction_hint: directionHint,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-track-direction", max: 80, windowMs: 60 * 1000 } }
);
