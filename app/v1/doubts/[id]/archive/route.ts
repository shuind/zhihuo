import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { archiveDoubt } from "@/lib/server/store";

export const POST = withApiRoute(
  "doubts.archive",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  let found = false;
  let archivedAt: string | null = null;
  await updateDb((db) => {
    const doubt = archiveDoubt(db, userId, params.id);
    if (!doubt) return;
    found = true;
    archivedAt = doubt.archived_at ?? null;
  });
  if (!found) return errorJson(404, "doubt not found");
  return okJson({ ok: true, archived_at: archivedAt, is_archived: Boolean(archivedAt) });
  },
  { rateLimit: { bucket: "doubts-archive", max: 120, windowMs: 60 * 1000 } }
);
