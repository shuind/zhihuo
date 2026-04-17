import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { feedScratchToTime } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.scratch.feed_to_time",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: ReturnType<typeof feedScratchToTime> = { kind: "not_found" } as ReturnType<typeof feedScratchToTime>;
    await updateDbScoped(["thinking_scratch", "doubts"], (db) => {
      result = feedScratchToTime(db, userId, params.id);
    });

    if (result.kind === "not_found") return errorJson(404, "scratch not found");
    if (result.kind === "not_available") return errorJson(409, "scratch is no longer available");
    if (result.kind === "invalid") return errorJson(400, "invalid scratch content");
    return okJson({
      ok: true,
      doubt_id: result.doubt.id,
      created: result.created,
      updated_at: result.doubt.created_at ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-scratch-feed-to-time", max: 120, windowMs: 60 * 1000 } }
);
