import type { ScopedTable } from "@/lib/server/db/postgres-scope";
import type { PgSyncPlan } from "@/lib/server/db/table-sync";
import type { DbState } from "@/lib/server/types";

type FullPgTable = ScopedTable | "users" | "email_verification_codes";

type PlanBuilder = (db: DbState) => PgSyncPlan;

const PLAN_BUILDERS: Record<FullPgTable, PlanBuilder> = {
  users: (db) => ({
    table: "users",
    idColumn: "id",
    columns: ["id", "email", "password_hash", "created_at", "deleted_at"],
    conflictColumns: ["id"],
    rows: db.users.map((row) => [row.id, row.email, row.password_hash, row.created_at, row.deleted_at])
  }),
  doubts: (db) => ({
    table: "doubts",
    idColumn: "id",
    columns: [
      "id",
      "user_id",
      "raw_text",
      "first_node_preview",
      "last_node_preview",
      "letter_title",
      "letter_lines",
      "letter_variant",
      "letter_seal_text",
      "created_at",
      "archived_at",
      "deleted_at"
    ],
    conflictColumns: ["id"],
    rows: db.doubts.map((row) => [
      row.id,
      row.user_id,
      row.raw_text,
      row.first_node_preview ?? null,
      row.last_node_preview ?? null,
      row.letter_title ?? null,
      JSON.stringify(row.letter_lines ?? []),
      row.letter_variant ?? null,
      row.letter_seal_text ?? null,
      row.created_at,
      row.archived_at,
      row.deleted_at
    ])
  }),
  doubt_notes: (db) => ({
    table: "doubt_notes",
    idColumn: "id",
    columns: ["id", "doubt_id", "note_text", "created_at"],
    conflictColumns: ["id"],
    rows: db.doubt_notes.map((row) => [row.id, row.doubt_id, row.note_text, row.created_at])
  }),
  thinking_spaces: (db) => ({
    table: "thinking_spaces",
    idColumn: "id",
    columns: [
      "id",
      "user_id",
      "root_question_text",
      "status",
      "created_at",
      "frozen_at",
      "last_activity_at",
      "source_time_doubt_id"
    ],
    conflictColumns: ["id"],
    rows: db.thinking_spaces.map((row) => [
      row.id,
      row.user_id,
      row.root_question_text,
      row.status,
      row.created_at,
      row.frozen_at,
      row.last_activity_at ?? row.created_at,
      row.source_time_doubt_id
    ])
  }),
  thinking_space_meta: (db) => ({
    table: "thinking_space_meta",
    idColumn: "space_id",
    columns: [
      "space_id",
      "user_freeze_note",
      "export_version",
      "background_text",
      "background_version",
      "background_asset_ids",
      "background_selected_asset_id",
      "suggestion_decay",
      "last_track_id",
      "last_organized_order",
      "parking_track_id",
      "pending_track_id",
      "empty_track_ids",
      "milestone_node_ids",
      "track_direction_hints",
      "star_map_scene_signature",
      "star_map_curated_scene",
      "star_map_curated_at",
      "star_map_star_placements",
      "star_map_placements_signature",
      "star_map_placements_updated_at"
    ],
    conflictColumns: ["space_id"],
    rows: db.thinking_space_meta.map((row) => [
      row.space_id,
      row.user_freeze_note,
      row.export_version,
      row.background_text ?? null,
      row.background_version ?? 0,
      row.background_asset_ids ?? [],
      row.background_selected_asset_id ?? null,
      row.suggestion_decay ?? 0,
      row.last_track_id ?? null,
      row.last_organized_order ?? -1,
      row.parking_track_id ?? null,
      row.pending_track_id ?? null,
      row.empty_track_ids ?? [],
      row.milestone_node_ids ?? [],
      row.track_direction_hints ?? {},
      row.star_map_scene_signature ?? null,
      row.star_map_curated_scene ?? null,
      row.star_map_curated_at ?? null,
      row.star_map_star_placements ?? {},
      row.star_map_placements_signature ?? null,
      row.star_map_placements_updated_at ?? null
    ])
  }),
  thinking_nodes: (db) => ({
    table: "thinking_nodes",
    idColumn: "id",
    columns: [
      "id",
      "space_id",
      "parent_node_id",
      "raw_question_text",
      "note_text",
      "answer_text",
      "image_asset_id",
      "created_at",
      "order_index",
      "is_suggested",
      "state",
      "dimension"
    ],
    conflictColumns: ["id"],
    rows: db.thinking_nodes.map((row) => [
      row.id,
      row.space_id,
      row.parent_node_id,
      row.raw_question_text,
      row.note_text ?? null,
      row.answer_text ?? null,
      row.image_asset_id ?? null,
      row.created_at,
      row.order_index,
      row.is_suggested,
      row.state,
      row.dimension
    ])
  }),
  thinking_inbox: (db) => ({
    table: "thinking_inbox",
    idColumn: "id",
    columns: ["id", "space_id", "raw_text", "created_at"],
    conflictColumns: ["id"],
    rows: db.thinking_inbox.map((row) => [row.id, row.space_id, row.raw_text, row.created_at])
  }),
  thinking_scratch: (db) => ({
    table: "thinking_scratch",
    idColumn: "id",
    columns: ["id", "user_id", "raw_text", "created_at", "updated_at", "archived_at", "deleted_at", "derived_space_id", "fed_time_doubt_id"],
    conflictColumns: ["id"],
    rows: db.thinking_scratch.map((row) => [
      row.id,
      row.user_id,
      row.raw_text,
      row.created_at,
      row.updated_at,
      row.archived_at,
      row.deleted_at,
      row.derived_space_id,
      row.fed_time_doubt_id
    ])
  }),
  thinking_node_links: (db) => ({
    table: "thinking_node_links",
    idColumn: "id",
    columns: ["id", "space_id", "source_node_id", "target_node_id", "link_type", "score", "created_at"],
    conflictColumns: ["id"],
    rows: db.thinking_node_links.map((row) => [
      row.id,
      row.space_id,
      row.source_node_id,
      row.target_node_id,
      row.link_type,
      row.score,
      row.created_at
    ])
  }),
  thinking_media_assets: (db) => ({
    table: "thinking_media_assets",
    idColumn: "id",
    columns: ["id", "user_id", "file_name", "mime_type", "byte_size", "sha256", "width", "height", "created_at", "uploaded_at", "deleted_at"],
    conflictColumns: ["id"],
    rows: db.thinking_media_assets.map((row) => [
      row.id,
      row.user_id,
      row.file_name,
      row.mime_type,
      row.byte_size,
      row.sha256,
      row.width,
      row.height,
      row.created_at,
      row.uploaded_at,
      row.deleted_at
    ])
  }),
  email_verification_codes: (db) => ({
    table: "email_verification_codes",
    idColumn: "id",
    columns: ["id", "email", "purpose", "code_hash", "expires_at", "consumed_at", "created_at", "last_sent_at", "send_count"],
    conflictColumns: ["id"],
    rows: db.email_verification_codes.map((row) => [
      row.id,
      row.email,
      row.purpose,
      row.code_hash,
      row.expires_at,
      row.consumed_at,
      row.created_at,
      row.last_sent_at,
      row.send_count
    ])
  }),
  audit_logs: (db) => ({
    table: "audit_logs",
    idColumn: "id",
    columns: ["id", "user_id", "action", "target_type", "target_id", "detail", "created_at"],
    conflictColumns: ["id"],
    rows: db.audit_logs.map((row) => [row.id, row.user_id, row.action, row.target_type, row.target_id, row.detail, row.created_at])
  }),
  user_sync_state: (db) => ({
    table: "user_sync_state",
    idColumn: "user_id",
    columns: ["user_id", "revision", "last_sequence", "updated_at"],
    conflictColumns: ["user_id"],
    rows: db.user_sync_state.map((row) => [row.user_id, row.revision, row.last_sequence, row.updated_at])
  }),
  applied_client_mutations: (db) => ({
    table: "applied_client_mutations",
    idColumn: "id",
    columns: ["id", "user_id", "client_mutation_id", "op", "base_revision", "applied_revision", "created_at"],
    conflictColumns: ["id"],
    rows: db.applied_client_mutations.map((row) => [
      row.id,
      row.user_id,
      row.client_mutation_id,
      row.op,
      row.base_revision,
      row.applied_revision,
      row.created_at
    ])
  }),
  sync_operation_log: (db) => ({
    table: "sync_operation_log",
    idColumn: "id",
    columns: [
      "id",
      "user_id",
      "client_mutation_id",
      "device_id",
      "client_order",
      "client_updated_at",
      "op",
      "payload",
      "applied_revision",
      "server_sequence",
      "created_at"
    ],
    conflictColumns: ["id"],
    rows: db.sync_operation_log.map((row) => [
      row.id,
      row.user_id,
      row.client_mutation_id,
      row.device_id,
      row.client_order,
      row.client_updated_at,
      row.op,
      row.payload,
      row.applied_revision,
      row.server_sequence,
      row.created_at
    ])
  }),
  sync_repair_items: (db) => ({
    table: "sync_repair_items",
    idColumn: "id",
    columns: [
      "id",
      "user_id",
      "client_mutation_id",
      "op",
      "payload",
      "reason",
      "destination_class",
      "original_target_id",
      "created_at",
      "resolved_at"
    ],
    conflictColumns: ["id"],
    rows: db.sync_repair_items.map((row) => [
      row.id,
      row.user_id,
      row.client_mutation_id,
      row.op,
      row.payload,
      row.reason,
      row.destination_class,
      row.original_target_id,
      row.created_at,
      row.resolved_at
    ])
  })
};

