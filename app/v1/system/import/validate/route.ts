import { NextRequest } from "next/server";

import { readDb, updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import { createId, nowIso } from "@/lib/server/utils";

type ValidateBody = {
  payload?: unknown;
  checksum?: string;
};

function validateReferences(payload: unknown) {
  if (!payload || typeof payload !== "object") return { ok: false as const, reason: "payload must be object" };

  const root = payload as {
    life?: { doubts?: Array<{ id?: string }>; notes?: Array<{ doubt_id?: string }> };
    thinking?: {
      spaces?: Array<{ id?: string }>;
      nodes?: Array<{ space_id?: string }>;
      inbox?: Array<{ space_id?: string }>;
      space_meta?: Array<{ space_id?: string }>;
    };
  };
  const doubts = Array.isArray(root.life?.doubts) ? root.life?.doubts : [];
  const notes = Array.isArray(root.life?.notes) ? root.life?.notes : [];
  const spaces = Array.isArray(root.thinking?.spaces) ? root.thinking?.spaces : [];
  const nodes = Array.isArray(root.thinking?.nodes) ? root.thinking?.nodes : [];
  const inbox = Array.isArray(root.thinking?.inbox) ? root.thinking?.inbox : [];
  const spaceMeta = Array.isArray(root.thinking?.space_meta) ? root.thinking?.space_meta : [];

  const doubtIds = new Set(doubts.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const spaceIds = new Set(spaces.map((item) => item.id).filter((id): id is string => typeof id === "string"));

  const brokenNotes = notes.filter((item) => !doubtIds.has(item.doubt_id ?? ""));
  const brokenNodes = nodes.filter((item) => !spaceIds.has(item.space_id ?? ""));
  const brokenInbox = inbox.filter((item) => !spaceIds.has(item.space_id ?? ""));
  const brokenMeta = spaceMeta.filter((item) => !spaceIds.has(item.space_id ?? ""));

  return {
    ok: brokenNotes.length + brokenNodes.length + brokenInbox.length + brokenMeta.length === 0,
    broken: {
      notes: brokenNotes.length,
      nodes: brokenNodes.length,
      inbox: brokenInbox.length,
      space_meta: brokenMeta.length
    }
  };
}

export const POST = withApiRoute(
  "system.import.validate",
  async (request: NextRequest) => {
    const body = await parseJsonBody<ValidateBody>(request);
    if (!body) return errorJson(400, "无效请求体");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const db = await readDb();
    const user = db.users.find((item) => item.id === userId && !item.deleted_at);
    if (!user) return unauthorizedJson();

    const integrity = verifyUserExportIntegrity(body.payload, body.checksum);
    if (!integrity.ok) return errorJson(400, integrity.reason);
    const refs = validateReferences(body.payload);
    if (!refs.ok) return errorJson(400, `reference check failed: ${JSON.stringify(refs.broken)}`);

    await updateDb((nextDb) => {
      nextDb.audit_logs.push({
        id: createId(),
        user_id: userId,
        action: "validate_import_payload",
        target_type: "user",
        target_id: userId,
        detail: "validated import payload checksum and references",
        created_at: nowIso()
      });
    });

    return okJson({
      ok: true,
      checksum: integrity.actual_checksum,
      references: refs
    });
  },
  { rateLimit: { bucket: "system-import-validate", max: 30, windowMs: 60 * 1000 } }
);
