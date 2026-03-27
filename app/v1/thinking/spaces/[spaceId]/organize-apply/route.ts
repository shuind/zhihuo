import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { organizeSpaceApply } from "@/lib/server/store";

type ApplyMove = {
  node_id?: string;
  target_track_id?: string;
};

export const POST = withApiRoute(
  "thinking.spaces.organize_apply",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ from_order_index?: number; moves?: ApplyMove[] }>(request);
    const rawMoves = Array.isArray(body?.moves) ? body.moves : [];
    const moves = rawMoves
      .map((item) => ({
        node_id: typeof item.node_id === "string" ? item.node_id : "",
        target_track_id: typeof item.target_track_id === "string" ? item.target_track_id : ""
      }))
      .filter((item) => item.node_id && item.target_track_id);
    const fromOrderIndex = Number.isFinite(body?.from_order_index) ? Number(body?.from_order_index) : undefined;

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let found = false;
    let readonly = false;
    let movedCount = 0;
    let movedNodeIds: string[] = [];
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = organizeSpaceApply(db, userId, params.spaceId, moves, fromOrderIndex);
      if (!result) return;
      found = true;
      if (result.kind === "readonly") {
        readonly = true;
        return;
      }
      movedCount = result.moved_count;
      movedNodeIds = result.moved_node_ids;
    });

    if (!found) return errorJson(404, "空间不存在");
    if (readonly) return errorJson(409, "空间不是进行中状态");
    return okJson({
      moved_count: movedCount,
      moved_node_ids: movedNodeIds
    });
  },
  { rateLimit: { bucket: "thinking-space-organize-apply", max: 90, windowMs: 60 * 1000 } }
);
