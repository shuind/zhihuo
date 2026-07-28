import { NextRequest } from "next/server";

import { readUserDb } from "@/lib/server/db";
import { setSessionCookie } from "@/lib/server/auth";
import { getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";

export const GET = withApiRoute("auth.me", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readUserDb(userId, []);
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) return unauthorizedJson();
  const response = okJson({ user_id: user.id, email: user.email });
  setSessionCookie(response, request, user.id);
  return response;
});
