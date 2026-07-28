import { NextRequest } from "next/server";

import { canImportUserData } from "@/lib/capabilities";
import { updateUserDbScoped } from "@/lib/server/db";
import { ALL_USER_SCOPED_TABLES } from "@/lib/server/db/postgres-scope";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { normalizeUserImportPayload, validateUserImportReferences } from "@/lib/server/import-payload";
import { writeThinkingMediaAssetFile } from "@/lib/server/media";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import { getUserRevision, replaceLifeSnapshot, replaceThinkingSnapshot } from "@/lib/server/store";
import { createId, nowIso } from "@/lib/server/utils";

type ImportBody = {
  payload?: unknown;
  checksum?: string;
  mode?: "replace";
};

function detectSuspiciousThinkingReplace(
  existing: {
    spaceIds: Set<string>;
    nodeCountBySpace: Map<string, number>;
    totalNodeCount: number;
  },
  incoming: {
    spaces: Parameters<typeof replaceThinkingSnapshot>[2]["spaces"];
    nodes: Parameters<typeof replaceThinkingSnapshot>[2]["nodes"];
  }
) {
  const incomingSpaces = Array.isArray(incoming.spaces) ? incoming.spaces : [];
  const incomingNodes = Array.isArray(incoming.nodes) ? incoming.nodes : [];
  const incomingNodeCountBySpace = new Map<string, number>();

  for (const node of incomingNodes) {
    if (typeof node.spaceId !== "string" || !node.spaceId) continue;
    incomingNodeCountBySpace.set(node.spaceId, (incomingNodeCountBySpace.get(node.spaceId) ?? 0) + 1);
  }

  if (existing.totalNodeCount > 0 && incomingSpaces.length > 0 && incomingNodes.length === 0) {
    return "本地快照不完整，已阻止覆盖云端数据";
  }

  for (const space of incomingSpaces) {
    if (typeof space.id !== "string" || !space.id || !existing.spaceIds.has(space.id)) continue;
    const existingNodeCount = existing.nodeCountBySpace.get(space.id) ?? 0;
    const incomingNodeCount = incomingNodeCountBySpace.get(space.id) ?? 0;
    if (existingNodeCount > 0 && incomingNodeCount === 0) {
      return "本地思路空间未完整加载，已阻止覆盖云端数据";
    }
  }

  return null;
}

export const POST = withApiRoute(
  "system.import",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<ImportBody>(request);
    if (!body || body.mode !== "replace") return errorJson(400, "mode must be 'replace'");

    const integrity = verifyUserExportIntegrity(body.payload, body.checksum);
    if (!integrity.ok) return errorJson(400, integrity.reason);

    const payload = normalizeUserImportPayload(body.payload, userId);
    const refs = validateUserImportReferences(payload);
    if (!refs.ok) return errorJson(400, `reference check failed: ${JSON.stringify(refs.broken)}`);

    let replaced: { life: number; thinking: number; scratch: number } | null = null;
    let revision: number | null = null;
    let importError: string | null = null;
    await updateUserDbScoped(userId, ALL_USER_SCOPED_TABLES, async (db) => {
      const user = db.users.find((item) => item.id === userId && !item.deleted_at);
      if (!canImportUserData(user)) return;

      const existingSpaces = db.thinking_spaces.filter((item) => item.user_id === userId);
      const existingSpaceIds = new Set(existingSpaces.map((item) => item.id));
      const existingNodeCountBySpace = new Map<string, number>();
      let existingTotalNodeCount = 0;
      for (const node of db.thinking_nodes) {
        if (!existingSpaceIds.has(node.space_id)) continue;
        existingTotalNodeCount += 1;
        existingNodeCountBySpace.set(node.space_id, (existingNodeCountBySpace.get(node.space_id) ?? 0) + 1);
      }

      importError = detectSuspiciousThinkingReplace(
        {
          spaceIds: existingSpaceIds,
          nodeCountBySpace: existingNodeCountBySpace,
          totalNodeCount: existingTotalNodeCount
        },
        {
          spaces: payload.thinking.spaces,
          nodes: payload.thinking.nodes
        }
      );
      if (importError) return;

      replaceLifeSnapshot(db, userId, payload.life);
      replaceThinkingSnapshot(db, userId, payload.thinking);
      for (const asset of payload.mediaFiles) {
        await writeThinkingMediaAssetFile(userId, asset.assetId, Buffer.from(asset.contentBase64, "base64"));
      }

      replaced = {
        life: (payload.life.doubts?.length ?? 0) + (payload.life.notes?.length ?? 0),
        thinking:
          payload.thinking.spaces.length +
          payload.thinking.nodes.length +
          payload.thinking.spaceMeta.length +
          (payload.thinking.nodeLinks?.length ?? 0) +
          (payload.thinking.mediaAssets?.length ?? 0) +
          Object.values(payload.thinking.inbox).reduce((sum, list) => sum + list.length, 0),
        scratch: payload.thinking.scratch?.length ?? 0
      };

      db.audit_logs.push({
        id: createId(),
        user_id: userId,
        action: "import_full_data",
        target_type: "user",
        target_id: userId,
        detail: `replaced full payload: life=${replaced.life}, thinking=${replaced.thinking}, scratch=${replaced.scratch}`,
        created_at: nowIso()
      });
      revision = getUserRevision(db, userId);
    });

    if (importError) return errorJson(409, importError);
    if (!replaced) return unauthorizedJson();

    return okJson({
      ok: true,
      importedAt: nowIso(),
      replaced,
      revision
    });
  },
  { rateLimit: { bucket: "system-import", max: 8, windowMs: 60 * 1000 } }
);
