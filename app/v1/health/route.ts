import { NextRequest } from "next/server";

import { getAuthSecretStatus } from "@/lib/server/auth";
import { readDb } from "@/lib/server/db";
import { errorJson, okJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const GET = withApiRoute("system.health", async (_request: NextRequest) => {
  try {
    await readDb();
    const auth = getAuthSecretStatus();
    return okJson({
      ok: true,
      service: "zhihuo",
      env: process.env.NODE_ENV ?? "development",
      time: new Date().toISOString(),
      auth: {
        source: auth.source,
        runtime_store_exists: auth.runtime_store_exists,
        previous_secret_count: auth.previous_secret_count
      }
    });
  } catch {
    return errorJson(503, "service unavailable");
  }
});
