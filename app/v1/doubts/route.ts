import { NextRequest } from "next/server";

import { readDb, updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createDoubt, listDoubts } from "@/lib/server/store";
import { collapseWhitespace, parseBoolean } from "@/lib/server/utils";

export const GET = withApiRoute("doubts.list", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const includeArchived = parseBoolean(request.nextUrl.searchParams.get("include_archived"), false);
  const includeNotes = parseBoolean(request.nextUrl.searchParams.get("include_notes"), false);
  const range = request.nextUrl.searchParams.get("range");
  const db = await readDb();
  const doubts = listDoubts(db, userId, { range, includeArchived });
  if (!includeNotes) return okJson({ doubts });
  const doubtIds = new Set(doubts.map((item) => item.id));
  const notes = db.doubt_notes.filter((note) => doubtIds.has(note.doubt_id));
  return okJson({ doubts, notes });
});

export const POST = withApiRoute(
  "doubts.create",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{
      raw_text?: string;
      layer?: string;
      client_entity_id?: string;
      client_updated_at?: string;
      client_mutation_id?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    if (!body || typeof body.raw_text !== "string") return errorJson(400, "raw_text is required");
    if (body.layer && body.layer !== "life") return errorJson(400, "layer only supports life");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    if (!collapseWhitespace(body.raw_text ?? "")) return errorJson(400, "raw_text cannot be empty");
    const preferredId =
      typeof body.client_entity_id === "string" && body.client_entity_id.trim() ? body.client_entity_id.trim() : null;

    const db = await updateDbScoped(["doubts"], (state) => {
      createDoubt(state, userId, body.raw_text ?? "", {
        clientEntityId: preferredId,
        clientUpdatedAt: clientUpdatedAt
      });
    });

    const createdDoubt = preferredId
      ? db.doubts.find((item) => item.id === preferredId && item.user_id === userId && !item.deleted_at) ?? null
      : db.doubts.find((item) => item.user_id === userId && !item.deleted_at) ?? null;

    if (!createdDoubt) return errorJson(500, "failed to create doubt");

    return okJson(
      {
        doubt_id: createdDoubt.id,
        updated_at: createdDoubt.created_at,
        client_mutation_id: clientMutationId
      },
      { status: 201 }
    );
  },
  { rateLimit: { bucket: "doubts-create", max: 60, windowMs: 60 * 1000 } }
);
