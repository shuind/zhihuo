import { NextRequest } from "next/server";

import { readDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { getDoubtDetail } from "@/lib/server/store";

export const GET = withApiRoute(
  "doubts.detail",
  async (request: NextRequest, { params }: { params: { id: string } }) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  const detail = getDoubtDetail(db, userId, params.id);
  if (!detail) return errorJson(404, "doubt not found");
  return okJson(detail);
  }
);
