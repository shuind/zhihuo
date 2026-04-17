import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { setSpaceStatus } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.status",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ status?: string; client_mutation_id?: string; client_updated_at?: string }>(request);
    const status = body?.status;
    if (status !== "active" && status !== "hidden") {
      return errorJson(400, "status only supports active|hidden");
    }

    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "over_limit" = "not_found";
    let nextStatus: string | null = null;
    await updateDbScoped(["thinking_spaces"], (db) => {
      const result = setSpaceStatus(db, userId, params.spaceId, status);
      kind = result.kind;
      if (result.kind === "ok") nextStatus = result.space.status;
    });

    if (kind === "not_found") return errorJson(404, "space not found");
    if (kind === "over_limit") return errorJson(409, "active spaces reached limit");
    return okJson({
      ok: true,
      status: nextStatus,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-status", max: 60, windowMs: 60 * 1000 } }
);
