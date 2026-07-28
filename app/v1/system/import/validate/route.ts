import { NextRequest } from "next/server";

import { readUserDb, updateUserDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { normalizeUserImportPayload, validateUserImportReferences } from "@/lib/server/import-payload";
import { withApiRoute } from "@/lib/server/observability";
import { verifyUserExportIntegrity } from "@/lib/server/security";
import { createId, nowIso } from "@/lib/server/utils";

type ValidateBody = {
  payload?: unknown;
  checksum?: string;
};

export const POST = withApiRoute(
  "system.import.validate",
  async (request: NextRequest) => {
    const body = await parseJsonBody<ValidateBody>(request);
    if (!body) return errorJson(400, "无效请求体");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const db = await readUserDb(userId, []);
    const user = db.users.find((item) => item.id === userId && !item.deleted_at);
    if (!user) return unauthorizedJson();

    const integrity = verifyUserExportIntegrity(body.payload, body.checksum);
    if (!integrity.ok) return errorJson(400, integrity.reason);
    const refs = validateUserImportReferences(normalizeUserImportPayload(body.payload, userId));
    if (!refs.ok) return errorJson(400, `reference check failed: ${JSON.stringify(refs.broken)}`);

    await updateUserDbScoped(userId, ["audit_logs"], (nextDb) => {
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
