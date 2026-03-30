import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { moveNode } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.move",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{
      target_track_id?: string;
      target_parent_id?: string;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);

    const targetTrackId = typeof body?.target_track_id === "string" ? body.target_track_id : body?.target_parent_id;
    if (typeof targetTrackId !== "string") return errorJson(400, "target_track_id is required");

    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let readonly = false;
    let node: unknown = null;
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = moveNode(db, userId, params.nodeId, targetTrackId);
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
  { rateLimit: { bucket: "thinking-node-move", max: 100, windowMs: 60 * 1000 } }
);
