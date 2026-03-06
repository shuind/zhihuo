import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { addQuestionToSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.questions.add",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ raw_text?: string; track_id?: string; from_suggestion?: boolean }>(request);
    if (!body || typeof body.raw_text !== "string") return errorJson(400, "缺少 raw_text");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" | "invalid" = "not_found";
    let nodeId: string | null = null;
    let normalized: string | null = null;
    let converted = false;
    let noteText: string | null = null;
    let trackId: string | null = null;
    let suggestedQuestions: string[] = [];
    let relatedCandidate: { node_id: string; preview: string; score: number } | null = null;

    await updateDb((db) => {
      const result = addQuestionToSpace(db, userId, params.spaceId, body.raw_text ?? "", {
        track_id: typeof body.track_id === "string" ? body.track_id : null,
        from_suggestion: body.from_suggestion === true
      });
      kind = result.kind;
      if (result.kind === "ok") {
        nodeId = result.node.id;
        normalized = result.normalized_question_text;
        converted = result.converted;
        noteText = result.note_text;
        trackId = result.track_id;
        suggestedQuestions = result.suggested_questions ?? [];
        relatedCandidate =
          result.related_candidate && typeof result.related_candidate.nodeId === "string"
            ? {
                node_id: result.related_candidate.nodeId,
                preview: result.related_candidate.preview,
                score: result.related_candidate.score
              }
            : null;
      } else if (result.kind === "invalid") {
        suggestedQuestions = result.suggested_questions;
      }
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (kind === "invalid") return errorJson(400, "输入内容过短");

    return okJson({
      node_id: nodeId,
      normalized_question_text: normalized,
      converted,
      note_text: noteText,
      track_id: trackId,
      suggested_questions: suggestedQuestions,
      related_candidate: relatedCandidate
    });
  },
  { rateLimit: { bucket: "thinking-questions-add", max: 90, windowMs: 60 * 1000 } }
);
