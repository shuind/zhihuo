import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceBackground } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.spaces.background",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{
      background_text?: string | null;
      background_asset_ids?: string[];
      background_selected_asset_id?: string | null;
      client_mutation_id?: string;
      client_updated_at?: string;
    }>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const resultRef: { value: ReturnType<typeof updateSpaceBackground> | null } = { value: null };
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_media_assets"], (db) => {
      resultRef.value = updateSpaceBackground(
        db,
        userId,
        params.spaceId,
        typeof body?.background_text === "string" ? body.background_text : null,
        {
          backgroundAssetIds: Array.isArray(body?.background_asset_ids) ? body.background_asset_ids : undefined,
          backgroundSelectedAssetId:
            typeof body?.background_selected_asset_id === "string" ? body.background_selected_asset_id : null
        }
      );
    });

    const result = resultRef.value;
    if (!result) return errorJson(500, "背景更新失败");
    if (result.kind === "not_found") return errorJson(404, "空间不存在");
    if (result.kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (result.kind === "invalid_length") return errorJson(400, "背景说明需在 100-300 字之间");
    if (result.kind === "asset_not_found") return errorJson(404, "背景图片不存在");

    return okJson({
      ok: true,
      background_text: result.background_text,
      background_version: result.background_version,
      background_asset_ids: result.kind === "ok" && "background_asset_ids" in result ? result.background_asset_ids : undefined,
      background_selected_asset_id:
        result.kind === "ok" && "background_selected_asset_id" in result ? result.background_selected_asset_id : undefined,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-background", max: 30, windowMs: 60 * 1000 } }
);
