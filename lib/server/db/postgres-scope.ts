import { HOT_TABLE_LOCK_SEED } from "@/lib/server/db/config";
import type { DbState } from "@/lib/server/types";

export type ScopedTable =
  | "doubts"
  | "doubt_notes"
  | "thinking_spaces"
  | "thinking_space_meta"
  | "thinking_nodes"
  | "thinking_inbox"
  | "thinking_scratch"
  | "thinking_node_links"
  | "thinking_media_assets"
  | "audit_logs"
  | "user_sync_state"
  | "applied_client_mutations"
  | "sync_operation_log"
  | "sync_repair_items";

export const ALL_USER_SCOPED_TABLES: ScopedTable[] = [
  "doubts",
  "doubt_notes",
  "thinking_spaces",
  "thinking_space_meta",
  "thinking_nodes",
  "thinking_inbox",
  "thinking_scratch",
  "thinking_node_links",
  "thinking_media_assets",
  "audit_logs",
  "user_sync_state",
  "applied_client_mutations",
  "sync_operation_log",
  "sync_repair_items"
];

export function createEmptyDbState(): DbState {
  return {
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
}

export function normalizeScope(scope: ScopedTable[]) {
  return Array.from(new Set(scope)).sort();
}

export function tableLockKey(table: ScopedTable) {
  let hash = HOT_TABLE_LOCK_SEED;
  for (let i = 0; i < table.length; i += 1) {
    hash = (hash * 33 + table.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
