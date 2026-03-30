import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceBackground } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.background",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{
      background_text?: string | null;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const resultRef: { value: ReturnType<typeof updateSpaceBackground> | null } = { value: null };
    await updateDbScoped(["thinking_spaces", "thinking_space_meta"], (db) => {
      resultRef.value = updateSpaceBackground(db, userId, params.spaceId, typeof body?.background_text === "string" ? body.background_text : null);
    });

    const result = resultRef.value;
    if (!result) return errorJson(500, "failed to update background");
    if (result.kind === "not_found") return errorJson(404, "space not found");
    if (result.kind === "readonly") return errorJson(409, "space is not active");
    if (result.kind === "invalid_length") return errorJson(400, "background must be 100-300 chars");

    return okJson({
      ok: true,
      background_text: result.background_text,
      background_version: result.background_version,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-background", max: 30, windowMs: 60 * 1000 } }
);
