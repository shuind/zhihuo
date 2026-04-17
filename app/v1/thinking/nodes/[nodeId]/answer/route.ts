import { NextRequest } from "next/server";

import { runPgTransaction, updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateNodeAnswer } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.answer",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ answer_text?: string | null; client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const normalizedAnswer = typeof body?.answer_text === "string" ? body.answer_text.trim() || null : null;
    const responseUpdatedAt = clientUpdatedAt ?? nowIso();

    const pgResult = await runPgTransaction("thinking.nodes.answer.sql", async (client) => {
      const hasAnswerColumn = await client.query<{ exists: number }>(
        `SELECT 1 as exists
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'thinking_nodes' AND column_name = 'answer_text'
         LIMIT 1`
      );
      if (!hasAnswerColumn.rows[0]) return { kind: "fallback" as const };

      const found = await client.query<{ status: string }>(
        `SELECT s.status
         FROM thinking_nodes n
         INNER JOIN thinking_spaces s ON s.id = n.space_id
         WHERE n.id = $1 AND s.user_id = $2
         FOR UPDATE OF n, s`,
        [params.nodeId, userId]
      );
      const row = found.rows[0];
      if (!row) return { kind: "not_found" as const };
      if (row.status !== "active") return { kind: "readonly" as const };

      const updated = await client.query<{ answer_text: string | null }>(
        "UPDATE thinking_nodes SET answer_text = $1 WHERE id = $2 RETURNING answer_text",
        [normalizedAnswer, params.nodeId]
      );
      return { kind: "ok" as const, answerText: updated.rows[0]?.answer_text ?? null };
    });

    if (pgResult && pgResult.kind !== "fallback") {
      if (pgResult.kind === "not_found") return errorJson(404, "node not found");
      if (pgResult.kind === "readonly") return errorJson(409, "space is not active");
      return okJson({
        ok: true,
        node_id: params.nodeId,
        answer_text: pgResult.answerText,
        updated_at: responseUpdatedAt,
        client_mutation_id: clientMutationId
      });
    }

    let found = false;
    let readonly = false;
    let answerText: string | null = null;
    await updateDbScoped(["thinking_spaces", "thinking_nodes"], (db) => {
      const result = updateNodeAnswer(db, userId, params.nodeId, normalizedAnswer);
      if (result.kind === "not_found") return;
      found = true;
      if (result.kind === "readonly") {
        readonly = true;
        return;
      }
      answerText = result.node.answer_text ?? null;
    });

    if (!found) return errorJson(404, "node not found");
    if (readonly) return errorJson(409, "space is not active");
    return okJson({
      ok: true,
      node_id: params.nodeId,
      answer_text: answerText,
      updated_at: responseUpdatedAt,
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-node-answer", max: 120, windowMs: 60 * 1000 } }
);
