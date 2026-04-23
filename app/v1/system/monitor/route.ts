import { NextRequest } from "next/server";

import { getAuthSecretStatus } from "@/lib/server/auth";
import { readDb, readMonitorTrafficMetrics } from "@/lib/server/db";
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
    const traffic = await readMonitorTrafficMetrics();
    return okJson({
      ...metrics,
      ...traffic,
      auth_runtime: getAuthSecretStatus()
    });
  },
  { rateLimit: { bucket: "system-monitor", max: 60, windowMs: 60 * 1000 } }
);

