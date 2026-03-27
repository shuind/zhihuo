import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { moveNode } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.move",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ target_track_id?: string; target_parent_id?: string }>(request);
    const targetTrackId = typeof body?.target_track_id === "string" ? body.target_track_id : body?.target_parent_id;
    if (typeof targetTrackId !== "string") return errorJson(400, "缺少 target_track_id");

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

    if (!found) return errorJson(404, "节点不存在");
    if (readonly) return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true, node });
  },
  { rateLimit: { bucket: "thinking-node-move", max: 100, windowMs: 60 * 1000 } }
);
