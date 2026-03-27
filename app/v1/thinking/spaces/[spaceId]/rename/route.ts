import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceRootQuestion } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.rename",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ root_question_text?: string }>(request);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const nextText = typeof body?.root_question_text === "string" ? body.root_question_text : "";
    let kind: "not_found" | "invalid_empty" | "invalid_length" | "ok" = "not_found";
    let rootQuestionText = "";
    let changed = false;

    await updateDbScoped(["thinking_spaces"], (db) => {
      const result = updateSpaceRootQuestion(db, userId, params.spaceId, nextText);
      kind = result.kind;
      if (result.kind === "ok") {
        rootQuestionText = result.root_question_text;
        changed = result.changed;
      }
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "invalid_empty") return errorJson(400, "空间名不能为空");
    if (kind === "invalid_length") return errorJson(400, "空间名不能超过 220 字");
    return okJson({ ok: true, root_question_text: rootQuestionText, changed });
  },
  { rateLimit: { bucket: "thinking-space-rename", max: 30, windowMs: 60 * 1000 } }
);
