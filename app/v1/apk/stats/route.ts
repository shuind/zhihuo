import { NextRequest } from "next/server";

import { getApkDownloadCount } from "@/lib/server/counters";
import { errorJson, okJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const GET = withApiRoute("apk.stats", async (_request: NextRequest) => {
  try {
    const total = await getApkDownloadCount();
    return okJson({ total });
  } catch {
    return errorJson(503, "service unavailable");
  }
});
