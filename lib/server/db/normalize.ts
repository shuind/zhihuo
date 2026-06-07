import { THINKING_DIMENSIONS } from "@/lib/server/db/config";
import type { DbState, DimensionKey } from "@/lib/server/types";

function normalizeDimension(input: unknown): DimensionKey {
  return THINKING_DIMENSIONS.has(input as DimensionKey) ? (input as DimensionKey) : "definition";
}

export function normalizeVerificationPurpose(input: unknown): "register" | "reset_password" {
  return input === "reset_password" ? "reset_password" : "register";
}

export function normalizePlainRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
}

export function normalizeStarMapPlacements(input: unknown) {
  const raw = normalizePlainRecord(input);
  if (!raw) return {};
  const placements: Record<string, { ring: 1 | 2 | 3 | 4; angle: number; drift: number }> = {};
  for (const [starId, value] of Object.entries(raw)) {
    const item = normalizePlainRecord(value);
    if (!starId || !item) continue;
    const ring = Number(item.ring);
    if (ring !== 1 && ring !== 2 && ring !== 3 && ring !== 4) continue;
    const angle = Number(item.angle);
    const drift = Number(item.drift);
    placements[starId] = {
      ring,
      angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0,
      drift: Number.isFinite(drift) ? Math.max(-2, Math.min(2, drift)) : 0
    };
  }
  return placements;
}

export const EMPTY_DB: DbState = {
  doubts: [],
  doubt_notes: [],
  thinking_spaces: [],
  thinking_nodes: [],
  thinking_inbox: [],
  thinking_scratch: [],
  thinking_space_meta: [],
  thinking_node_links: [],
  thinking_media_assets: [],
  email_verification_codes: [],
  users: [],
  audit_logs: [],
  user_sync_state: [],
  applied_client_mutations: [],
  sync_operation_log: [],
  sync_repair_items: []
};

