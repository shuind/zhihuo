import { NextRequest } from "next/server";

import { runPgTransaction, updateDbScoped } from "@/lib/server/db";
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { addQuestionToSpace } from "@/lib/server/store";
import type { DbState, ThinkingNodeRecord, ThinkingSpaceMetaRecord, ThinkingSpaceRecord } from "@/lib/server/types";

function createEmptyDbState(): DbState {
  return {
    doubts: [],
    doubt_notes: [],
    thinking_spaces: [],
    thinking_nodes: [],
    thinking_inbox: [],
    thinking_scratch: [],
    thinking_space_meta: [],
    thinking_node_links: [],
    email_verification_codes: [],
    users: [],
    audit_logs: []
  };
}

export const POST = withApiRoute(
  "thinking.questions.add",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<{ raw_text?: string; track_id?: string; from_suggestion?: boolean }>(request);
    if (!body || typeof body.raw_text !== "string") return errorJson(400, "缺少 raw_text");

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();

    const pgResult = await runPgTransaction("thinking.questions.add.sql", async (client) => {
      const spaceRows = await client.query<ThinkingSpaceRecord>(
        `SELECT id, user_id, root_question_text, status, created_at, frozen_at, source_time_doubt_id
         FROM thinking_spaces
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [params.spaceId, userId]
      );
      const space = spaceRows.rows[0];
      if (!space) return { kind: "not_found" as const };

      const metaRows = await client.query<ThinkingSpaceMetaRecord>(
        `SELECT
           space_id, user_freeze_note, export_version, background_text, background_version, suggestion_decay,
           last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids,
           milestone_node_ids, track_direction_hints
         FROM thinking_space_meta
         WHERE space_id = $1
         FOR UPDATE`,
        [params.spaceId]
      );
      const meta = metaRows.rows[0] ?? null;

      const nodeRows = await client.query<ThinkingNodeRecord>(
        `SELECT
           id, space_id, parent_node_id, raw_question_text, note_text, created_at,
           order_index, is_suggested, state, dimension
         FROM thinking_nodes
         WHERE space_id = $1
         FOR UPDATE`,
        [params.spaceId]
      );
      const originalNodes = nodeRows.rows.map((row) => ({
        ...row,
        order_index: Number(row.order_index),
        is_suggested: Boolean(row.is_suggested),
        note_text: typeof row.note_text === "string" ? row.note_text : null
      }));

      const db = createEmptyDbState();
      db.thinking_spaces = [space];
      db.thinking_space_meta = meta ? [meta] : [];
      db.thinking_nodes = originalNodes;

      const result = addQuestionToSpace(db, userId, params.spaceId, body.raw_text ?? "", {
        track_id: typeof body.track_id === "string" ? body.track_id : null,
        from_suggestion: body.from_suggestion === true
      });
      if (result.kind !== "ok" && result.kind !== "invalid" && result.kind !== "readonly" && result.kind !== "not_found") {
        return { kind: "not_found" as const };
      }

      if (result.kind !== "ok") {
        return {
          kind: result.kind,
          suggestedQuestions: result.kind === "invalid" ? result.suggested_questions : ([] as string[])
        };
      }

      const nextMeta = db.thinking_space_meta.find((item) => item.space_id === params.spaceId);
      if (nextMeta) {
        await client.query(
          `INSERT INTO thinking_space_meta (
             space_id, user_freeze_note, export_version, background_text, background_version, suggestion_decay,
             last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids,
             milestone_node_ids, track_direction_hints
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11,
             $12, $13
           )
           ON CONFLICT (space_id) DO UPDATE SET
             user_freeze_note = EXCLUDED.user_freeze_note,
             export_version = EXCLUDED.export_version,
             background_text = EXCLUDED.background_text,
             background_version = EXCLUDED.background_version,
             suggestion_decay = EXCLUDED.suggestion_decay,
             last_track_id = EXCLUDED.last_track_id,
             last_organized_order = EXCLUDED.last_organized_order,
             parking_track_id = EXCLUDED.parking_track_id,
             pending_track_id = EXCLUDED.pending_track_id,
             empty_track_ids = EXCLUDED.empty_track_ids,
             milestone_node_ids = EXCLUDED.milestone_node_ids,
             track_direction_hints = EXCLUDED.track_direction_hints`,
          [
            nextMeta.space_id,
            nextMeta.user_freeze_note,
            nextMeta.export_version,
            nextMeta.background_text ?? null,
            nextMeta.background_version ?? 0,
            nextMeta.suggestion_decay ?? 0,
            nextMeta.last_track_id ?? null,
            nextMeta.last_organized_order ?? -1,
            nextMeta.parking_track_id ?? null,
            nextMeta.pending_track_id ?? null,
            nextMeta.empty_track_ids ?? [],
            nextMeta.milestone_node_ids ?? [],
            nextMeta.track_direction_hints ?? {}
          ]
        );
      }

      const originalById = new Map(originalNodes.map((item) => [item.id, item]));
      const nextNodes = db.thinking_nodes.filter((item) => item.space_id === params.spaceId);
      for (const node of nextNodes) {
        const before = originalById.get(node.id);
        if (!before) {
          await client.query(
            `INSERT INTO thinking_nodes (
               id, space_id, parent_node_id, raw_question_text, note_text, created_at,
               order_index, is_suggested, state, dimension
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              node.id,
              node.space_id,
              node.parent_node_id,
              node.raw_question_text,
              node.note_text ?? null,
              node.created_at,
              node.order_index,
              node.is_suggested,
              node.state,
              node.dimension
            ]
          );
          continue;
        }

        const changed =
          before.parent_node_id !== node.parent_node_id ||
          before.raw_question_text !== node.raw_question_text ||
          (before.note_text ?? null) !== (node.note_text ?? null) ||
          before.order_index !== node.order_index ||
          before.is_suggested !== node.is_suggested ||
          before.state !== node.state ||
          before.dimension !== node.dimension;
        if (!changed) continue;

        await client.query(
          `UPDATE thinking_nodes
           SET parent_node_id = $1, raw_question_text = $2, note_text = $3,
               order_index = $4, is_suggested = $5, state = $6, dimension = $7
           WHERE id = $8`,
          [
            node.parent_node_id,
            node.raw_question_text,
            node.note_text ?? null,
            node.order_index,
            node.is_suggested,
            node.state,
            node.dimension,
            node.id
          ]
        );
      }

      return {
        kind: "ok" as const,
        nodeId: result.node.id,
        normalized: result.normalized_question_text,
        converted: result.converted,
        noteText: result.note_text,
        trackId: result.track_id,
        suggestedQuestions: result.suggested_questions ?? [],
        relatedCandidate:
          result.related_candidate && typeof result.related_candidate.nodeId === "string"
            ? {
                node_id: result.related_candidate.nodeId,
                preview: result.related_candidate.preview,
                score: result.related_candidate.score
              }
            : null
      };
    });
    if (pgResult) {
      if (pgResult.kind === "not_found") return errorJson(404, "空间不存在");
      if (pgResult.kind === "readonly") return errorJson(409, "空间不是进行中状态");
      if (pgResult.kind === "invalid") return errorJson(400, "输入内容过短");
      return okJson({
        node_id: pgResult.nodeId,
        normalized_question_text: pgResult.normalized,
        converted: pgResult.converted,
        note_text: pgResult.noteText,
        track_id: pgResult.trackId,
        suggested_questions: pgResult.suggestedQuestions,
        related_candidate: pgResult.relatedCandidate
      });
    }

    let kind: "ok" | "not_found" | "readonly" | "invalid" = "not_found";
    let nodeId: string | null = null;
    let normalized: string | null = null;
    let converted = false;
    let noteText: string | null = null;
    let trackId: string | null = null;
    let suggestedQuestions: string[] = [];
    let relatedCandidate: { node_id: string; preview: string; score: number } | null = null;

    await updateDbScoped(["thinking_spaces", "thinking_space_meta", "thinking_nodes"], (db) => {
      const result = addQuestionToSpace(db, userId, params.spaceId, body.raw_text ?? "", {
        track_id: typeof body.track_id === "string" ? body.track_id : null,
        from_suggestion: body.from_suggestion === true
      });
      kind = result.kind;
      if (result.kind === "ok") {
        nodeId = result.node.id;
        normalized = result.normalized_question_text;
        converted = result.converted;
        noteText = result.note_text;
        trackId = result.track_id;
        suggestedQuestions = result.suggested_questions ?? [];
        relatedCandidate =
          result.related_candidate && typeof result.related_candidate.nodeId === "string"
            ? {
                node_id: result.related_candidate.nodeId,
                preview: result.related_candidate.preview,
                score: result.related_candidate.score
              }
            : null;
      } else if (result.kind === "invalid") {
        suggestedQuestions = result.suggested_questions;
      }
    });

    if (kind === "not_found") return errorJson(404, "空间不存在");
    if (kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (kind === "invalid") return errorJson(400, "输入内容过短");

    return okJson({
      node_id: nodeId,
      normalized_question_text: normalized,
      converted,
      note_text: noteText,
      track_id: trackId,
      suggested_questions: suggestedQuestions,
      related_candidate: relatedCandidate
    });
  },
  { rateLimit: { bucket: "thinking-questions-add", max: 90, windowMs: 60 * 1000 } }
);
