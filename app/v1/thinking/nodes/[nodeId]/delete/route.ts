import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteNode } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.delete",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes", "thinking_node_links"], (db) => {
      const result = deleteNode(db, userId, params.nodeId);
      kind = result.kind;
    });

    if (kind === "not_found") return errorJson(404, "node not found");
    if (kind === "readonly") return errorJson(409, "space is not active");
    return okJson({ ok: true, updated_at: clientUpdatedAt ?? nowIso(), client_mutation_id: clientMutationId });
  },
  { rateLimit: { bucket: "thinking-node-delete", max: 100, windowMs: 60 * 1000 } }
);
