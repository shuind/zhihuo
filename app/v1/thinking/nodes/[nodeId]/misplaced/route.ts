import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { markNodeMisplaced } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.misplaced",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    let found = false;
    let readonly = false;
    let node: unknown = null;
    await updateDb((db) => {
      const result = markNodeMisplaced(db, userId, params.nodeId);
      if (!result) return;
      found = true;
      readonly = result.readonly;
      node = result.readonly ? null : result.node;
    });

    if (!found) return errorJson(404, "节点不存在");
    if (readonly) return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true, node });
  },
  { rateLimit: { bucket: "thinking-node-misplaced", max: 100, windowMs: 60 * 1000 } }
);
