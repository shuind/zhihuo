import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { copyNode } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.copy",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ target_track_id?: string }>(request);
    const targetTrackId = typeof body?.target_track_id === "string" ? body.target_track_id : null;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" = "not_found";
    let copiedNodeId = "";
    let trackId = "";
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = copyNode(db, userId, params.nodeId, targetTrackId);
      kind = result.kind;
      if (result.kind === "ok") {
        copiedNodeId = result.node.id;
        trackId = result.track_id;
      }
    });

    if (kind === "not_found") return errorJson(404, "节点不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true, node_id: copiedNodeId, track_id: trackId });
  },
  { rateLimit: { bucket: "thinking-node-copy", max: 120, windowMs: 60 * 1000 } }
);
