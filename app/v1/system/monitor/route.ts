import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getSystemMonitorMetrics } from "@/lib/server/store";

export const GET = withApiRoute(
  "system.monitor",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const db = await readDb();
    const metrics = getSystemMonitorMetrics(db);
    return okJson(metrics);
  },
  { rateLimit: { bucket: "system-monitor", max: 60, windowMs: 60 * 1000 } }
);

