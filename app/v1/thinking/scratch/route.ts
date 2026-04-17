import { NextRequest } from "next/server";

import { readDb, updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingScratch, listThinkingScratch } from "@/lib/server/store";
import { collapseWhitespace } from "@/lib/server/utils";

export const GET = withApiRoute("thinking.scratch.list", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  return okJson({ scratch: listThinkingScratch(db, userId) });
});

export const POST = withApiRoute(
  "thinking.scratch.create",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{
      raw_text?: string;
      client_entity_id?: string;
      client_updated_at?: string;
      client_mutation_id?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    if (typeof body?.raw_text !== "string") return errorJson(400, "raw_text is required");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const rawText = collapseWhitespace(body.raw_text);
    if (!rawText) return errorJson(400, "raw_text cannot be empty");

    const resultBox: { scratch: ReturnType<typeof createThinkingScratch> } = { scratch: null };
    await updateDbScoped(["thinking_scratch"], (db) => {
      resultBox.scratch = createThinkingScratch(db, userId, rawText, {
        clientEntityId: typeof body.client_entity_id === "string" ? body.client_entity_id : null,
        clientUpdatedAt
      });
    });

    const scratch = resultBox.scratch;
    if (!scratch) return errorJson(500, "failed to create scratch");

    return okJson(
      {
        scratch,
        updated_at: scratch.updated_at,
        client_mutation_id: clientMutationId
      },
      { status: 201 }
    );
  },
  { rateLimit: { bucket: "thinking-scratch-create", max: 120, windowMs: 60 * 1000 } }
);
