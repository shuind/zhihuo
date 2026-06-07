import type { PoolClient } from "pg";

import { normalizeDb, normalizePlainRecord, normalizeStarMapPlacements, nowIso } from "@/lib/server/db/normalize";
import { buildPgScopedPlanMap, PG_SCOPED_DELETE_ORDER, PG_SCOPED_UPSERT_ORDER } from "@/lib/server/db/postgres-plans";
import { createEmptyDbState, type ScopedTable } from "@/lib/server/db/postgres-scope";
import { deleteRowsNotInSet, upsertTable } from "@/lib/server/db/table-sync";
import type { DbState } from "@/lib/server/types";

export async function readScopedDbFromPg(client: PoolClient, scope: ScopedTable[]): Promise<DbState> {
  const state = createEmptyDbState();
  for (const table of scope) {
    if (table === "doubts") {
      const { rows } = await client.query(
        "SELECT id, user_id, raw_text, first_node_preview, last_node_preview, letter_title, letter_lines, letter_variant, letter_seal_text, created_at, archived_at, deleted_at FROM doubts"
      );
      state.doubts = rows as DbState["doubts"];
      continue;
    }
    if (table === "doubt_notes") {
      const { rows } = await client.query("SELECT id, doubt_id, note_text, created_at FROM doubt_notes");
      state.doubt_notes = rows as DbState["doubt_notes"];
      continue;
    }
    if (table === "thinking_spaces") {
      const { rows } = await client.query(
        "SELECT id, user_id, root_question_text, status, created_at, frozen_at, last_activity_at, source_time_doubt_id FROM thinking_spaces"
      );
      state.thinking_spaces = rows as DbState["thinking_spaces"];
      continue;
    }
    if (table === "thinking_space_meta") {
      const { rows } = await client.query(
        "SELECT space_id, user_freeze_note, export_version, background_text, background_version, background_asset_ids, background_selected_asset_id, suggestion_decay, last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids, milestone_node_ids, track_direction_hints, star_map_scene_signature, star_map_curated_scene, star_map_curated_at, star_map_star_placements, star_map_placements_signature, star_map_placements_updated_at FROM thinking_space_meta"
      );
      state.thinking_space_meta = rows.map((row) => ({
        ...row,
        export_version: Number(row.export_version),
        background_text: typeof row.background_text === "string" ? row.background_text : null,
        background_version: Number(row.background_version ?? 0),
        background_asset_ids: Array.isArray(row.background_asset_ids)
          ? row.background_asset_ids.filter((id: unknown) => typeof id === "string")
          : [],
        background_selected_asset_id:
          typeof row.background_selected_asset_id === "string" ? row.background_selected_asset_id : null,
        suggestion_decay: Number(row.suggestion_decay ?? 0),
        last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
        last_organized_order: Number(row.last_organized_order ?? -1),
        parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
        pending_track_id: typeof row.pending_track_id === "string" ? row.pending_track_id : null,
        empty_track_ids: Array.isArray(row.empty_track_ids) ? row.empty_track_ids.filter((id: unknown) => typeof id === "string") : [],
        milestone_node_ids: Array.isArray(row.milestone_node_ids)
          ? row.milestone_node_ids.filter((id: unknown) => typeof id === "string")
          : [],
        track_direction_hints:
          row.track_direction_hints && typeof row.track_direction_hints === "object" && !Array.isArray(row.track_direction_hints)
            ? Object.fromEntries(
                Object.entries(row.track_direction_hints).filter(
                  ([trackId, hint]) =>
                    typeof trackId === "string" &&
                    (hint === null ||
                      hint === "hypothesis" ||
                      hint === "memory" ||
                      hint === "counterpoint" ||
                      hint === "worry" ||
                      hint === "constraint" ||
                      hint === "aside")
                )
              )
            : {},
        star_map_scene_signature: typeof row.star_map_scene_signature === "string" ? row.star_map_scene_signature : null,
        star_map_curated_scene: normalizePlainRecord(row.star_map_curated_scene),
        star_map_curated_at: typeof row.star_map_curated_at === "string" ? row.star_map_curated_at : null,
        star_map_star_placements: normalizeStarMapPlacements(row.star_map_star_placements),
        star_map_placements_signature: typeof row.star_map_placements_signature === "string" ? row.star_map_placements_signature : null,
        star_map_placements_updated_at:
          typeof row.star_map_placements_updated_at === "string" ? row.star_map_placements_updated_at : null
      })) as DbState["thinking_space_meta"];
      continue;
    }
    if (table === "thinking_nodes") {
      const { rows } = await client.query(
        "SELECT id, space_id, parent_node_id, raw_question_text, note_text, answer_text, image_asset_id, created_at, order_index, is_suggested, state, dimension FROM thinking_nodes"
      );
      state.thinking_nodes = rows.map((row) => ({
        ...row,
        order_index: Number(row.order_index),
        is_suggested: Boolean(row.is_suggested),
        image_asset_id: typeof row.image_asset_id === "string" ? row.image_asset_id : null,
        note_text: typeof row.note_text === "string" ? row.note_text : null,
        answer_text: typeof row.answer_text === "string" ? row.answer_text : null
      })) as DbState["thinking_nodes"];
      continue;
    }
    if (table === "thinking_inbox") {
      const { rows } = await client.query("SELECT id, space_id, raw_text, created_at FROM thinking_inbox");
      state.thinking_inbox = rows as DbState["thinking_inbox"];
      continue;
    }
    if (table === "thinking_scratch") {
      const { rows } = await client.query(
        "SELECT id, user_id, raw_text, created_at, updated_at, archived_at, deleted_at, derived_space_id, fed_time_doubt_id FROM thinking_scratch"
      );
      state.thinking_scratch = rows.map((row) => ({
        ...row,
        archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
        deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
        derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
        fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
      })) as DbState["thinking_scratch"];
      continue;
    }
    if (table === "thinking_node_links") {
      const { rows } = await client.query(
        "SELECT id, space_id, source_node_id, target_node_id, link_type, score, created_at FROM thinking_node_links"
      );
      state.thinking_node_links = rows.map((row) => ({
        ...row,
        link_type: "related" as const,
        score: Number(row.score ?? 0)
      })) as DbState["thinking_node_links"];
      continue;
    }
    if (table === "thinking_media_assets") {
      const { rows } = await client.query(
        "SELECT id, user_id, file_name, mime_type, byte_size, sha256, width, height, created_at, uploaded_at, deleted_at FROM thinking_media_assets"
      );
      state.thinking_media_assets = rows.map((row) => ({
        ...row,
        file_name: typeof row.file_name === "string" ? row.file_name : "image",
        mime_type: typeof row.mime_type === "string" ? row.mime_type : "application/octet-stream",
        byte_size: Number(row.byte_size ?? 0),
        sha256: typeof row.sha256 === "string" ? row.sha256 : "",
        width: row.width === null || row.width === undefined ? null : Number(row.width),
        height: row.height === null || row.height === undefined ? null : Number(row.height),
        created_at: typeof row.created_at === "string" ? row.created_at : nowIso(),
        uploaded_at: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
        deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null
      })) as DbState["thinking_media_assets"];
      continue;
    }
    if (table === "audit_logs") {
      const { rows } = await client.query("SELECT id, user_id, action, target_type, target_id, detail, created_at FROM audit_logs");
      state.audit_logs = rows as DbState["audit_logs"];
      continue;
    }
    if (table === "user_sync_state") {
      const { rows } = await client.query("SELECT user_id, revision, last_sequence, updated_at FROM user_sync_state");
      state.user_sync_state = rows.map((row) => ({
        ...row,
        revision: Number(row.revision),
        last_sequence: Number(row.last_sequence ?? 0)
      })) as DbState["user_sync_state"];
      continue;
    }
    if (table === "applied_client_mutations") {
      const { rows } = await client.query(
        "SELECT id, user_id, client_mutation_id, op, base_revision, applied_revision, created_at FROM applied_client_mutations"
      );
      state.applied_client_mutations = rows.map((row) => ({
        ...row,
        base_revision: Number(row.base_revision),
        applied_revision: Number(row.applied_revision)
      })) as DbState["applied_client_mutations"];
      continue;
    }
    if (table === "sync_operation_log") {
      const { rows } = await client.query(
        "SELECT id, user_id, client_mutation_id, device_id, client_order, client_updated_at, op, payload, applied_revision, server_sequence, created_at FROM sync_operation_log"
      );
      state.sync_operation_log = rows.map((row) => ({
        ...row,
        client_order: Number(row.client_order ?? 0),
        client_updated_at: typeof row.client_updated_at === "string" ? row.client_updated_at : null,
        payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
        applied_revision: Number(row.applied_revision ?? 0),
        server_sequence: Number(row.server_sequence ?? 0)
      })) as DbState["sync_operation_log"];
      continue;
    }
    if (table === "sync_repair_items") {
      const { rows } = await client.query(
        "SELECT id, user_id, client_mutation_id, op, payload, reason, destination_class, original_target_id, created_at, resolved_at FROM sync_repair_items"
      );
      state.sync_repair_items = rows.map((row) => ({
        ...row,
        payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
        destination_class: typeof row.destination_class === "string" ? row.destination_class : null,
        original_target_id: typeof row.original_target_id === "string" ? row.original_target_id : null,
        resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null
      })) as DbState["sync_repair_items"];
    }
  }
  return normalizeDb(state);
}

export async function persistScopedDbToPg(client: PoolClient, db: DbState, scope: ScopedTable[]) {
  const planByScope = buildPgScopedPlanMap(db, scope);

  for (const table of PG_SCOPED_UPSERT_ORDER) {
    const plan = planByScope.get(table);
    if (!plan) continue;
    await upsertTable(client, plan.table, plan.columns, plan.rows, plan.conflictColumns);
  }

  for (const table of PG_SCOPED_DELETE_ORDER) {
    const plan = planByScope.get(table);
    if (!plan) continue;
    const ids = [...new Set(plan.rows.map((row) => String(row[0])))];
    await deleteRowsNotInSet(client, plan.table, plan.idColumn, ids);
  }
}
