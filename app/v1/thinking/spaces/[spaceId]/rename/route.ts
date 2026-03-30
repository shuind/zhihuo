import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceRootQuestion } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.rename",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{
      root_question_text?: string;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

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

    if (kind === "not_found") return errorJson(404, "space not found");
    if (kind === "invalid_empty") return errorJson(400, "space title cannot be empty");
    if (kind === "invalid_length") return errorJson(400, "space title exceeds 220 chars");
    return okJson({
      ok: true,
      root_question_text: rootQuestionText,
      changed,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-rename", max: 30, windowMs: 60 * 1000 } }
);
