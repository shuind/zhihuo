import { NextRequest, NextResponse } from "next/server";

import { generateEmailVerificationCode, hashEmailVerificationCode } from "@/lib/server/auth";
import { updateDb } from "@/lib/server/db";
import { errorJson, parseJsonBody } from "@/lib/server/http";
import { logWarn, withApiRoute } from "@/lib/server/observability";
import { sendPasswordResetVerificationCode } from "@/lib/server/mail";
import { createId, nowIso } from "@/lib/server/utils";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function okResponse() {
  return NextResponse.json({ ok: true });
}

export const POST = withApiRoute(
  "auth.password.send_reset_code",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ email?: string }>(request);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (!email || !email.includes("@")) return errorJson(400, "邮箱格式不正确");

    const sendPlan: { code: string | null; recordId: string | null } = { code: null, recordId: null };
    await updateDb((db) => {
      const user = db.users.find((item) => item.email === email && !item.deleted_at);
      if (!user) return;

      const now = Date.now();
      const active = [...db.email_verification_codes]
        .filter(
          (item) =>
            item.email === email &&
            item.purpose === "reset_password" &&
            !item.consumed_at &&
            new Date(item.expires_at).getTime() > now
        )
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (active && now - new Date(active.last_sent_at).getTime() < 60_000) {
        return;
      }

      const code = generateEmailVerificationCode();
      const recordId = createId();
      const createdAt = nowIso();

      db.email_verification_codes = db.email_verification_codes.filter(
        (item) => !(item.email === email && item.purpose === "reset_password" && !item.consumed_at)
      );
      db.email_verification_codes.push({
        id: recordId,
        email,
        purpose: "reset_password",
        code_hash: hashEmailVerificationCode(email, "reset_password", code),
        expires_at: minutesFromNow(10),
        consumed_at: null,
        created_at: createdAt,
        last_sent_at: createdAt,
        send_count: (active?.send_count ?? 0) + 1
      });

      sendPlan.code = code;
      sendPlan.recordId = recordId;
    });

    if (!sendPlan.code || !sendPlan.recordId) return okResponse();
    const sendCode = sendPlan.code;
    const sendRecordId = sendPlan.recordId;

    try {
      await sendPasswordResetVerificationCode(email, sendCode);
    } catch (error) {
      logWarn("auth.password.send_reset_code.mail_failed", {
        email,
        error: error instanceof Error ? error.message : String(error)
      });
      try {
        await updateDb((db) => {
          db.email_verification_codes = db.email_verification_codes.filter((item) => item.id !== sendRecordId);
        });
      } catch (cleanupError) {
        logWarn("auth.password.send_reset_code.cleanup_failed", {
          email,
          recordId: sendRecordId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
      }
    }

    return okResponse();
  },
  { rateLimit: { bucket: "auth-password-send-reset-code", max: 5, windowMs: 10 * 60 * 1000 } }
);
