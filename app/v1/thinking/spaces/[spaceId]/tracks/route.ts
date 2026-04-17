import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createEmptyTrack } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.tracks.create",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    let trackId = "";
    await updateDbScoped(["thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createEmptyTrack(db, userId, params.spaceId);
      kind = result.kind;
      if (result.kind === "ok") trackId = result.track_id;
    });

    if (kind === "not_found") return errorJson(404, "space not found");
    if (kind === "readonly") return errorJson(409, "space is not active");
    return okJson({
      ok: true,
      track_id: trackId,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-track-create", max: 60, windowMs: 60 * 1000 } }
);
