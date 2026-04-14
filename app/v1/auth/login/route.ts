import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, getAuthCookieName, getAuthCookieOptions, verifyPassword } from "@/lib/server/auth";
import { readDb, updateDb } from "@/lib/server/db";
import { errorJson, parseJsonBody } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createId, nowIso } from "@/lib/server/utils";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const POST = withApiRoute(
  "auth.login",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ email?: string; password?: string }>(request);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return errorJson(400, "邮箱和密码不能为空");

    const db = await readDb();
    const user = db.users.find((item) => item.email === email && !item.deleted_at);
    if (!user) return errorJson(401, "账号或密码错误");
    if (!verifyPassword(password, user.password_hash)) return errorJson(401, "账号或密码错误");

    await updateDb((nextDb) => {
      nextDb.audit_logs.push({
        id: createId(),
        user_id: user.id,
        action: "login",
        target_type: "user",
        target_id: user.id,
        detail: "login success",
        created_at: nowIso()
      });
    });

    const token = createSessionToken(user.id);
    const response = NextResponse.json({ ok: true, user_id: user.id });
    response.cookies.set(getAuthCookieName(), token, getAuthCookieOptions(request, 60 * 60 * 24 * 30));
    return response;
  },
  { rateLimit: { bucket: "auth-login", max: 20, windowMs: 10 * 60 * 1000 } }
);
