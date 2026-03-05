import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { deleteDoubt } from "@/lib/server/store";

export const POST = withApiRoute(
  "doubts.delete",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  let deleted = false;
  await updateDb((db) => {
    deleted = deleteDoubt(db, userId, params.id);
  });
  if (!deleted) return errorJson(404, "doubt not found");
  return okJson({ ok: true });
  },
  { rateLimit: { bucket: "doubts-delete", max: 30, windowMs: 60 * 1000 } }
);
