import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { resolveUserSyncRepairItem } from "@/lib/server/store";

export const POST = withApiRoute(
  "sync.repair_items.ignore",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let ignoredAt: string | null = null;
    await updateDbScoped(["sync_repair_items"], (db) => {
      const item = resolveUserSyncRepairItem(db, userId, params.id);
      ignoredAt = item?.resolved_at ?? null;
    });

    return okJson({
      ok: true,
      ignored: true,
      ignoredAt
    });
  },
  { rateLimit: { bucket: "sync-repair-items-ignore", max: 120, windowMs: 60 * 1000 } }
);
