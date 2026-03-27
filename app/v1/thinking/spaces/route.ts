import { NextRequest } from "next/server";

import { readDb, updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
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
    const body = await parseJsonBody<{ root_question_text?: string; source_time_doubt_id?: string }>(request);
    if (!body || typeof body.root_question_text !== "string") return errorJson(400, "缺少 root_question_text");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const rootText = collapseWhitespace(body.root_question_text);
    if (!rootText) return errorJson(400, "中心内容不能为空");

    let created = false;
    let overLimit = false;
    let spaceId: string | null = null;
    let converted = false;
    let normalizedRootQuestionText: string | null = null;
    let createdAsStatement = false;
    let suggestedQuestions: string[] = [];
    let questionSuggestion: string | null = null;

    await updateDbScoped(["thinking_spaces", "thinking_space_meta"], (db) => {
      const result = createThinkingSpace(
        db,
        userId,
        rootText,
        typeof body.source_time_doubt_id === "string" ? body.source_time_doubt_id : null
      );
      if (!result) return;
      created = true;
      if (result.over_limit) {
        overLimit = true;
        return;
      }
      spaceId = result.space.id;
      converted = result.converted;
      normalizedRootQuestionText = result.space.root_question_text;
      createdAsStatement = result.created_as_statement === true;
      suggestedQuestions = Array.isArray(result.suggested_questions) ? result.suggested_questions : [];
      questionSuggestion = typeof result.question_suggestion === "string" ? result.question_suggestion : null;
    });

    if (!created) return errorJson(400, "输入内容格式无效");
    if (overLimit) return errorJson(409, "活跃空间已达上限");

    return okJson(
      {
        space_id: spaceId,
        converted,
        normalized_question_text: normalizedRootQuestionText,
        created_as_statement: createdAsStatement,
        suggested_questions: suggestedQuestions,
        question_suggestion: questionSuggestion
      },
      { status: 201 }
    );
  },
  { rateLimit: { bucket: "thinking-space-create", max: 40, windowMs: 60 * 1000 } }
);
