import { NextRequest } from "next/server";

import { extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.link",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{
      target_node_id?: string;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    return okJson({
      ok: true,
      target_node_id: typeof body?.target_node_id === "string" ? body.target_node_id : null,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId,
      deprecated: true
    });
  },
  { rateLimit: { bucket: "thinking-node-link", max: 120, windowMs: 60 * 1000 } }
);
