import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const GET = withApiRoute("auth.me", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) return unauthorizedJson();
  return okJson({ user_id: user.id, email: user.email });
});
