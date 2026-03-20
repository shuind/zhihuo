import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateNodeQuestion } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.nodes.update",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ raw_question_text?: string }>(request);
    if (typeof body?.raw_question_text !== "string") return errorJson(400, "缺少 raw_question_text");
    const rawQuestionText = body.raw_question_text;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" | "invalid" = "not_found";
    let questionText = "";
    await updateDb((db) => {
      const result = updateNodeQuestion(db, userId, params.nodeId, rawQuestionText);
      kind = result.kind;
      if (result.kind === "ok") questionText = result.node.raw_question_text;
    });

    if (kind === "not_found") return errorJson(404, "节点不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (kind === "invalid") return errorJson(400, "输入过短");
    return okJson({ ok: true, node_id: params.nodeId, raw_question_text: questionText });
  },
  { rateLimit: { bucket: "thinking-node-update", max: 120, windowMs: 60 * 1000 } }
);
