import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getSpaceView, getUserSyncSnapshot } from "@/lib/server/store";

export const GET = withApiRoute("sync.snapshot.get", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  const snapshot = getUserSyncSnapshot(db, userId);
  if (!snapshot) return errorJson(404, "用户不存在");

  const thinkingViews = Object.fromEntries(
    snapshot.thinking.spaces
      .map((space) => [space.id, getSpaceView(db, userId, space.id)] as const)
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof getSpaceView>>] => Boolean(entry[1]))
  );

  return okJson({
    revision: snapshot.revision,
    lastSequence: snapshot.lastSequence,
    repairItems: snapshot.repairItems.map((item) => ({
      id: item.id,
      clientMutationId: item.client_mutation_id,
      op: item.op,
      payload: item.payload,
      reason: item.reason,
      destinationClass: item.destination_class,
      originalTargetId: item.original_target_id,
      createdAt: item.created_at
    })),
    life: snapshot.life,
    thinking: snapshot.thinking,
    thinking_views: thinkingViews
  });
});
