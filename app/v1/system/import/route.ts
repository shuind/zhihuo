import { NextRequest } from "next/server";

import { canImportUserData } from "@/lib/capabilities";
import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import { getUserRevision, replaceLifeSnapshot, replaceThinkingSnapshot } from "@/lib/server/store";
import { createId, nowIso } from "@/lib/server/utils";

type ImportBody = {
  payload?: unknown;
  checksum?: string;
  mode?: "replace";
};

type UserExportPayload = {
  life?: {
    doubts?: Array<{
      id?: string;
      raw_text?: string;
      first_node_preview?: string | null;
      last_node_preview?: string | null;
      created_at?: string;
      archived_at?: string | null;
      deleted_at?: string | null;
    }>;
    notes?: Array<{
      id?: string;
      doubt_id?: string;
      note_text?: string;
      created_at?: string;
    }>;
  };
  thinking?: {
    spaces?: Array<{
      id?: string;
      userId?: string;
      rootQuestionText?: string;
      status?: "active" | "hidden";
      createdAt?: string;
      frozenAt?: string | null;
      sourceTimeDoubtId?: string | null;
    }>;
    nodes?: Array<{
      id?: string;
      spaceId?: string;
      parentNodeId?: string | null;
      rawQuestionText?: string;
      noteText?: string | null;
      answerText?: string | null;
      createdAt?: string;
      orderIndex?: number;
      isSuggested?: boolean;
      state?: "normal" | "hidden";
      dimension?: "definition" | "resource" | "risk" | "value" | "path" | "evidence";
    }>;
    space_meta?: Array<{
      spaceId?: string;
      userFreezeNote?: string | null;
      exportVersion?: number;
      backgroundText?: string | null;
      backgroundVersion?: number;
      suggestionDecay?: number;
      lastTrackId?: string | null;
      lastOrganizedOrder?: number;
      parkingTrackId?: string | null;
      pendingTrackId?: string | null;
      emptyTrackIds?: string[];
      milestoneNodeIds?: string[];
      trackDirectionHints?: Record<string, "hypothesis" | "memory" | "counterpoint" | "worry" | "constraint" | "aside" | null>;
    }>;
    node_links?: Array<{
      id?: string;
      spaceId?: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      linkType?: "related";
      score?: number;
      createdAt?: string;
    }>;
    inbox?: Record<string, Array<{ id?: string; rawText?: string; createdAt?: string }>>;
    scratch?: Array<{
      id?: string;
      userId?: string;
      rawText?: string;
      createdAt?: string;
      updatedAt?: string;
      archivedAt?: string | null;
      deletedAt?: string | null;
      derivedSpaceId?: string | null;
      fedTimeDoubtId?: string | null;
    }>;
  };
};

function validateReferences(payload: UserExportPayload) {
  const doubts = Array.isArray(payload.life?.doubts) ? payload.life?.doubts : [];
  const notes = Array.isArray(payload.life?.notes) ? payload.life?.notes : [];
  const spaces = Array.isArray(payload.thinking?.spaces) ? payload.thinking?.spaces : [];
  const nodes = Array.isArray(payload.thinking?.nodes) ? payload.thinking?.nodes : [];
  const inbox = payload.thinking?.inbox ?? {};
  const meta = Array.isArray(payload.thinking?.space_meta) ? payload.thinking?.space_meta : [];

  const doubtIds = new Set(doubts.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const spaceIds = new Set(spaces.map((item) => item.id).filter((id): id is string => typeof id === "string"));

  const brokenNotes = notes.filter((item) => !doubtIds.has(item.doubt_id ?? ""));
  const brokenNodes = nodes.filter((item) => !spaceIds.has(item.spaceId ?? ""));
  const brokenMeta = meta.filter((item) => !spaceIds.has(item.spaceId ?? ""));
  const brokenInbox = Object.entries(inbox).filter(([spaceId]) => !spaceIds.has(spaceId));

  return {
    ok: brokenNotes.length + brokenNodes.length + brokenMeta.length + brokenInbox.length === 0,
    broken: {
      notes: brokenNotes.length,
      nodes: brokenNodes.length,
      space_meta: brokenMeta.length,
      inbox: brokenInbox.length
    }
  };
}

function detectSuspiciousThinkingReplace(
  existing: {
    spaceIds: Set<string>;
    nodeCountBySpace: Map<string, number>;
    totalNodeCount: number;
  },
  incoming: {
    spaces: NonNullable<UserExportPayload["thinking"]>["spaces"];
    nodes: NonNullable<UserExportPayload["thinking"]>["nodes"];
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

    const payload = body.payload as UserExportPayload;
    const refs = validateReferences(payload);
    if (!refs.ok) return errorJson(400, `reference check failed: ${JSON.stringify(refs.broken)}`);

    let replaced: { life: number; thinking: number; scratch: number } | null = null;
    let revision: number | null = null;
    let importError: string | null = null;
    await updateDb((db) => {
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
          spaces: payload.thinking?.spaces,
          nodes: payload.thinking?.nodes
        }
      );
      if (importError) return;

      const thinkingSnapshot: Parameters<typeof replaceThinkingSnapshot>[2] = {
        spaces: (payload.thinking?.spaces ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["spaces"],
        nodes: (payload.thinking?.nodes ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["nodes"],
        spaceMeta: (payload.thinking?.space_meta ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["spaceMeta"],
        nodeLinks: (payload.thinking?.node_links ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["nodeLinks"],
        inbox: (payload.thinking?.inbox ?? {}) as Parameters<typeof replaceThinkingSnapshot>[2]["inbox"],
        scratch: (payload.thinking?.scratch ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["scratch"],
        assistEnabled: true
      };

      replaceLifeSnapshot(db, userId, payload.life ?? {});
      replaceThinkingSnapshot(db, userId, thinkingSnapshot);

      replaced = {
        life: (payload.life?.doubts?.length ?? 0) + (payload.life?.notes?.length ?? 0),
        thinking:
          (payload.thinking?.spaces?.length ?? 0) +
          (payload.thinking?.nodes?.length ?? 0) +
          (payload.thinking?.space_meta?.length ?? 0) +
          Object.values(payload.thinking?.inbox ?? {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
        scratch: payload.thinking?.scratch?.length ?? 0
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
