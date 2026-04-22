import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { writeSpaceToTime } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.freeze",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ freeze_note?: string; client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "not_found" | "readonly" | "invalid" | "ok" = "not_found";
    const responseRef: { value: { space_id: string; status: "hidden"; written_at: string } | null } = { value: null };

    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes", "doubts"], (db) => {
      const result = writeSpaceToTime(db, userId, params.spaceId, typeof body?.freeze_note === "string" ? body.freeze_note : null);
      kind = result.kind;
      if (result.kind !== "ok") return;
      responseRef.value = {
        space_id: result.space.id,
        status: "hidden",
        written_at: result.doubt.created_at
      };
    });

    const response = responseRef.value;
    if (kind === "not_found" || !response) return errorJson(404, "space not found");
    if (kind === "readonly") return errorJson(409, "space has already been settled");
    if (kind === "invalid") return errorJson(400, "failed to write space to time");

    return okJson({
      space_id: response.space_id,
      status: response.status,
      written_at: response.written_at,
      updated_at: response.written_at ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId,
      deprecated: true
    });
  },
  { rateLimit: { bucket: "thinking-space-freeze", max: 30, windowMs: 60 * 1000 } }
);
