import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { markNodeMisplaced } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.misplaced",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let readonly = false;
    let node: unknown = null;
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = markNodeMisplaced(db, userId, params.nodeId);
      if (!result) return;
      found = true;
      readonly = result.readonly;
      node = result.readonly ? null : result.node;
    });

    if (!found) return errorJson(404, "node not found");
    if (readonly) return errorJson(409, "space is not active");
    return okJson({
      ok: true,
      node,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-node-misplaced", max: 100, windowMs: 60 * 1000 } }
);
