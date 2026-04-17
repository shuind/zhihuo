import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, okJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const GET = withApiRoute("system.health", async (_request: NextRequest) => {
  try {
    await readDb();
    return okJson({
      ok: true,
      service: "zhihuo",
      env: process.env.NODE_ENV ?? "development",
      time: new Date().toISOString()
    });
  } catch {
    return errorJson(503, "service unavailable");
  }
});