export const PG_FULL_UPSERT_ORDER: FullPgTable[] = [
  "users",
  "doubts",
  "thinking_spaces",
  "thinking_scratch",
  "audit_logs",
  "user_sync_state",
  "applied_client_mutations",
  "sync_operation_log",
  "sync_repair_items",
  "thinking_media_assets",
  "email_verification_codes",
  "doubt_notes",
  "thinking_space_meta",
  "thinking_nodes",
  "thinking_inbox",
  "thinking_node_links"
];

export const PG_FULL_DELETE_ORDER: FullPgTable[] = [
  "thinking_node_links",
  "thinking_inbox",
  "thinking_nodes",
  "thinking_space_meta",
  "doubt_notes",
  "thinking_spaces",
  "doubts",
  "thinking_scratch",
  "thinking_media_assets",
  "email_verification_codes",
  "audit_logs",
  "sync_repair_items",
  "sync_operation_log",
  "applied_client_mutations",
  "user_sync_state",
  "users"
];

export const PG_SCOPED_UPSERT_ORDER: ScopedTable[] = [
  "doubts",
  "thinking_spaces",
  "thinking_scratch",
  "audit_logs",
  "user_sync_state",
  "applied_client_mutations",
  "sync_operation_log",
  "sync_repair_items",
  "thinking_media_assets",
  "doubt_notes",
  "thinking_space_meta",
  "thinking_nodes",
  "thinking_inbox",
  "thinking_node_links"
];

export const PG_SCOPED_DELETE_ORDER: ScopedTable[] = [
  "thinking_node_links",
  "thinking_inbox",
  "thinking_nodes",
  "thinking_space_meta",
  "thinking_spaces",
  "doubt_notes",
  "doubts",
  "thinking_scratch",
  "thinking_media_assets",
  "audit_logs",
  "sync_repair_items",
  "sync_operation_log",
  "applied_client_mutations",
  "user_sync_state"
];

export function buildPgFullPlanMap(db: DbState) {
  return new Map(PG_FULL_UPSERT_ORDER.map((table) => [table, PLAN_BUILDERS[table](db)] as const));
}

export function buildPgScopedPlanMap(db: DbState, scope: ScopedTable[]) {
  const plans = new Map<ScopedTable, PgSyncPlan>();
  for (const table of scope) {
    plans.set(table, PLAN_BUILDERS[table](db));
  }
  return plans;
}
