import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getThinkingSnapshot } from "@/lib/server/store";

export const GET = withApiRoute("thinking.snapshot.get", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  const snapshot = getThinkingSnapshot(db, userId);
  return okJson(snapshot);
});

export const POST = withApiRoute("thinking.snapshot.post", async () => {
  return errorJson(410, "快照写入已弃用，请改用 /v1/thinking/* 行为路由");
});
