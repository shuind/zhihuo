import { NextRequest } from "next/server";

import { updateDb } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import {
  addQuestionToSpace,
  createDoubt,
  createThinkingScratch,
  createThinkingSpace,
  findAppliedClientMutation,
  getUserRevision,
  recordAppliedClientMutation,
  updateNodeAnswer,
  updateNodeQuestion,
  updateSpaceRootQuestion,
  upsertDoubtNote,
  writeSpaceToTime
} from "@/lib/server/store";

type SyncMutation = {
  clientMutationId?: string;
  op?: string;
  payload?: Record<string, unknown> | null;
  clientTime?: string | null;
};

type SyncMutationsBody = {
  baseRevision?: number;
  mutations?: SyncMutation[];
};

type AppliedMutationResult = {
  clientMutationId: string;
  status: "applied" | "skipped";
  revision: number;
};

type RejectedMutationResult = {
  clientMutationId: string;
  status: "rejected";
  reason: string;
};

function requireString(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "string" ? String(record[key]) : null;
}

export const POST = withApiRoute(
  "sync.mutations.post",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const body = await parseJsonBody<SyncMutationsBody>(request);
    const baseRevision = Number.isFinite(body?.baseRevision) ? Number(body?.baseRevision) : 0;
    const mutations = Array.isArray(body?.mutations) ? body.mutations : [];
    if (!mutations.length) return errorJson(400, "mutations is required");

    let conflictRevision: number | null = null;
    let applyError: string | null = null;
    let result:
      | {
          applied: AppliedMutationResult[];
          rejected: RejectedMutationResult[];
          newRevision: number;
        }
      | null = null;

    try {
      await updateDb((db) => {
        const currentRevision = getUserRevision(db, userId);
        const normalized = mutations
          .filter((item): item is SyncMutation => Boolean(item && typeof item === "object"))
          .map((item) => ({
            clientMutationId: typeof item.clientMutationId === "string" ? item.clientMutationId : "",
            op: typeof item.op === "string" ? item.op : "",
            payload: item.payload && typeof item.payload === "object" ? item.payload : {},
            clientTime: typeof item.clientTime === "string" ? item.clientTime : null
          }))
          .filter((item) => item.clientMutationId && item.op);

        if (!normalized.length) {
          applyError = "mutations is required";
          throw new Error(applyError);
        }

        const existing = normalized.map((item) => findAppliedClientMutation(db, userId, item.clientMutationId));
        const allAlreadyApplied = existing.every(Boolean);
        if (!allAlreadyApplied && currentRevision !== baseRevision) {
          conflictRevision = currentRevision;
          throw new Error("revision_conflict");
        }

        const applied: AppliedMutationResult[] = [];
        const rejected: RejectedMutationResult[] = [];

        for (let index = 0; index < normalized.length; index += 1) {
          const item = normalized[index];
          const alreadyApplied = existing[index];
          if (alreadyApplied) {
            applied.push({
              clientMutationId: item.clientMutationId,
              status: "skipped",
              revision: alreadyApplied.applied_revision
            });
            continue;
          }

          const payload = item.payload as Record<string, unknown>;
          switch (item.op) {
            case "/v1/doubts": {
              const rawText = requireString(payload, "raw_text");
              if (!rawText) {
                rejected.push({
                  clientMutationId: item.clientMutationId,
                  status: "rejected",
                  reason: "raw_text is required"
                });
                continue;
              }
              const created = createDoubt(db, userId, rawText, {
                clientEntityId: requireString(payload, "client_entity_id"),
                clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
              });
              if (!created) throw new Error("failed to create doubt");
              break;
            }
            case "/v1/thinking/spaces": {
              const rootQuestionText = requireString(payload, "root_question_text");
              if (!rootQuestionText) {
                rejected.push({
                  clientMutationId: item.clientMutationId,
                  status: "rejected",
                  reason: "root_question_text is required"
                });
                continue;
              }
              const created = createThinkingSpace(
                db,
                userId,
                rootQuestionText,
                requireString(payload, "source_time_doubt_id"),
                {
                  clientSpaceId: requireString(payload, "client_space_id"),
                  clientParkingTrackId: requireString(payload, "client_parking_track_id"),
                  clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
                }
              );
              if (!created || created.over_limit) throw new Error("failed to create space");
              break;
            }
            case "/v1/thinking/scratch": {
              const rawText = requireString(payload, "raw_text");
              if (!rawText) {
                rejected.push({
                  clientMutationId: item.clientMutationId,
                  status: "rejected",
                  reason: "raw_text is required"
                });
                continue;
              }
              const scratch = createThinkingScratch(db, userId, rawText, {
                clientEntityId: requireString(payload, "client_entity_id"),
                clientUpdatedAt: requireString(payload, "client_updated_at") ?? item.clientTime
              });
              if (!scratch) throw new Error("failed to create scratch");
              break;
            }
            default: {
              const noteMatch = item.op.match(/^\/v1\/doubts\/([^/]+)\/note$/);
              const addQuestionMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/questions$/);
              const updateNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/update$/);
              const answerNodeMatch = item.op.match(/^\/v1\/thinking\/nodes\/([^/]+)\/answer$/);
              const writeToTimeMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/write-to-time$/);
              const renameSpaceMatch = item.op.match(/^\/v1\/thinking\/spaces\/([^/]+)\/rename$/);

              if (noteMatch) {
                const noteText = typeof payload.note_text === "string" ? payload.note_text : "";
                const note = upsertDoubtNote(db, userId, noteMatch[1]!, noteText);
                if (!note) throw new Error("doubt not found");
                break;
              }

              if (addQuestionMatch) {
                const rawText = requireString(payload, "raw_text");
                if (!rawText) {
                  rejected.push({
                    clientMutationId: item.clientMutationId,
                    status: "rejected",
                    reason: "raw_text is required"
                  });
                  continue;
                }
                const added = addQuestionToSpace(db, userId, addQuestionMatch[1]!, rawText, {
                  track_id: requireString(payload, "track_id"),
                  from_suggestion: payload.from_suggestion === true,
                  client_node_id: requireString(payload, "client_node_id"),
                  client_created_at: requireString(payload, "client_created_at") ?? requireString(payload, "client_updated_at") ?? item.clientTime
                });
                if (added.kind !== "ok") throw new Error("failed to add question");
                break;
              }

              if (updateNodeMatch) {
                const rawQuestionText = requireString(payload, "raw_question_text");
                if (!rawQuestionText) {
                  rejected.push({
                    clientMutationId: item.clientMutationId,
                    status: "rejected",
                    reason: "raw_question_text is required"
                  });
                  continue;
                }
                const updated = updateNodeQuestion(db, userId, updateNodeMatch[1]!, rawQuestionText);
                if (updated.kind !== "ok") throw new Error("failed to update node");
                break;
              }

              if (answerNodeMatch) {
                const answerText = typeof payload.answer_text === "string" ? payload.answer_text : null;
                const updated = updateNodeAnswer(db, userId, answerNodeMatch[1]!, answerText);
                if (updated.kind !== "ok") throw new Error("failed to update answer");
                break;
              }

              if (writeToTimeMatch) {
                const written = writeSpaceToTime(
                  db,
                  userId,
                  writeToTimeMatch[1]!,
                  typeof payload.freeze_note === "string" ? payload.freeze_note : null,
                  { preserveOriginalTime: payload.preserve_original_time !== false }
                );
                if (written.kind !== "ok") throw new Error("failed to write space to time");
                break;
              }

              if (renameSpaceMatch) {
                const rootQuestionText = requireString(payload, "root_question_text");
                if (!rootQuestionText) {
                  rejected.push({
                    clientMutationId: item.clientMutationId,
                    status: "rejected",
                    reason: "root_question_text is required"
                  });
                  continue;
                }
                const renamed = updateSpaceRootQuestion(db, userId, renameSpaceMatch[1]!, rootQuestionText);
                if (renamed.kind !== "ok") throw new Error("failed to rename space");
                break;
              }

              rejected.push({
                clientMutationId: item.clientMutationId,
                status: "rejected",
                reason: `unsupported mutation: ${item.op}`
              });
              continue;
            }
          }

          const appliedRevision = getUserRevision(db, userId);
          recordAppliedClientMutation(db, userId, item.clientMutationId, item.op, baseRevision, appliedRevision);
          applied.push({
            clientMutationId: item.clientMutationId,
            status: "applied",
            revision: appliedRevision
          });
        }

        result = {
          applied,
          rejected,
          newRevision: getUserRevision(db, userId)
        };
      });
    } catch (error) {
      if (conflictRevision !== null) {
        return errorJson(409, `revision_conflict:${conflictRevision}`);
      }
      return errorJson(400, applyError ?? (error instanceof Error ? error.message : "failed to apply mutations"));
    }

    if (!result) return errorJson(500, "failed to apply mutations");
    return okJson(result);
  },
  { rateLimit: { bucket: "sync-mutations", max: 90, windowMs: 60 * 1000 } }
);
