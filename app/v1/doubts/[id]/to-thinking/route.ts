import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingSpaceFromDoubt } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "doubts.to_thinking",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let overLimit = false;
    let created = false;
    let spaceId: string | null = null;
    let spaceCreatedAt: string | null = null;

    await updateDbScoped(["doubts", "thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createThinkingSpaceFromDoubt(db, userId, params.id);
      if (!result) return;
      found = true;
      if (result.over_limit) {
        overLimit = true;
        return;
      }
      spaceId = result.space.id;
      spaceCreatedAt = result.space.created_at;
      created = !("restored" in result);
    });

    if (!found) return errorJson(404, "time entry not found");
    if (overLimit) return errorJson(409, "active spaces reached limit");

    return okJson(
      {
        space_id: spaceId,
        created,
        updated_at: spaceCreatedAt ?? clientUpdatedAt ?? nowIso(),
        client_mutation_id: clientMutationId
      },
      { status: created ? 201 : 200 }
    );
  },
  { rateLimit: { bucket: "doubts-to-thinking", max: 60, windowMs: 60 * 1000 } }
);
