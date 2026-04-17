import { NextRequest } from "next/server";

import { recordApkDownload } from "@/lib/server/counters";
import { errorJson, okJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const POST = withApiRoute("apk.download_count.increment", async (_request: NextRequest) => {
  try {
    const total = await recordApkDownload();
    return okJson({ total });
  } catch {
    return errorJson(503, "service unavailable");
  }
});
