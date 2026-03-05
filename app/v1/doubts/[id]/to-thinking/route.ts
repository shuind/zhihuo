import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingSpaceFromDoubt } from "@/lib/server/store";

export const POST = withApiRoute(
  "doubts.to_thinking",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  let found = false;
  let overLimit = false;
  let spaceId: string | null = null;
  await updateDb((db) => {
    const result = createThinkingSpaceFromDoubt(db, userId, params.id);
    if (!result) return;
    found = true;
    if (result.over_limit) {
      overLimit = true;
      return;
    }
    spaceId = result.space.id;
  });
  if (!found) return errorJson(404, "doubt not found");
  if (overLimit) return errorJson(409, "active space limit reached");
  return okJson({ space_id: spaceId }, { status: 201 });
  },
  { rateLimit: { bucket: "doubts-to-thinking", max: 60, windowMs: 60 * 1000 } }
);
