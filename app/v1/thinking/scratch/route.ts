import { NextRequest } from "next/server";

import { readDb, updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { createThinkingScratch, listThinkingScratch } from "@/lib/server/store";
import { collapseWhitespace } from "@/lib/server/utils";

export const GET = withApiRoute("thinking.scratch.list", async (request: NextRequest) => {
  const userId = getUserId(request);
  if (!userId) return unauthorizedJson();
  const db = await readDb();
  return okJson({ scratch: listThinkingScratch(db, userId) });
});

export const POST = withApiRoute(
  "thinking.scratch.create",
  async (request: NextRequest) => {
    const body = await parseJsonBody<{ raw_text?: string }>(request);
    if (typeof body?.raw_text !== "string") return errorJson(400, "缺少 raw_text");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const rawText = collapseWhitespace(body.raw_text);
    if (!rawText) return errorJson(400, "内容不能为空");

    let scratch = null;
    await updateDb((db) => {
      scratch = createThinkingScratch(db, userId, rawText);
    });

    if (!scratch) return errorJson(400, "内容不能为空");
    return okJson({ scratch }, { status: 201 });
  },
  { rateLimit: { bucket: "thinking-scratch-create", max: 120, windowMs: 60 * 1000 } }
);
