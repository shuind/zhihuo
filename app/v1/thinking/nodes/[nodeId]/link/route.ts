import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { linkThinkingNode } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.link",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ target_node_id?: string }>(request);
    if (!body || typeof body.target_node_id !== "string") return errorJson(400, "缺少 target_node_id");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: { kind: string; link?: { id: string } } = { kind: "not_found" };
    await updateDb((db) => {
      result = linkThinkingNode(db, userId, params.nodeId, body.target_node_id ?? "");
    });

    if (result.kind === "not_found") return errorJson(404, "节点不存在");
    if (result.kind === "invalid_target") return errorJson(400, "关联目标无效");
    if (result.kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (!result.link?.id) return errorJson(500, "关联失败");
    return okJson({ ok: true, link_id: result.link.id });
  },
  { rateLimit: { bucket: "thinking-node-link", max: 120, windowMs: 60 * 1000 } }
);
