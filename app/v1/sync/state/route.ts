import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getUserRevision } from "@/lib/server/store";

export const GET = withApiRoute("sync.state.get", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  return okJson({
    revision: getUserRevision(db, userId)
  });
});
