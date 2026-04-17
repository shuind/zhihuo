import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { rebuildSpace } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.rebuild",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const resultRef: { value: ReturnType<typeof rebuildSpace> } = { value: null };
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      resultRef.value = rebuildSpace(db, userId, params.spaceId);
    });

    const result = resultRef.value;
    if (!result) return errorJson(404, "space not found");

    return okJson({
      rebuilt: result.rebuilt,
      nodes_added: result.nodes_added,
      moved_count: result.moved_count,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-rebuild", max: 90, windowMs: 60 * 1000 } }
);
