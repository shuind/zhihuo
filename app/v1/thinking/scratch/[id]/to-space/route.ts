import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { convertScratchToSpace } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.scratch.to_space",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await parseJsonBody<{ client_mutation_id?: string; client_updated_at?: string }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let result: ReturnType<typeof convertScratchToSpace> = { kind: "not_found" } as ReturnType<typeof convertScratchToSpace>;
    await updateDbScoped(["thinking_scratch", "thinking_spaces", "thinking_space_meta"], (db) => {
      result = convertScratchToSpace(db, userId, params.id);
    });

    if (result.kind === "not_found") return errorJson(404, "scratch not found");
    if (result.kind === "not_available") return errorJson(409, "scratch is no longer available");
    if (result.kind === "invalid") return errorJson(400, "invalid scratch content");
    if (result.kind === "over_limit") return errorJson(409, "active spaces reached limit");

    return okJson({
      ok: true,
      space_id: result.space.id,
      converted: result.converted,
      updated_at: result.space.created_at ?? clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-scratch-to-space", max: 80, windowMs: 60 * 1000 } }
);
