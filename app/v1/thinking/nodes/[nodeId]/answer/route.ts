import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateNodeAnswer } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.answer",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ answer_text?: string | null }>(request);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let readonly = false;
    let answerText: string | null = null;
    await updateDb((db) => {
      const result = updateNodeAnswer(db, userId, params.nodeId, typeof body?.answer_text === "string" ? body.answer_text : null);
      if (result.kind === "not_found") return;
      found = true;
      if (result.kind === "readonly") {
        readonly = true;
        return;
      }
      answerText = result.node.answer_text ?? null;
    });

    if (!found) return errorJson(404, "节点不存在");
    if (readonly) return errorJson(409, "空间不是进行中状态");
    return okJson({ ok: true, node_id: params.nodeId, answer_text: answerText });
  },
  { rateLimit: { bucket: "thinking-node-answer", max: 120, windowMs: 60 * 1000 } }
);
