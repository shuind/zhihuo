export type DimensionKey = "definition" | "resource" | "risk" | "value" | "path" | "evidence";
export type ThinkingSpaceStatus = "active" | "hidden";
export type ThinkingNodeState = "normal" | "hidden";
export type TrackDirectionHint = "hypothesis" | "memory" | "counterpoint" | "worry" | "constraint" | "aside";

export type DoubtRecord = {
  id: string;
  user_id: string;
  raw_text: string;
  first_node_preview: string | null;
  last_node_preview: string | null;
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
  suggestion_decay?: number;
  last_track_id?: string | null;
  last_organized_order?: number;
  parking_track_id?: string | null;
  pending_track_id?: string | null;
  empty_track_ids?: string[];
  milestone_node_ids?: string[];
  track_direction_hints?: Record<string, TrackDirectionHint | null>;
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

export type DbState = {
  doubts: DoubtRecord[];
  doubt_notes: DoubtNoteRecord[];
  thinking_spaces: ThinkingSpaceRecord[];
  thinking_nodes: ThinkingNodeRecord[];
  thinking_inbox: ThinkingInboxRecord[];
  thinking_scratch: ThinkingScratchRecord[];
  thinking_space_meta: ThinkingSpaceMetaRecord[];
  thinking_node_links: ThinkingNodeLinkRecord[];
  email_verification_codes: EmailVerificationCodeRecord[];
  users: UserRecord[];
  audit_logs: AuditLogRecord[];
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

export type ThinkingSnapshot = {
  spaces: Array<{
    id: string;
    userId: string;
    rootQuestionText: string;
    status: ThinkingSpaceStatus;
    createdAt: string;
    frozenAt: string | null;
    sourceTimeDoubtId: string | null;
  }>;
  nodes: Array<{
    id: string;
    spaceId: string;
    parentNodeId: string | null;
    rawQuestionText: string;
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
    userFreezeNote: string | null;
    exportVersion: number;
    backgroundText?: string | null;
    backgroundVersion?: number;
    suggestionDecay?: number;
    lastTrackId?: string | null;
    lastOrganizedOrder?: number;
    parkingTrackId?: string | null;
    pendingTrackId?: string | null;
    emptyTrackIds?: string[];
    milestoneNodeIds?: string[];
    trackDirectionHints?: Record<string, TrackDirectionHint | null>;
  }>;
  nodeLinks?: Array<{
    id: string;
    spaceId: string;
    sourceNodeId: string;
    targetNodeId: string;
    linkType: "related";
    score: number;
    createdAt: string;
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
