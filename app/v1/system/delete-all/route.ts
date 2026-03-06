import { NextRequest } from "next/server";

import { getAuthCookieName } from "@/lib/server/auth";
import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteAllUserData } from "@/lib/server/store";

type DeleteBody = {
  confirm_text?: string;
  reason?: string;
};

export const POST = withApiRoute(
  "system.delete_all",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<DeleteBody>(request);
    if (!body || body.confirm_text !== "DELETE ALL") {
      return errorJson(400, "confirm_text must be 'DELETE ALL'");
    }

    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 120) : "user requested";
    let deleted: ReturnType<typeof deleteAllUserData> = null;
    await updateDb((db) => {
      deleted = deleteAllUserData(db, userId, reason);
    });
    if (!deleted) return errorJson(404, "用户不存在");

    const response = okJson({ ok: true, deleted });
    response.cookies.set(getAuthCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });
    return response;
  },
  { rateLimit: { bucket: "system-delete-all", max: 3, windowMs: 10 * 60 * 1000 } }
);
