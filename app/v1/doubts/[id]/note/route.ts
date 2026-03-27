import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { upsertDoubtNote } from "@/lib/server/store";

export const POST = withApiRoute(
  "doubts.note",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
  const body = await parseJsonBody<{ note_text?: string }>(request);
  if (!body || typeof body.note_text !== "string") return errorJson(400, "note_text is required");

  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  let found = false;
  let deleted = false;
  let noteId: string | null = null;
  await updateDbScoped(["doubts", "doubt_notes"], (db) => {
    const result = upsertDoubtNote(db, userId, params.id, body.note_text ?? "");
    if (!result) return;
    found = true;
    deleted = result.deleted;
    noteId = result.deleted ? null : result.note.id;
  });
  if (!found) return errorJson(404, "doubt not found");
  if (deleted) return okJson({ deleted: true });
  return okJson({ note_id: noteId });
  },
  { rateLimit: { bucket: "doubts-note", max: 90, windowMs: 60 * 1000 } }
);
