import { NextRequest } from "next/server";

import { runPgTransaction, updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateNodeQuestion } from "@/lib/server/store";
import { classifyDimension, normalizeQuestionInput } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.update",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ raw_question_text?: string }>(request);
    if (typeof body?.raw_question_text !== "string") return errorJson(400, "缺少 raw_question_text");
    const rawQuestionText = body.raw_question_text;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const pgResult = await runPgTransaction("thinking.nodes.update.sql", async (client) => {
      const found = await client.query<{ status: string; background_text: string | null }>(
        `SELECT s.status, m.background_text
         FROM thinking_nodes n
         INNER JOIN thinking_spaces s ON s.id = n.space_id
         LEFT JOIN thinking_space_meta m ON m.space_id = s.id
         WHERE n.id = $1 AND s.user_id = $2
         FOR UPDATE OF n, s`,
        [params.nodeId, userId]
      );
      const row = found.rows[0];
      if (!row) return { kind: "not_found" as const };
      if (row.status !== "active") return { kind: "readonly" as const };

      const normalized = normalizeQuestionInput(rawQuestionText, row.background_text ?? null);
      if (!normalized.ok) return { kind: "invalid" as const };
      const questionText = normalized.text;
      const dimension = classifyDimension(questionText);

      await client.query("UPDATE thinking_nodes SET raw_question_text = $1, dimension = $2 WHERE id = $3", [
        questionText,
        dimension,
        params.nodeId
      ]);
      await client.query("DELETE FROM thinking_node_links WHERE source_node_id = $1 OR target_node_id = $1", [params.nodeId]);
      return { kind: "ok" as const, questionText };
    });

    if (pgResult) {
      if (pgResult.kind === "not_found") return errorJson(404, "节点不存在");
      if (pgResult.kind === "readonly") return errorJson(409, "空间不是进行中状态");
      if (pgResult.kind === "invalid") return errorJson(400, "输入过短");
      return okJson({ ok: true, node_id: params.nodeId, raw_question_text: pgResult.questionText });
    }

    let kind: "ok" | "not_found" | "readonly" | "invalid" = "not_found";
    let questionText = "";
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes", "thinking_node_links"], (db) => {
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
