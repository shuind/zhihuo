import { NextRequest } from "next/server";

import { updateDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { setNodeImageAsset } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

export const POST = withApiRoute(
  "thinking.nodes.image",
  async (request: NextRequest, { params }: { params: { nodeId: string } }) => {
    const body = await parseJsonBody<{ image_asset_id?: string | null; client_mutation_id?: string; client_updated_at?: string }>(
      request
    );
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    let kind: "ok" | "not_found" | "readonly" | "asset_not_found" = "not_found";
    let imageAssetId: string | null = null;
    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes", "thinking_media_assets"], (db) => {
      const result = setNodeImageAsset(db, userId, params.nodeId, typeof body?.image_asset_id === "string" ? body.image_asset_id : null);
      kind = result.kind;
      if (result.kind === "ok") imageAssetId = result.node.image_asset_id ?? null;
    });

    if (kind === "not_found") return errorJson(404, "node not found");
    if (kind === "readonly") return errorJson(409, "space is not active");
    if (kind === "asset_not_found") return errorJson(404, "media asset not found");

    return okJson({
      ok: true,
      node_id: params.nodeId,
      image_asset_id: imageAssetId,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-node-image", max: 120, windowMs: 60 * 1000 } }
);
