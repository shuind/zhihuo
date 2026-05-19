import { NextRequest } from "next/server";

import { canImportUserData } from "@/lib/capabilities";
import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { writeThinkingMediaAssetFile } from "@/lib/server/media";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import {
  appendSyncOperationLog,
  getUserLastSequence,
  getUserRevision,
  replaceLifeSnapshot,
  replaceThinkingSnapshot
} from "@/lib/server/store";
import { createId, nowIso } from "@/lib/server/utils";

type OverwriteBody = {
  payload?: UserExportPayload;
  checksum?: string;
  client_updated_at?: string;
  reason?: string;
};

type UserExportPayload = {
  life?: {
    doubts?: Array<{
      id?: string;
      raw_text?: string;
      first_node_preview?: string | null;
      last_node_preview?: string | null;
      letter_title?: string | null;
      letter_lines?: string[] | string | null;
      letter_variant?: string | null;
      letter_seal_text?: string | null;
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
      writtenToTimeAt?: string | null;
      frozenAt?: string | null;
      sourceTimeDoubtId?: string | null;
    }>;
    nodes?: Array<{
      id?: string;
      spaceId?: string;
      parentNodeId?: string | null;
      rawQuestionText?: string;
      imageAssetId?: string | null;
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
      exportVersion?: number;
      backgroundText?: string | null;
      backgroundVersion?: number;
      backgroundAssetIds?: string[];
      backgroundSelectedAssetId?: string | null;
      suggestionDecay?: number;
      lastTrackId?: string | null;
      lastOrganizedOrder?: number;
      parkingTrackId?: string | null;
      pendingTrackId?: string | null;
      emptyTrackIds?: string[];
      milestoneNodeIds?: string[];
      trackDirectionHints?: Record<string, "hypothesis" | "memory" | "counterpoint" | "worry" | "constraint" | "aside" | null>;
      starMapSceneSignature?: string | null;
      starMapCuratedScene?: unknown;
      starMapCuratedAt?: string | null;
      starMapStarPlacements?: unknown;
      starMapPlacementsSignature?: string | null;
      starMapPlacementsUpdatedAt?: string | null;
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
    media_assets?: Array<{
      id?: string;
      user_id?: string;
      userId?: string;
      file_name?: string;
      fileName?: string;
      mime_type?: string;
      mimeType?: string;
      byte_size?: number;
      byteSize?: number;
      sha256?: string;
      width?: number | null;
      height?: number | null;
      created_at?: string;
      createdAt?: string;
      uploaded_at?: string | null;
      uploadedAt?: string | null;
      deleted_at?: string | null;
      deletedAt?: string | null;
      content_base64?: string;
      contentBase64?: string;
    }>;
  };
};

function validateReferences(payload: UserExportPayload) {
  const doubts = Array.isArray(payload.life?.doubts) ? payload.life.doubts : [];
  const notes = Array.isArray(payload.life?.notes) ? payload.life.notes : [];
  const spaces = Array.isArray(payload.thinking?.spaces) ? payload.thinking.spaces : [];
  const nodes = Array.isArray(payload.thinking?.nodes) ? payload.thinking.nodes : [];
  const inbox = payload.thinking?.inbox ?? {};
  const meta = Array.isArray(payload.thinking?.space_meta) ? payload.thinking.space_meta : [];
  const mediaAssets = Array.isArray(payload.thinking?.media_assets) ? payload.thinking.media_assets : [];

  const doubtIds = new Set(doubts.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const spaceIds = new Set(spaces.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const mediaIds = new Set(mediaAssets.map((item) => item.id).filter((id): id is string => typeof id === "string"));

  const brokenNotes = notes.filter((item) => !doubtIds.has(item.doubt_id ?? ""));
  const brokenNodes = nodes.filter(
    (item) =>
      !spaceIds.has(item.spaceId ?? "") ||
      (typeof item.imageAssetId === "string" && item.imageAssetId.trim() ? !mediaIds.has(item.imageAssetId) : false)
  );
  const brokenMeta = meta.filter((item) => {
    if (!spaceIds.has(item.spaceId ?? "")) return true;
    const backgroundAssetIds = Array.isArray(item.backgroundAssetIds) ? item.backgroundAssetIds : [];
    if (backgroundAssetIds.some((assetId) => typeof assetId === "string" && !mediaIds.has(assetId))) return true;
    if (
      typeof item.backgroundSelectedAssetId === "string" &&
      item.backgroundSelectedAssetId.trim() &&
      !mediaIds.has(item.backgroundSelectedAssetId)
    ) {
      return true;
    }
    return false;
  });
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
  "sync.overwrite.post",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<OverwriteBody>(request);
    if (!body?.payload) return errorJson(400, "payload is required");

    const integrity = verifyUserExportIntegrity(body.payload, body.checksum);
    if (!integrity.ok) return errorJson(400, integrity.reason);

    const refs = validateReferences(body.payload);
    if (!refs.ok) return errorJson(400, `reference check failed: ${JSON.stringify(refs.broken)}`);

    const payload = body.payload;
    const clientUpdatedAt =
      typeof body.client_updated_at === "string" && Number.isFinite(new Date(body.client_updated_at).getTime())
        ? body.client_updated_at
        : nowIso();
    let result: { revision: number; lastSequence: number; overwritten: { life: number; thinking: number; scratch: number } } | null = null;

    await updateDb(async (db) => {
      const user = db.users.find((item) => item.id === userId && !item.deleted_at);
      if (!canImportUserData(user)) return;

      const thinkingSnapshot: Parameters<typeof replaceThinkingSnapshot>[2] = {
        spaces: (payload.thinking?.spaces ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["spaces"],
        nodes: (payload.thinking?.nodes ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["nodes"],
        spaceMeta: (payload.thinking?.space_meta ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["spaceMeta"],
        inbox: (payload.thinking?.inbox ?? {}) as Parameters<typeof replaceThinkingSnapshot>[2]["inbox"],
        scratch: (payload.thinking?.scratch ?? []) as Parameters<typeof replaceThinkingSnapshot>[2]["scratch"],
        mediaAssets: (payload.thinking?.media_assets ?? []).map((asset) => ({
          id: asset.id ?? createId(),
          userId,
          fileName: asset.fileName ?? asset.file_name ?? "image",
          mimeType: asset.mimeType ?? asset.mime_type ?? "application/octet-stream",
          byteSize:
            typeof asset.byteSize === "number"
              ? asset.byteSize
              : typeof asset.byte_size === "number"
                ? asset.byte_size
                : 0,
          sha256: typeof asset.sha256 === "string" ? asset.sha256 : "",
          width: typeof asset.width === "number" ? asset.width : null,
          height: typeof asset.height === "number" ? asset.height : null,
          createdAt: asset.createdAt ?? asset.created_at ?? nowIso(),
          uploadedAt: asset.uploadedAt ?? asset.uploaded_at ?? null,
          deletedAt: asset.deletedAt ?? asset.deleted_at ?? null
        })),
        assistEnabled: true
      };

      replaceLifeSnapshot(db, userId, payload.life ?? {});
      replaceThinkingSnapshot(db, userId, thinkingSnapshot);
      const revision = getUserRevision(db, userId);

      appendSyncOperationLog(db, userId, {
        clientMutationId: `overwrite:${createId()}`,
        deviceId: "manual-overwrite",
        clientOrder: new Date(clientUpdatedAt).getTime(),
        clientUpdatedAt,
        op: "/v1/sync/overwrite",
        payload: {
          reason: typeof body.reason === "string" ? body.reason : "manual_overwrite",
          checksum: integrity.actual_checksum
        },
        appliedRevision: revision
      });

      for (const asset of payload.thinking?.media_assets ?? []) {
        const assetId = typeof asset.id === "string" && asset.id.trim() ? asset.id : null;
        const contentBase64 =
          typeof asset.contentBase64 === "string"
            ? asset.contentBase64
            : typeof asset.content_base64 === "string"
              ? asset.content_base64
              : "";
        if (!assetId || !contentBase64) continue;
        await writeThinkingMediaAssetFile(userId, assetId, Buffer.from(contentBase64, "base64"));
      }

      const overwritten = {
        life: (payload.life?.doubts?.length ?? 0) + (payload.life?.notes?.length ?? 0),
        thinking:
          (payload.thinking?.spaces?.length ?? 0) +
          (payload.thinking?.nodes?.length ?? 0) +
          (payload.thinking?.space_meta?.length ?? 0) +
          (payload.thinking?.media_assets?.length ?? 0) +
          Object.values(payload.thinking?.inbox ?? {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
        scratch: payload.thinking?.scratch?.length ?? 0
      };

      db.audit_logs.push({
        id: createId(),
        user_id: userId,
        action: "sync_manual_overwrite_cloud",
        target_type: "user",
        target_id: userId,
        detail: `local snapshot overwrote cloud: life=${overwritten.life}, thinking=${overwritten.thinking}, scratch=${overwritten.scratch}`,
        created_at: nowIso()
      });

      result = {
        revision,
        lastSequence: getUserLastSequence(db, userId),
        overwritten
      };
    });

    const finalResult = result as {
      revision: number;
      lastSequence: number;
      overwritten: { life: number; thinking: number; scratch: number };
    } | null;
    if (!finalResult) return unauthorizedJson();
    return okJson({
      ok: true,
      overwrittenAt: nowIso(),
      revision: finalResult.revision,
      lastSequence: finalResult.lastSequence,
      overwritten: finalResult.overwritten
    });
  },
  { rateLimit: { bucket: "sync-overwrite", max: 8, windowMs: 60 * 1000 } }
);
