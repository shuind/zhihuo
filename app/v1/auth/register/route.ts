import { NextRequest, NextResponse } from "next/server";

import { createSessionToken, getAuthCookieName, hashPassword, verifyEmailVerificationCode } from "@/lib/server/auth";
import { updateDb } from "@/lib/server/db";
import { errorJson, parseJsonBody } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createId, nowIso } from "@/lib/server/utils";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const POST = withApiRoute(
  "auth.register",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ email?: string; password?: string; code?: string }>(request);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!email || !email.includes("@")) return errorJson(400, "邮箱格式不正确");
    if (password.length < 8) return errorJson(400, "密码至少 8 位");
    if (!/^\d{6}$/.test(code)) return errorJson(400, "请输入6位验证码");

    let createdUserId: string | null = null;
    let verifyError = "";
    await updateDb((db) => {
      const exists = db.users.some((user) => user.email === email && !user.deleted_at);
      if (exists) {
        verifyError = "邮箱已存在";
        return;
      }
      const now = Date.now();
      const verification = [...db.email_verification_codes]
        .filter((item) => item.email === email && item.purpose === "register" && !item.consumed_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (!verification) {
        verifyError = "请先获取验证码";
        return;
      }
      if (new Date(verification.expires_at).getTime() <= now) {
        verifyError = "验证码已过期";
        return;
      }
      if (!verifyEmailVerificationCode(email, "register", code, verification.code_hash)) {
        verifyError = "验证码错误";
        return;
      }
      createdUserId = createId();
      db.users.push({
        id: createdUserId,
        email,
        password_hash: hashPassword(password),
        created_at: nowIso(),
        deleted_at: null
      });
      db.audit_logs.push({
        id: createId(),
        user_id: createdUserId,
        action: "register",
        target_type: "user",
        target_id: createdUserId,
        detail: "user registered",
        created_at: nowIso()
      });
      verification.consumed_at = nowIso();
    });

    if (!createdUserId) return errorJson(verifyError === "邮箱已存在" ? 409 : 400, verifyError || "注册失败");
    const token = createSessionToken(createdUserId);
    const response = NextResponse.json({ ok: true, user_id: createdUserId });
    response.cookies.set(getAuthCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  },
  { rateLimit: { bucket: "auth-register", max: 8, windowMs: 10 * 60 * 1000 } }
);
