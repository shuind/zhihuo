import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { linkThinkingNode } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.link",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{
      target_node_id?: string;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    if (!body || typeof body.target_node_id !== "string") return errorJson(400, "target_node_id is required");

    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: { kind: string; link?: { id: string; created_at?: string } } = { kind: "not_found" };
    await updateDbScoped(["thinking_spaces", "thinking_nodes", "thinking_node_links"], (db) => {
      result = linkThinkingNode(db, userId, params.nodeId, body.target_node_id ?? "");
    });

    if (result.kind === "not_found") return errorJson(404, "node not found");
    if (result.kind === "invalid_target") return errorJson(400, "invalid target node");
    if (result.kind === "readonly") return errorJson(409, "space is not active");
    if (!result.link?.id) return errorJson(500, "failed to link node");

    return okJson({
      ok: true,
      link_id: result.link.id,
      updated_at: result.link.created_at ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-node-link", max: 120, windowMs: 60 * 1000 } }
);
