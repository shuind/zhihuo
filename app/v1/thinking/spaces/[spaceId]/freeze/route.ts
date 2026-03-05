import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { freezeSpace } from "@/lib/server/store";

export const POST = withApiRoute(
  "thinking.spaces.freeze",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ user_freeze_note?: string }>(request);
    const note = typeof body?.user_freeze_note === "string" ? body.user_freeze_note : null;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    let found = false;
    let response: { space_id: string; status: string; frozen_at: string | null; user_freeze_note: string | null } | null = null;
    await updateDb((db) => {
      const result = freezeSpace(db, userId, params.spaceId, note);
      if (!result) return;
      found = true;
      response = {
        space_id: result.space.id,
        status: result.space.status,
        frozen_at: result.space.frozen_at,
        user_freeze_note: result.freeze_note ?? null
      };
    });
    if (!found || !response) return errorJson(404, "空间不存在");
    return okJson(response);
  },
  { rateLimit: { bucket: "thinking-space-freeze", max: 30, windowMs: 60 * 1000 } }
);
