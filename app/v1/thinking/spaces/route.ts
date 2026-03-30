import { NextRequest } from "next/server";

import { readDb, updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingSpace, listThinkingSpaces } from "@/lib/server/store";
import { collapseWhitespace } from "@/lib/server/utils";

export const GET = withApiRoute("thinking.spaces.list", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  const payload = listThinkingSpaces(db, userId);
  return okJson(payload);
});

export const POST = withApiRoute(
  "thinking.spaces.create",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{
      root_question_text?: string;
      source_time_doubt_id?: string;
      client_space_id?: string;
      client_parking_track_id?: string;
      client_updated_at?: string;
      client_mutation_id?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    if (!body || typeof body.root_question_text !== "string") return errorJson(400, "root_question_text is required");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const rootText = collapseWhitespace(body.root_question_text);
    if (!rootText) return errorJson(400, "root_question_text cannot be empty");

    const state = {
      created: false,
      overLimit: false,
      createdAt: null as string | null,
      spaceId: null as string | null,
      converted: false,
      normalizedRootQuestionText: null as string | null,
      createdAsStatement: false,
      suggestedQuestions: [] as string[],
      questionSuggestion: null as string | null
    };

    await updateDbScoped(["thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createThinkingSpace(
        db,
        userId,
        rootText,
        typeof body.source_time_doubt_id === "string" ? body.source_time_doubt_id : null,
        {
          clientSpaceId: typeof body.client_space_id === "string" ? body.client_space_id : null,
          clientParkingTrackId: typeof body.client_parking_track_id === "string" ? body.client_parking_track_id : null,
          clientUpdatedAt
        }
      );

      if (!result) return;
      state.created = true;
      if (result.over_limit) {
        state.overLimit = true;
        return;
      }
      state.spaceId = result.space.id;
      state.createdAt = result.space.created_at;
      state.converted = result.converted;
      state.normalizedRootQuestionText = result.space.root_question_text;
      state.createdAsStatement = result.created_as_statement === true;
      state.suggestedQuestions = Array.isArray(result.suggested_questions) ? result.suggested_questions : [];
      state.questionSuggestion = typeof result.question_suggestion === "string" ? result.question_suggestion : null;
    });

    if (!state.created) return errorJson(400, "invalid input");
    if (state.overLimit) return errorJson(409, "active spaces reached limit");

    return okJson(
      {
        space_id: state.spaceId,
        updated_at: state.createdAt,
        converted: state.converted,
        normalized_question_text: state.normalizedRootQuestionText,
        created_as_statement: state.createdAsStatement,
        suggested_questions: state.suggestedQuestions,
        question_suggestion: state.questionSuggestion,
        client_mutation_id: clientMutationId
      },
      { status: 201 }
    );
  },
  { rateLimit: { bucket: "thinking-space-create", max: 40, windowMs: 60 * 1000 } }
);
