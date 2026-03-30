import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteThinkingScratch } from "@/lib/server/store";
import type { DbState } from "@/lib/server/types";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.scratch.delete",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let scratch: DbState["thinking_scratch"][number] | null = null;
    await updateDbScoped(["thinking_scratch"], (db) => {
      scratch = deleteThinkingScratch(db, userId, params.id);
    });

    if (!scratch) return errorJson(404, "scratch not found");
    const deletedScratch = scratch as DbState["thinking_scratch"][number];
    return okJson({
      ok: true,
      scratch: deletedScratch,
      updated_at: deletedScratch.deleted_at ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-scratch-delete", max: 120, windowMs: 60 * 1000 } }
);
