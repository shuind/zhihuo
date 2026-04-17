import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { copyNode } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.copy",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{
      target_track_id?: string;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const targetTrackId = typeof body?.target_track_id === "string" ? body.target_track_id : null;
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    let copiedNodeId = "";
    let trackId = "";
    let updatedAt: string | null = null;
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = copyNode(db, userId, params.nodeId, targetTrackId);
      kind = result.kind;
      if (result.kind === "ok") {
        copiedNodeId = result.node.id;
        trackId = result.track_id;
        updatedAt = result.node.created_at;
      }
    });

    if (kind === "not_found") return errorJson(404, "node not found");
    if (kind === "readonly") return errorJson(409, "space is not active");
    return okJson({
      ok: true,
      node_id: copiedNodeId,
      track_id: trackId,
      updated_at: updatedAt ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-node-copy", max: 120, windowMs: 60 * 1000 } }
);
