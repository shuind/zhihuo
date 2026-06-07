import type { PoolClient } from "pg";

import {
  normalizeDb,
  normalizePlainRecord,
  normalizeStarMapPlacements,
  normalizeVerificationPurpose,
  nowIso
} from "@/lib/server/db/normalize";
import { buildPgFullPlanMap, PG_FULL_DELETE_ORDER, PG_FULL_UPSERT_ORDER } from "@/lib/server/db/postgres-plans";
import { deleteRowsNotInSet, upsertTable } from "@/lib/server/db/table-sync";
import type { DbState } from "@/lib/server/types";

export async function readDbFromPg(client: PoolClient): Promise<DbState> {
  const [
    users,
    doubts,
    doubtNotes,
    spaces,
    nodes,
    inbox,
    scratch,
    spaceMeta,
    nodeLinks,
    mediaAssets,
    emailVerificationCodes,
    auditLogs,
    userSyncState,
    appliedClientMutations,
    syncOperationLog,
    syncRepairItems
  ] = await Promise.all([
    client.query("SELECT id, email, password_hash, created_at, deleted_at FROM users"),
    client.query(
      "SELECT id, user_id, raw_text, first_node_preview, last_node_preview, letter_title, letter_lines, letter_variant, letter_seal_text, created_at, archived_at, deleted_at FROM doubts"
    ),
    client.query("SELECT id, doubt_id, note_text, created_at FROM doubt_notes"),
    client.query(
      "SELECT id, user_id, root_question_text, status, created_at, frozen_at, last_activity_at, source_time_doubt_id FROM thinking_spaces"
    ),
    client.query(
      "SELECT id, space_id, parent_node_id, raw_question_text, note_text, answer_text, image_asset_id, created_at, order_index, is_suggested, state, dimension FROM thinking_nodes"
    ),
    client.query("SELECT id, space_id, raw_text, created_at FROM thinking_inbox"),
    client.query("SELECT id, user_id, raw_text, created_at, updated_at, archived_at, deleted_at, derived_space_id, fed_time_doubt_id FROM thinking_scratch"),
    client.query(
      "SELECT space_id, user_freeze_note, export_version, background_text, background_version, background_asset_ids, background_selected_asset_id, suggestion_decay, last_track_id, last_organized_order, parking_track_id, pending_track_id, empty_track_ids, milestone_node_ids, track_direction_hints, star_map_scene_signature, star_map_curated_scene, star_map_curated_at, star_map_star_placements, star_map_placements_signature, star_map_placements_updated_at FROM thinking_space_meta"
    ),
    client.query(
      "SELECT id, space_id, source_node_id, target_node_id, link_type, score, created_at FROM thinking_node_links"
    ),
    client.query(
      "SELECT id, user_id, file_name, mime_type, byte_size, sha256, width, height, created_at, uploaded_at, deleted_at FROM thinking_media_assets"
    ),
    client.query(
      "SELECT id, email, purpose, code_hash, expires_at, consumed_at, created_at, last_sent_at, send_count FROM email_verification_codes"
    ),
    client.query("SELECT id, user_id, action, target_type, target_id, detail, created_at FROM audit_logs"),
    client.query("SELECT user_id, revision, last_sequence, updated_at FROM user_sync_state"),
    client.query(
      "SELECT id, user_id, client_mutation_id, op, base_revision, applied_revision, created_at FROM applied_client_mutations"
    ),
    client.query(
      "SELECT id, user_id, client_mutation_id, device_id, client_order, client_updated_at, op, payload, applied_revision, server_sequence, created_at FROM sync_operation_log"
    ),
    client.query(
      "SELECT id, user_id, client_mutation_id, op, payload, reason, destination_class, original_target_id, created_at, resolved_at FROM sync_repair_items"
    )
  ]);

  return normalizeDb({
    users: users.rows as DbState["users"],
    doubts: doubts.rows as DbState["doubts"],
    doubt_notes: doubtNotes.rows as DbState["doubt_notes"],
    thinking_spaces: spaces.rows as DbState["thinking_spaces"],
    thinking_nodes: nodes.rows.map((row) => ({
      ...row,
      order_index: Number(row.order_index),
      is_suggested: Boolean(row.is_suggested),
      image_asset_id: typeof row.image_asset_id === "string" ? row.image_asset_id : null,
      note_text: typeof row.note_text === "string" ? row.note_text : null,
      answer_text: typeof row.answer_text === "string" ? row.answer_text : null
    })) as DbState["thinking_nodes"],
    thinking_inbox: inbox.rows as DbState["thinking_inbox"],
    thinking_scratch: scratch.rows.map((row) => ({
      ...row,
      archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
      deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
      derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
      fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
    })) as DbState["thinking_scratch"],
    thinking_space_meta: spaceMeta.rows.map((row) => ({
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
    })) as DbState["thinking_space_meta"],
    thinking_node_links: nodeLinks.rows.map((row) => ({
      ...row,
      link_type: "related" as const,
      score: Number(row.score ?? 0)
    })) as DbState["thinking_node_links"],
    thinking_media_assets: mediaAssets.rows.map((row) => ({
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
    })) as DbState["thinking_media_assets"],
    email_verification_codes: emailVerificationCodes.rows.map((row) => ({
      ...row,
      purpose: normalizeVerificationPurpose(row.purpose),
      consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
      send_count: Number(row.send_count ?? 1)
    })) as DbState["email_verification_codes"],
    audit_logs: auditLogs.rows as DbState["audit_logs"],
    user_sync_state: userSyncState.rows.map((row) => ({
      ...row,
      revision: Number(row.revision),
      last_sequence: Number(row.last_sequence ?? 0)
    })) as DbState["user_sync_state"],
    applied_client_mutations: appliedClientMutations.rows.map((row) => ({
      ...row,
      base_revision: Number(row.base_revision),
      applied_revision: Number(row.applied_revision)
    })) as DbState["applied_client_mutations"],
    sync_operation_log: syncOperationLog.rows.map((row) => ({
      ...row,
      client_order: Number(row.client_order ?? 0),
      client_updated_at: typeof row.client_updated_at === "string" ? row.client_updated_at : null,
      payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
      applied_revision: Number(row.applied_revision ?? 0),
      server_sequence: Number(row.server_sequence ?? 0)
    })) as DbState["sync_operation_log"],
    sync_repair_items: syncRepairItems.rows.map((row) => ({
      ...row,
      payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
      destination_class: typeof row.destination_class === "string" ? row.destination_class : null,
      original_target_id: typeof row.original_target_id === "string" ? row.original_target_id : null,
      resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null
    })) as DbState["sync_repair_items"]
  });
}

export async function persistDbToPg(client: PoolClient, db: DbState) {
  const planByTable = buildPgFullPlanMap(db);

  for (const table of PG_FULL_UPSERT_ORDER) {
    const plan = planByTable.get(table);
    if (!plan) continue;
    await upsertTable(client, plan.table, plan.columns, plan.rows, plan.conflictColumns);
  }

  for (const table of PG_FULL_DELETE_ORDER) {
    const plan = planByTable.get(table);
    if (!plan) continue;
    const ids = [...new Set(plan.rows.map((row) => String(row[0])))];
    await deleteRowsNotInSet(client, plan.table, plan.idColumn, ids);
  }
}
