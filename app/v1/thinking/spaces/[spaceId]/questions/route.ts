import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { addQuestionToSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.questions.add",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{
      raw_text?: string;
      track_id?: string;
      from_suggestion?: boolean;
      client_node_id?: string;
      client_created_at?: string;
      client_updated_at?: string;
      client_mutation_id?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    if (!body || typeof body.raw_text !== "string") return errorJson(400, "raw_text is required");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const state: {
      kind: "ok" | "not_found" | "readonly" | "invalid";
      nodeId: string | null;
      normalized: string | null;
      converted: boolean;
      noteText: string | null;
      trackId: string | null;
      updatedAt: string | null;
      suggestedQuestions: string[];
      relatedCandidate: { node_id: string; preview: string; score: number } | null;
    } = {
      kind: "not_found",
      nodeId: null,
      normalized: null,
      converted: false,
      noteText: null,
      trackId: null,
      updatedAt: null,
      suggestedQuestions: [],
      relatedCandidate: null
    };

    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = addQuestionToSpace(db, userId, params.spaceId, body.raw_text ?? "", {
        track_id: typeof body.track_id === "string" ? body.track_id : null,
        from_suggestion: body.from_suggestion === true,
        client_node_id: typeof body.client_node_id === "string" ? body.client_node_id : null,
        client_created_at: typeof body.client_created_at === "string" ? body.client_created_at : clientUpdatedAt
      });

      state.kind = result.kind;
      if (result.kind === "ok") {
        state.nodeId = result.node.id;
        state.normalized = result.normalized_question_text;
        state.converted = result.converted;
        state.noteText = result.note_text;
        state.trackId = result.track_id;
        state.updatedAt = result.node.created_at;
        state.suggestedQuestions = result.suggested_questions ?? [];
        state.relatedCandidate =
          result.related_candidate && typeof result.related_candidate.nodeId === "string"
            ? {
                node_id: result.related_candidate.nodeId,
                preview: result.related_candidate.preview,
                score: result.related_candidate.score
              }
            : null;
      } else if (result.kind === "invalid") {
        state.suggestedQuestions = result.suggested_questions;
      }
    });

    if (state.kind === "not_found") return errorJson(404, "space not found");
    if (state.kind === "readonly") return errorJson(409, "space is not active");
    if (state.kind === "invalid") return errorJson(400, "input too short");

    return okJson({
      node_id: state.nodeId,
      normalized_question_text: state.normalized,
      converted: state.converted,
      note_text: state.noteText,
      track_id: state.trackId,
      updated_at: state.updatedAt,
      suggested_questions: state.suggestedQuestions,
      related_candidate: state.relatedCandidate,
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-questions-add", max: 90, windowMs: 60 * 1000 } }
);
