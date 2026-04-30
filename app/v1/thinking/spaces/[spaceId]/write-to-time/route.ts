import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { writeSpaceToTime } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.write_to_time",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{
      note_text?: string;
      freeze_note?: string;
      preserve_original_time?: boolean;
      client_doubt_id?: string;
      letter_title?: string | null;
      letter_lines?: string[];
      letter_variant?: string | null;
      letter_seal_text?: string | null;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const noteText =
      typeof body?.note_text === "string" ? body.note_text : typeof body?.freeze_note === "string" ? body.freeze_note : undefined;
    const preserveOriginalTime = body?.preserve_original_time !== false;
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let resultKind = "not_found";
    let spaceId: string | null = null;
    let doubtId: string | null = null;
    let writtenAt: string | null = null;

    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes", "doubts"], (db) => {
      const written = writeSpaceToTime(db, userId, params.spaceId, noteText, {
        preserveOriginalTime,
        clientDoubtId: typeof body?.client_doubt_id === "string" ? body.client_doubt_id : null,
        letterTitle: typeof body?.letter_title === "string" ? body.letter_title : null,
        letterLines: Array.isArray(body?.letter_lines) ? body.letter_lines : null,
        letterVariant: typeof body?.letter_variant === "string" ? body.letter_variant : null,
        letterSealText: typeof body?.letter_seal_text === "string" ? body.letter_seal_text : null
      });
      resultKind = written.kind;
      if (written.kind !== "ok") return;
      spaceId = written.space.id;
      doubtId = written.doubt.id;
      writtenAt = written.doubt.created_at;
    });

    if (resultKind === "readonly") return errorJson(409, "space has already been settled");
    if (resultKind === "invalid") return errorJson(400, "failed to settle to time");
    if (resultKind === "not_found" || !spaceId || !doubtId || !writtenAt) return errorJson(404, "space not found");

    return okJson({
      ok: true,
      space_id: spaceId,
      doubt_id: doubtId,
      written_at: writtenAt,
      status: "hidden",
      updated_at: writtenAt ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-write-to-time", max: 30, windowMs: 60 * 1000 } }
);
