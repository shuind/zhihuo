import { NextRequest, NextResponse } from "next/server";

import { hashPassword, verifyEmailVerificationCode } from "@/lib/server/auth";
import { updateDb } from "@/lib/server/db";
import { errorJson, parseJsonBody } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createId, nowIso } from "@/lib/server/utils";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

const RESET_FAILED_MESSAGE = "重置失败，请检查邮箱、验证码和密码";

export const POST = withApiRoute(
  "auth.password.reset",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ email?: string; code?: string; newPassword?: string }>(request);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!email || !email.includes("@")) return errorJson(400, "邮箱格式不正确");
    if (!/^\d{6}$/.test(code)) return errorJson(400, "请输入6位验证码");
    if (newPassword.length < 8) return errorJson(400, "密码至少 8 位");

    let resetOk = false;
    await updateDb((db) => {
      const user = db.users.find((item) => item.email === email && !item.deleted_at);
      if (!user) return;

      const now = Date.now();
      const verification = [...db.email_verification_codes]
        .filter((item) => item.email === email && item.purpose === "reset_password" && !item.consumed_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (!verification) return;
      if (new Date(verification.expires_at).getTime() <= now) return;
      if (!verifyEmailVerificationCode(email, "reset_password", code, verification.code_hash)) return;

      user.password_hash = hashPassword(newPassword);
      verification.consumed_at = nowIso();
      db.audit_logs.push({
        id: createId(),
        user_id: user.id,
        action: "password_reset",
        target_type: "user",
        target_id: user.id,
        detail: "user reset password",
        created_at: nowIso()
      });
      resetOk = true;
    });

    if (!resetOk) return errorJson(400, RESET_FAILED_MESSAGE);
    return NextResponse.json({ ok: true });
  },
  { rateLimit: { bucket: "auth-password-reset", max: 10, windowMs: 10 * 60 * 1000 } }
);
