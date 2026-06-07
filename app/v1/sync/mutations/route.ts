import { NextRequest } from "next/server";

import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { applySyncMutations, type SyncMutationsBody } from "@/lib/server/sync/mutations";

export const POST = withApiRoute(
  "sync.mutations.post",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<SyncMutationsBody>(request);
    try {
      return okJson(await applySyncMutations(userId, body));
    } catch (error) {
      return errorJson(400, error instanceof Error ? error.message : "failed to apply mutations");
    }
  },
  { rateLimit: { bucket: "sync-mutations", max: 90, windowMs: 60 * 1000 } }
);