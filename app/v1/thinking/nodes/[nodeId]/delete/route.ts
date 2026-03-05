import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteNode } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.delete",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    await updateDb((db) => {
      const result = deleteNode(db, userId, params.nodeId);
      kind = result.kind;
    });

    if (kind === "not_found") return errorJson(404, "节点不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true });
  },
  { rateLimit: { bucket: "thinking-node-delete", max: 100, windowMs: 60 * 1000 } }
);
