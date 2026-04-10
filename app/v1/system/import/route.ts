import { NextRequest } from "next/server";

import { canImportUserData } from "@/lib/capabilities";
import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import { replaceLifeSnapshot, replaceThinkingSnapshot } from "@/lib/server/store";
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
    await updateDb((db) => {
      const user = db.users.find((item) => item.id === userId && !item.deleted_at);
      if (!canImportUserData(user)) return;

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
    });

    if (!replaced) return unauthorizedJson();

    return okJson({
      ok: true,
      importedAt: nowIso(),
      replaced
    });
  },
  { rateLimit: { bucket: "system-import", max: 8, windowMs: 60 * 1000 } }
);
