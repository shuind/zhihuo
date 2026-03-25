import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { buildUserExportMarkdown } from "@/lib/server/security";
import { createId, nowIso } from "@/lib/server/utils";

export const GET = withApiRoute(
  "system.export",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    const includeLife = request.nextUrl.searchParams.get("include_life") !== "false";
    const includeThinking = request.nextUrl.searchParams.get("include_thinking") !== "false";

    let result: { markdown: string } | null = null;
    await updateDb((db) => {
      const user = db.users.find((item) => item.id === userId && !item.deleted_at);
      if (!user) return;
      result = {
        markdown: buildUserExportMarkdown(db, userId, user.email, {
          includeLife,
          includeThinking
        })
      };
      db.audit_logs.push({
        id: createId(),
        user_id: userId,
        action: "export_full_data",
        target_type: "user",
        target_id: userId,
        detail: `exported markdown: life=${includeLife ? "1" : "0"}, thinking=${includeThinking ? "1" : "0"}`,
        created_at: nowIso()
      });
    });

    if (!result) return errorJson(404, "用户不存在");
    return okJson(result);
  },
  { rateLimit: { bucket: "system-export", max: 20, windowMs: 60 * 1000 } }
);
