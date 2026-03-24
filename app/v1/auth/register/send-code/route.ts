import { NextRequest, NextResponse } from "next/server";

import { generateEmailVerificationCode, hashEmailVerificationCode } from "@/lib/server/auth";
import { updateDb } from "@/lib/server/db";
import { errorJson, parseJsonBody } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { sendRegisterVerificationCode } from "@/lib/server/mail";
import { createId, nowIso } from "@/lib/server/utils";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function shouldBypassEmailSendInCi() {
  return process.env.CI === "true";
}

export const POST = withApiRoute(
  "auth.register.send_code",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ email?: string }>(request);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (!email || !email.includes("@")) return errorJson(400, "邮箱格式不正确");

    let canSend = true;
    let sendCount = 1;
    await updateDb((db) => {
      const exists = db.users.some((user) => user.email === email && !user.deleted_at);
      if (exists) {
        canSend = false;
        return;
      }

      const now = Date.now();
      const active = db.email_verification_codes.find(
        (item) => item.email === email && item.purpose === "register" && !item.consumed_at && new Date(item.expires_at).getTime() > now
      );
      if (active && now - new Date(active.last_sent_at).getTime() < 60_000) {
        canSend = false;
        return;
      }

      sendCount = (active?.send_count ?? 0) + 1;
    });

    if (!canSend) return errorJson(409, "请稍后再试或邮箱已存在");

    const code = generateEmailVerificationCode();
    if (!shouldBypassEmailSendInCi()) {
      try {
        await sendRegisterVerificationCode(email, code);
      } catch {
        return errorJson(500, "验证码发送失败");
      }
    }

    await updateDb((db) => {
      db.email_verification_codes = db.email_verification_codes.filter(
        (item) => !(item.email === email && item.purpose === "register" && !item.consumed_at)
      );
      db.email_verification_codes.push({
        id: createId(),
        email,
        purpose: "register",
        code_hash: hashEmailVerificationCode(email, "register", code),
        expires_at: minutesFromNow(10),
        consumed_at: null,
        created_at: nowIso(),
        last_sent_at: nowIso(),
        send_count: sendCount
      });
    });

    if (shouldBypassEmailSendInCi()) {
      return NextResponse.json({ ok: true, debug_code: code });
    }
    return NextResponse.json({ ok: true });
  },
  { rateLimit: { bucket: "auth-register-send-code", max: 5, windowMs: 10 * 60 * 1000 } }
);