export function normalizeDb(input: Partial<DbState> | null | undefined): DbState {
  return {
    doubts: Array.isArray(input?.doubts)
      ? input.doubts.map((row) => ({
          ...row,
          first_node_preview: typeof row.first_node_preview === "string" ? row.first_node_preview : null,
          last_node_preview: typeof row.last_node_preview === "string" ? row.last_node_preview : null,
          letter_title: typeof row.letter_title === "string" ? row.letter_title : null,
          letter_lines: normalizeLetterLines(row.letter_lines),
          letter_variant: typeof row.letter_variant === "string" ? row.letter_variant : null,
          letter_seal_text: typeof row.letter_seal_text === "string" ? row.letter_seal_text : null
        }))
      : [],
    doubt_notes: Array.isArray(input?.doubt_notes) ? input.doubt_notes : [],
    thinking_spaces: Array.isArray(input?.thinking_spaces)
      ? input.thinking_spaces.map((row) => ({
          ...row,
          last_activity_at:
            typeof (row as { last_activity_at?: unknown }).last_activity_at === "string"
              ? String((row as { last_activity_at?: unknown }).last_activity_at)
              : typeof row.frozen_at === "string"
                ? row.frozen_at
                : row.created_at
        }))
      : [],
    thinking_nodes: Array.isArray(input?.thinking_nodes)
      ? input.thinking_nodes.map((row) => ({
          ...row,
          note_text: typeof row.note_text === "string" ? row.note_text : null,
          answer_text: typeof row.answer_text === "string" ? row.answer_text : null,
          image_asset_id:
            typeof (row as { image_asset_id?: unknown }).image_asset_id === "string"
              ? String((row as { image_asset_id?: unknown }).image_asset_id)
              : null,
          order_index: Number.isFinite(row.order_index) ? Number(row.order_index) : 0,
          is_suggested: row.is_suggested === true,
          state: row.state === "hidden" ? "hidden" : "normal",
          dimension: normalizeDimension(row.dimension)
        }))
      : [],
    thinking_inbox: Array.isArray(input?.thinking_inbox) ? input.thinking_inbox : [],
    thinking_scratch: Array.isArray(input?.thinking_scratch)
      ? input.thinking_scratch.map((row) => ({
          ...row,
          updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso(),
          archived_at: typeof row.archived_at === "string" ? row.archived_at : null,
          deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
          derived_space_id: typeof row.derived_space_id === "string" ? row.derived_space_id : null,
          fed_time_doubt_id: typeof row.fed_time_doubt_id === "string" ? row.fed_time_doubt_id : null
        }))
      : [],
    thinking_space_meta: Array.isArray(input?.thinking_space_meta)
      ? input.thinking_space_meta.map((row) => ({
          ...row,
          background_text: typeof row.background_text === "string" ? row.background_text : null,
          background_version: Number.isFinite(row.background_version) ? Number(row.background_version) : 0,
          background_asset_ids: Array.isArray((row as { background_asset_ids?: unknown }).background_asset_ids)
            ? ((row as { background_asset_ids?: unknown }).background_asset_ids as unknown[]).filter((id) => typeof id === "string")
            : [],
          background_selected_asset_id:
            typeof (row as { background_selected_asset_id?: unknown }).background_selected_asset_id === "string"
              ? String((row as { background_selected_asset_id?: unknown }).background_selected_asset_id)
              : null,
          suggestion_decay: Number.isFinite(row.suggestion_decay) ? Number(row.suggestion_decay) : 0,
          last_track_id: typeof row.last_track_id === "string" ? row.last_track_id : null,
          last_organized_order: Number.isFinite(row.last_organized_order) ? Number(row.last_organized_order) : -1,
          parking_track_id: typeof row.parking_track_id === "string" ? row.parking_track_id : null,
          pending_track_id: typeof row.pending_track_id === "string" ? row.pending_track_id : null,
          empty_track_ids: Array.isArray(row.empty_track_ids) ? row.empty_track_ids.filter((id) => typeof id === "string") : [],
          milestone_node_ids: Array.isArray(row.milestone_node_ids)
            ? row.milestone_node_ids.filter((id) => typeof id === "string")
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
        }))
      : [],
    thinking_media_assets: Array.isArray(input?.thinking_media_assets)
      ? input.thinking_media_assets
          .filter((row) => row && typeof row.id === "string" && typeof row.user_id === "string")
          .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            file_name: typeof row.file_name === "string" ? row.file_name : "image",
            mime_type: typeof row.mime_type === "string" && row.mime_type.trim() ? row.mime_type : "application/octet-stream",
            byte_size: Number.isFinite(row.byte_size) ? Math.max(0, Number(row.byte_size)) : 0,
            sha256: typeof row.sha256 === "string" ? row.sha256 : "",
            width: Number.isFinite(row.width) ? Number(row.width) : null,
            height: Number.isFinite(row.height) ? Number(row.height) : null,
            created_at: typeof row.created_at === "string" ? row.created_at : nowIso(),
            uploaded_at: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
            deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null
          }))
      : [],
    thinking_node_links: Array.isArray(input?.thinking_node_links)
      ? input.thinking_node_links
          .map((row) => ({
            ...row,
            link_type: "related" as const,
            score: Number.isFinite(row.score) ? Number(row.score) : 0
          }))
          .filter(
            (row) =>
              typeof row.id === "string" &&
              typeof row.space_id === "string" &&
              typeof row.source_node_id === "string" &&
              typeof row.target_node_id === "string"
          )
      : [],
    email_verification_codes: Array.isArray(input?.email_verification_codes)
      ? input.email_verification_codes.map((row) => ({
          ...row,
          purpose: normalizeVerificationPurpose(row.purpose),
          consumed_at: typeof row.consumed_at === "string" ? row.consumed_at : null,
          send_count: Number.isFinite(row.send_count) ? Number(row.send_count) : 1
        }))
      : [],
    users: Array.isArray(input?.users) ? input.users : [],
    audit_logs: Array.isArray(input?.audit_logs) ? input.audit_logs : [],
    user_sync_state: Array.isArray(input?.user_sync_state)
      ? input.user_sync_state
          .filter((row) => row && typeof row.user_id === "string")
          .map((row) => ({
            user_id: row.user_id,
            revision: Number.isFinite(row.revision) ? Number(row.revision) : 0,
            last_sequence: Number.isFinite((row as { last_sequence?: unknown }).last_sequence)
              ? Number((row as { last_sequence?: unknown }).last_sequence)
              : 0,
            updated_at: typeof row.updated_at === "string" ? row.updated_at : nowIso()
          }))
      : [],
    applied_client_mutations: Array.isArray(input?.applied_client_mutations)
      ? input.applied_client_mutations
          .filter((row) => row && typeof row.id === "string" && typeof row.user_id === "string")
          .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            client_mutation_id: typeof row.client_mutation_id === "string" ? row.client_mutation_id : "",
            op: typeof row.op === "string" ? row.op : "",
            base_revision: Number.isFinite(row.base_revision) ? Number(row.base_revision) : 0,
            applied_revision: Number.isFinite(row.applied_revision) ? Number(row.applied_revision) : 0,
            created_at: typeof row.created_at === "string" ? row.created_at : nowIso()
          }))
      : [],
    sync_operation_log: Array.isArray(input?.sync_operation_log)
      ? input.sync_operation_log
          .filter((row) => row && typeof row.id === "string" && typeof row.user_id === "string")
          .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            client_mutation_id: typeof row.client_mutation_id === "string" ? row.client_mutation_id : "",
            device_id: typeof row.device_id === "string" ? row.device_id : "",
            client_order: Number.isFinite(row.client_order) ? Number(row.client_order) : 0,
            client_updated_at: typeof row.client_updated_at === "string" ? row.client_updated_at : null,
            op: typeof row.op === "string" ? row.op : "",
            payload:
              row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
                ? (row.payload as Record<string, unknown>)
                : {},
            applied_revision: Number.isFinite(row.applied_revision) ? Number(row.applied_revision) : 0,
            server_sequence: Number.isFinite(row.server_sequence) ? Number(row.server_sequence) : 0,
            created_at: typeof row.created_at === "string" ? row.created_at : nowIso()
          }))
      : [],
    sync_repair_items: Array.isArray(input?.sync_repair_items)
      ? input.sync_repair_items
          .filter((row) => row && typeof row.id === "string" && typeof row.user_id === "string")
          .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            client_mutation_id: typeof row.client_mutation_id === "string" ? row.client_mutation_id : "",
            op: typeof row.op === "string" ? row.op : "",
            payload:
              row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
                ? (row.payload as Record<string, unknown>)
                : {},
            reason: typeof row.reason === "string" ? row.reason : "repair_required",
            destination_class: typeof row.destination_class === "string" ? row.destination_class : null,
            original_target_id: typeof row.original_target_id === "string" ? row.original_target_id : null,
            created_at: typeof row.created_at === "string" ? row.created_at : nowIso(),
            resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null
          }))
      : []
  };
}

function normalizeLetterLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function nowIso() {
  return new Date().toISOString();
}
