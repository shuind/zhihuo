import { NextRequest } from "next/server";

import { readUserDb } from "@/lib/server/db";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getUserLastSequence, getUserRevision, listUserSyncRepairItems } from "@/lib/server/store";

export const GET = withApiRoute("sync.state.get", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readUserDb(userId, ["user_sync_state", "sync_repair_items"]);
  const serverTime = new Date().toISOString();
  const repairCount = listUserSyncRepairItems(db, userId).length;
  return okJson({
    revision: getUserRevision(db, userId),
    lastSequence: getUserLastSequence(db, userId),
    repairCount,
    server_time: serverTime,
    serverTime: serverTime
  });
});
