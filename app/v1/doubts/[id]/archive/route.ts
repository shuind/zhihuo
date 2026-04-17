import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { archiveDoubt } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "doubts.archive",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let archivedAt: string | null = null;
    await updateDbScoped(["doubts"], (db) => {
      const doubt = archiveDoubt(db, userId, params.id);
      if (!doubt) return;
      found = true;
      archivedAt = doubt.archived_at ?? null;
    });

    if (!found) return errorJson(404, "doubt not found");
    return okJson({
      ok: true,
      archived_at: archivedAt,
      is_archived: Boolean(archivedAt),
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "doubts-archive", max: 120, windowMs: 60 * 1000 } }
);
