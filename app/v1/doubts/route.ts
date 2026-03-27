import { NextRequest } from "next/server";

import { readDb, updateDb, updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createDoubt, listDoubts } from "@/lib/server/store";
import { parseBoolean } from "@/lib/server/utils";

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
  const body = await parseJsonBody<{ raw_text?: string; layer?: string }>(request);
  if (!body || typeof body.raw_text !== "string") return errorJson(400, "raw_text is required");
  if (body.layer && body.layer !== "life") return errorJson(400, "layer 仅支持 life");

  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  let createdId: string | null = null;
  await updateDbScoped(["doubts"], (db) => {
    const created = createDoubt(db, userId, body.raw_text ?? "");
    createdId = created?.id ?? null;
  });
  if (!createdId) return errorJson(400, "内容不能为空");
  return okJson({ doubt_id: createdId }, { status: 201 });
  },
  { rateLimit: { bucket: "doubts-create", max: 60, windowMs: 60 * 1000 } }
);
