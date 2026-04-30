export type DimensionKey = "definition" | "resource" | "risk" | "value" | "path" | "evidence";
export type ThinkingSpaceStatus = "active" | "hidden";
export type ThinkingNodeState = "normal" | "hidden";

export type DoubtRecord = {
  id: string;
  user_id: string;
  raw_text: string;
  first_node_preview: string | null;
  last_node_preview: string | null;
  letter_title: string | null;
  letter_lines: string[];
  letter_variant: string | null;
  letter_seal_text: string | null;
  created_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

export type DoubtNoteRecord = {
  id: string;
  doubt_id: string;
  note_text: string;
  created_at: string;
};

export type ThinkingSpaceRecord = {
  id: string;
  user_id: string;
  root_question_text: string;
  status: ThinkingSpaceStatus;
  created_at: string;
  frozen_at: string | null;
  source_time_doubt_id: string | null;
};

export type ThinkingNodeRecord = {
  id: string;
  space_id: string;
  parent_node_id: string | null;
  raw_question_text: string;
  image_asset_id?: string | null;
  note_text?: string | null;
  answer_text?: string | null;
  created_at: string;
  order_index: number;
  is_suggested: boolean;
  state: ThinkingNodeState;
  dimension: DimensionKey;
};

export type ThinkingInboxRecord = {
  id: string;
  space_id: string;
  raw_text: string;
  created_at: string;
};

export type ThinkingScratchRecord = {
  id: string;
  user_id: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  derived_space_id: string | null;
  fed_time_doubt_id: string | null;
};

export type ThinkingSpaceMetaRecord = {
  space_id: string;
  user_freeze_note: string | null;
  export_version: number;
  background_text?: string | null;
  background_version?: number;
  background_asset_ids?: string[];
  background_selected_asset_id?: string | null;
  suggestion_decay?: number;
  last_track_id?: string | null;
  last_organized_order?: number;
  parking_track_id?: string | null;
  pending_track_id?: string | null;
  empty_track_ids?: string[];
  milestone_node_ids?: string[];
  track_direction_hints?: Record<string, string | null>;
};

export type ThinkingNodeLinkRecord = {
  id: string;
  space_id: string;
  source_node_id: string;
  target_node_id: string;
  link_type: "related";
  score: number;
  created_at: string;
};

export type ThinkingMediaAssetRecord = {
  id: string;
  user_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  created_at: string;
  uploaded_at: string | null;
  deleted_at: string | null;
};

export type DbState = {
  doubts: DoubtRecord[];
  doubt_notes: DoubtNoteRecord[];
  thinking_spaces: ThinkingSpaceRecord[];
  thinking_nodes: ThinkingNodeRecord[];
  thinking_inbox: ThinkingInboxRecord[];
  thinking_scratch: ThinkingScratchRecord[];
  thinking_space_meta: ThinkingSpaceMetaRecord[];
  thinking_node_links: ThinkingNodeLinkRecord[];
  thinking_media_assets: ThinkingMediaAssetRecord[];
  email_verification_codes: EmailVerificationCodeRecord[];
  users: UserRecord[];
  audit_logs: AuditLogRecord[];
  user_sync_state: UserSyncStateRecord[];
  applied_client_mutations: AppliedClientMutationRecord[];
  sync_operation_log: SyncOperationLogRecord[];
  sync_repair_items: SyncRepairItemRecord[];
};

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  deleted_at: string | null;
};

export type EmailVerificationCodeRecord = {
  id: string;
  email: string;
  purpose: "register" | "reset_password";
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  last_sent_at: string;
  send_count: number;
};

export type AuditLogRecord = {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  created_at: string;
};

export type UserSyncStateRecord = {
  user_id: string;
  revision: number;
  last_sequence: number;
  updated_at: string;
};

export type AppliedClientMutationRecord = {
  id: string;
  user_id: string;
  client_mutation_id: string;
  op: string;
  base_revision: number;
  applied_revision: number;
  created_at: string;
};

export type SyncOperationLogRecord = {
  id: string;
  user_id: string;
  client_mutation_id: string;
  device_id: string;
  client_order: number;
  client_updated_at: string | null;
  op: string;
  payload: Record<string, unknown>;
  applied_revision: number;
  server_sequence: number;
  created_at: string;
};

export type SyncRepairItemRecord = {
  id: string;
  user_id: string;
  client_mutation_id: string;
  op: string;
  payload: Record<string, unknown>;
  reason: string;
  destination_class: string | null;
  original_target_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type ThinkingSnapshot = {
  spaces: Array<{
    id: string;
    userId: string;
    rootQuestionText: string;
    status: ThinkingSpaceStatus;
    createdAt: string;
    writtenToTimeAt: string | null;
    sourceTimeDoubtId: string | null;
  }>;
  nodes: Array<{
    id: string;
    spaceId: string;
    parentNodeId: string | null;
    rawQuestionText: string;
    imageAssetId?: string | null;
    noteText?: string | null;
    answerText?: string | null;
    createdAt: string;
    orderIndex: number;
    isSuggested: boolean;
    state: ThinkingNodeState;
    dimension: DimensionKey;
  }>;
  spaceMeta: Array<{
    spaceId: string;
    exportVersion: number;
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
  }>;
  mediaAssets?: Array<{
    id: string;
    userId: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    width: number | null;
    height: number | null;
    createdAt: string;
    uploadedAt: string | null;
    deletedAt: string | null;
  }>;
  inbox: Record<
    string,
    Array<{
      id: string;
      rawText: string;
      createdAt: string;
    }>
  >;
  scratch?: Array<{
    id: string;
    userId: string;
    rawText: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    deletedAt: string | null;
    derivedSpaceId: string | null;
    fedTimeDoubtId: string | null;
  }>;
  assistEnabled?: boolean;
};
