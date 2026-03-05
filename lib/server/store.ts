import type {
  DbState,
  DimensionKey,
  DoubtNoteRecord,
  DoubtRecord,
  ThinkingNodeRecord,
  ThinkingSnapshot,
  ThinkingSpaceMetaRecord,
  ThinkingSpaceRecord
} from "@/lib/server/types";
import {
  MAX_ACTIVE_SPACES,
  MAX_SPACE_NODES,
  buildSuggestedQuestions,
  classifyDimension,
  collapseWhitespace,
  createId,
  formatDateTime,
  normalizeQuestionInput,
  nowIso,
  textOverlapScore,
  tokenizeText
} from "@/lib/server/utils";

const TRACK_PREFIX = "track:";

function parseRange(range: string | null) {
  if (range === "week" || range === "month" || range === "all") return range;
  return "all";
}

function isWithinRange(iso: string, range: "week" | "month" | "all") {
  if (range === "all") return true;
  const now = Date.now();
  const span = range === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return now - new Date(iso).getTime() <= span;
}

function userDoubts(db: DbState, userId: string) {
  return db.doubts.filter((item) => item.user_id === userId);
}

function userSpaces(db: DbState, userId: string) {
  return db.thinking_spaces.filter((item) => item.user_id === userId);
}

function requireDoubt(db: DbState, userId: string, doubtId: string) {
  return db.doubts.find((item) => item.id === doubtId && item.user_id === userId && !item.deleted_at) ?? null;
}

function requireSpace(db: DbState, userId: string, spaceId: string) {
  return db.thinking_spaces.find((space) => space.id === spaceId && space.user_id === userId) ?? null;
}

function maxOrderIndex(nodes: ThinkingNodeRecord[]) {
  return nodes.reduce((max, node) => Math.max(max, node.order_index), -1);
}

function toTrackParentId(trackId: string) {
  return `${TRACK_PREFIX}${trackId}`;
}

function normalizeTrackId(raw: string | null | undefined) {
  if (!raw) return null;
  const compact = collapseWhitespace(raw);
  if (!compact) return null;
  if (compact === "__new__") return "__new__";
  if (compact.startsWith(TRACK_PREFIX)) return compact.slice(TRACK_PREFIX.length);
  if (compact.startsWith("branch:")) return `legacy-${compact.slice("branch:".length)}`;
  return compact;
}

function trackIdFromNode(node: ThinkingNodeRecord) {
  const normalized = normalizeTrackId(node.parent_node_id);
  if (normalized && normalized !== "__new__") return normalized;
  return `legacy-${node.dimension}`;
}

function getSpaceNodes(db: DbState, spaceId: string) {
  return db.thinking_nodes
    .filter((node) => node.space_id === spaceId && node.state === "normal")
    .sort((a, b) => a.order_index - b.order_index);
}

function getTrackMap(nodes: ThinkingNodeRecord[]) {
  const tracks = new Map<string, ThinkingNodeRecord[]>();
  for (const node of nodes) {
    const trackId = trackIdFromNode(node);
    const list = tracks.get(trackId);
    if (list) list.push(node);
    else tracks.set(trackId, [node]);
  }
  for (const list of tracks.values()) list.sort((a, b) => a.order_index - b.order_index);
  return tracks;
}

function getTrackProfile(nodes: ThinkingNodeRecord[]) {
  const seed = nodes.slice(0, 3);
  const tokens = tokenizeText(seed.map((item) => item.raw_question_text).join(" "));
  const dimensions = new Map<DimensionKey, number>();
  for (const item of seed) dimensions.set(item.dimension, (dimensions.get(item.dimension) ?? 0) + 1);
  let majorDimension: DimensionKey = seed[0]?.dimension ?? "definition";
  let majorCount = 0;
  for (const [dimension, count] of dimensions.entries()) {
    if (count > majorCount) {
      majorDimension = dimension;
      majorCount = count;
    }
  }
  return { tokens, majorDimension };
}

function scoreNodeForTrack(node: ThinkingNodeRecord, profile: ReturnType<typeof getTrackProfile>, sticky = false) {
  const nodeTokens = tokenizeText(node.raw_question_text);
  const overlap = textOverlapScore(nodeTokens, profile.tokens);
  const dimensionBonus = profile.majorDimension === node.dimension ? 0.18 : 0;
  const stickyBonus = sticky ? 0.14 : 0;
  return overlap + dimensionBonus + stickyBonus;
}

function enforceMaxNodes(db: DbState, spaceId: string) {
  const normals = getSpaceNodes(db, spaceId);
  if (normals.length <= MAX_SPACE_NODES) return;
  const hideIds = new Set(normals.slice(0, normals.length - MAX_SPACE_NODES).map((node) => node.id));
  db.thinking_nodes = db.thinking_nodes.map((node) =>
    node.space_id === spaceId && hideIds.has(node.id) ? { ...node, state: "hidden" as const } : node
  );
}

function sanitizeMeta(meta: ThinkingSpaceMetaRecord) {
  if (!Object.prototype.hasOwnProperty.call(meta, "background_text")) meta.background_text = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "background_version")) meta.background_version = 0;
  if (!Object.prototype.hasOwnProperty.call(meta, "suggestion_decay")) meta.suggestion_decay = 0;
  if (!Object.prototype.hasOwnProperty.call(meta, "last_track_id")) meta.last_track_id = null;
  if (!Object.prototype.hasOwnProperty.call(meta, "last_organized_order")) meta.last_organized_order = -1;
  if (typeof meta.background_version !== "number" || !Number.isFinite(meta.background_version) || meta.background_version < 0) {
    meta.background_version = 0;
  }
  if (typeof meta.suggestion_decay !== "number" || !Number.isFinite(meta.suggestion_decay) || meta.suggestion_decay < 0) {
    meta.suggestion_decay = 0;
  }
  if (typeof meta.last_organized_order !== "number" || !Number.isFinite(meta.last_organized_order)) {
    meta.last_organized_order = -1;
  }
  return meta;
}

function ensureMeta(db: DbState, spaceId: string) {
  const existing = db.thinking_space_meta.find((meta) => meta.space_id === spaceId);
  if (existing) return sanitizeMeta(existing);
  const next: ThinkingSpaceMetaRecord = {
    space_id: spaceId,
    user_freeze_note: null,
    export_version: 1,
    background_text: null,
    background_version: 0,
    suggestion_decay: 0,
    last_track_id: null,
    last_organized_order: -1
  };
  db.thinking_space_meta.push(next);
  return next;
}

function chooseFallbackTrackId(nodes: ThinkingNodeRecord[]) {
  if (!nodes.length) return null;
  const latest = [...nodes].sort((a, b) => b.order_index - a.order_index)[0];
  return latest ? trackIdFromNode(latest) : null;
}

function echoKey(text: string) {
  return text.toLowerCase().replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
}

function appendAuditLog(
  db: DbState,
  payload: { userId: string; action: string; targetType: string; targetId: string; detail: string }
) {
  db.audit_logs.push({
    id: createId(),
    user_id: payload.userId,
    action: payload.action,
    target_type: payload.targetType,
    target_id: payload.targetId,
    detail: payload.detail,
    created_at: nowIso()
  });
}

export function listDoubts(db: DbState, userId: string, query: { range: string | null; includeArchived: boolean }) {
  const range = parseRange(query.range);
  return userDoubts(db, userId)
    .filter((item) => !item.deleted_at)
    .filter((item) => (query.includeArchived ? true : !item.archived_at))
    .filter((item) => isWithinRange(item.created_at, range))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function createDoubt(db: DbState, userId: string, rawText: string) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  const item: DoubtRecord = {
    id: createId(),
    user_id: userId,
    raw_text: normalized,
    created_at: nowIso(),
    archived_at: null,
    deleted_at: null
  };
  db.doubts.unshift(item);
  return item;
}

export function getDoubtDetail(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const notes = db.doubt_notes
    .filter((note) => note.doubt_id === doubtId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return { doubt, notes };
}

export function archiveDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  doubt.archived_at = doubt.archived_at ? null : nowIso();
  return doubt;
}

export function deleteDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return false;
  doubt.deleted_at = nowIso();
  db.doubt_notes = db.doubt_notes.filter((note) => note.doubt_id !== doubtId);
  appendAuditLog(db, {
    userId,
    action: "delete_doubt",
    targetType: "doubt",
    targetId: doubtId,
    detail: "deleted doubt and derived structures"
  });

  const deletingSpaces = new Set(db.thinking_spaces.filter((space) => space.source_time_doubt_id === doubtId).map((space) => space.id));
  if (deletingSpaces.size) {
    db.thinking_spaces = db.thinking_spaces.filter((space) => !deletingSpaces.has(space.id));
    db.thinking_nodes = db.thinking_nodes.filter((node) => !deletingSpaces.has(node.space_id));
    db.thinking_space_meta = db.thinking_space_meta.filter((meta) => !deletingSpaces.has(meta.space_id));
    db.thinking_inbox = db.thinking_inbox.filter((item) => !deletingSpaces.has(item.space_id));
  }
  return true;
}

export function upsertDoubtNote(db: DbState, userId: string, doubtId: string, noteText: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const normalized = collapseWhitespace(noteText).slice(0, 42);
  const existing = db.doubt_notes.find((item) => item.doubt_id === doubtId);
  if (!normalized) {
    db.doubt_notes = db.doubt_notes.filter((item) => item.doubt_id !== doubtId);
    return { deleted: true as const };
  }
  if (existing) {
    existing.note_text = normalized;
    existing.created_at = nowIso();
    return { deleted: false as const, note: existing };
  }
  const note: DoubtNoteRecord = { id: createId(), doubt_id: doubtId, note_text: normalized, created_at: nowIso() };
  db.doubt_notes.push(note);
  return { deleted: false as const, note };
}

export function createThinkingSpace(
  db: DbState,
  userId: string,
  rootQuestionText: string,
  sourceTimeDoubtId: string | null
) {
  const cleaned = collapseWhitespace(rootQuestionText);
  if (!cleaned) return null;

  const normalized = normalizeQuestionInput(cleaned, null);
  if (!normalized.ok) return null;
  const finalRootText = normalized.text;
  const converted = normalized.converted;
  const createdAsStatement = !normalized.is_question;
  const suggestedQuestions = normalized.suggested_questions.slice(0, 3);

  const activeCount = userSpaces(db, userId).filter((space) => space.status === "active").length;
  if (activeCount >= MAX_ACTIVE_SPACES) return { over_limit: true as const };
  const now = nowIso();
  const space: ThinkingSpaceRecord = {
    id: createId(),
    user_id: userId,
    root_question_text: finalRootText,
    status: "active",
    created_at: now,
    frozen_at: null,
    source_time_doubt_id: sourceTimeDoubtId
  };
  db.thinking_spaces.unshift(space);
  db.thinking_space_meta.unshift({
    space_id: space.id,
    user_freeze_note: null,
    export_version: 1,
    background_text: null,
    background_version: 0,
    suggestion_decay: 0,
    last_track_id: null,
    last_organized_order: -1
  });
  return { over_limit: false as const, space, converted, created_as_statement: createdAsStatement, suggested_questions: suggestedQuestions };
}

export function listThinkingSpaces(db: DbState, userId: string) {
  const spaces = userSpaces(db, userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const ids = new Set(spaces.map((space) => space.id));
  const spaceMeta = db.thinking_space_meta.filter((meta) => ids.has(meta.space_id)).map(sanitizeMeta);
  return { spaces, space_meta: spaceMeta };
}

export function createThinkingSpaceFromDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  return createThinkingSpace(db, userId, doubt.raw_text, doubt.id);
}

export function addQuestionToSpace(
  db: DbState,
  userId: string,
  spaceId: string,
  rawText: string,
  options?: { track_id?: string | null; from_suggestion?: boolean }
) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const normalized = normalizeQuestionInput(rawText, meta.background_text ?? null);
  if (!normalized.ok) {
    return {
      kind: "invalid" as const,
      reason: "ask_as_question" as const,
      suggested_questions: normalized.suggested_questions
    };
  }

  const quota = Math.max(0, 3 - (meta.suggestion_decay ?? 0));
  const suggestedQuestions = normalized.suggested_questions.slice(0, quota);

  const nodes = getSpaceNodes(db, spaceId);
  const trackMap = getTrackMap(nodes);
  const requestedTrackId = normalizeTrackId(options?.track_id ?? null);
  let trackId: string | null = null;
  if (requestedTrackId && requestedTrackId !== "__new__" && trackMap.has(requestedTrackId)) {
    trackId = requestedTrackId;
  } else if (requestedTrackId === "__new__") {
    trackId = createId();
  } else if (meta.last_track_id && trackMap.has(meta.last_track_id)) {
    trackId = meta.last_track_id;
  } else {
    trackId = chooseFallbackTrackId(nodes);
  }
  if (!trackId) trackId = createId();

  const node: ThinkingNodeRecord = {
    id: createId(),
    space_id: spaceId,
    parent_node_id: toTrackParentId(trackId),
    raw_question_text: normalized.text,
    note_text: normalized.raw_note,
    created_at: nowIso(),
    order_index: maxOrderIndex(nodes) + 1,
    is_suggested: Boolean(options?.from_suggestion),
    state: "normal",
    dimension: classifyDimension(normalized.text)
  };
  db.thinking_nodes.push(node);
  meta.last_track_id = trackId;
  meta.suggestion_decay = options?.from_suggestion ? Math.min(3, (meta.suggestion_decay ?? 0) + 1) : 0;
  enforceMaxNodes(db, spaceId);

  return {
    kind: "ok" as const,
    node,
    normalized_question_text: normalized.text,
    converted: normalized.converted,
    note_text: normalized.raw_note,
    track_id: trackId,
    suggested_questions: suggestedQuestions
  };
}

export function rebuildSpace(db: DbState, userId: string, spaceId: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;
  if (space.status !== "active") return { rebuilt: false as const, nodes_added: 0, moved_count: 0 };

  const nodes = getSpaceNodes(db, spaceId);
  if (!nodes.length) return { rebuilt: true as const, nodes_added: 0, moved_count: 0 };

  const meta = ensureMeta(db, spaceId);
  const checkpoint = meta.last_organized_order ?? -1;
  const candidates = nodes.filter((node) => node.order_index > checkpoint);
  if (!candidates.length) return { rebuilt: true as const, nodes_added: 0, moved_count: 0 };

  const tracks = getTrackMap(nodes);
  const profiles = new Map<string, ReturnType<typeof getTrackProfile>>();
  for (const [trackId, trackNodes] of tracks.entries()) {
    profiles.set(trackId, getTrackProfile(trackNodes));
  }

  let moved = 0;
  for (const node of candidates) {
    const currentTrackId = trackIdFromNode(node);
    const currentProfile = profiles.get(currentTrackId);
    if (!currentProfile) continue;

    const currentScore = scoreNodeForTrack(node, currentProfile, true);
    let bestTrackId = currentTrackId;
    let bestScore = currentScore;

    for (const [trackId, profile] of profiles.entries()) {
      if (trackId === currentTrackId) continue;
      const score = scoreNodeForTrack(node, profile);
      if (score > bestScore) {
        bestScore = score;
        bestTrackId = trackId;
      }
    }

    if (bestTrackId !== currentTrackId && bestScore >= 0.52 && bestScore - currentScore >= 0.16) {
      node.parent_node_id = toTrackParentId(bestTrackId);
      moved += 1;
      continue;
    }

    const currentTrackNodes = tracks.get(currentTrackId) ?? [];
    if (currentScore < 0.18 && currentTrackNodes.length > 1) {
      const newTrackId = createId();
      node.parent_node_id = toTrackParentId(newTrackId);
      tracks.set(newTrackId, [node]);
      profiles.set(newTrackId, getTrackProfile([node]));
      moved += 1;
    }
  }

  meta.last_organized_order = Math.max(checkpoint, ...candidates.map((item) => item.order_index));
  const latestTrackId = chooseFallbackTrackId(getSpaceNodes(db, spaceId));
  if (!meta.last_track_id || (latestTrackId && !getTrackMap(getSpaceNodes(db, spaceId)).has(meta.last_track_id))) {
    meta.last_track_id = latestTrackId;
  }
  return { rebuilt: true as const, nodes_added: 0, moved_count: moved };
}

export function getSpaceView(db: DbState, userId: string, spaceId: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;

  const nodes = getSpaceNodes(db, spaceId);
  const meta = ensureMeta(db, spaceId);
  const tracks = getTrackMap(nodes);

  const echoes = new Map<string, Array<{ trackId: string; nodeId: string }>>();
  for (const node of nodes) {
    const key = echoKey(node.raw_question_text);
    if (!key) continue;
    const list = echoes.get(key);
    const entry = { trackId: trackIdFromNode(node), nodeId: node.id };
    if (list) list.push(entry);
    else echoes.set(key, [entry]);
  }

  const trackRows = [...tracks.entries()]
    .map(([trackId, trackNodes]) => ({
      trackId,
      firstOrder: trackNodes[0]?.order_index ?? Number.MAX_SAFE_INTEGER,
      title: trackNodes[0]?.raw_question_text ?? "未命名疑问",
      nodes: trackNodes
    }))
    .sort((a, b) => a.firstOrder - b.firstOrder);

  const trackPayload = trackRows.map((track) => ({
    id: track.trackId,
    title_question_text: track.title,
    node_count: track.nodes.length,
    nodes: track.nodes.map((node) => {
      const key = echoKey(node.raw_question_text);
      const related = key ? (echoes.get(key) ?? []).filter((item) => item.trackId !== track.trackId) : [];
      const jump = related[0] ?? null;
      return {
        id: node.id,
        raw_question_text: node.raw_question_text,
        note_text: node.note_text ?? null,
        created_at: node.created_at,
        is_suggested: node.is_suggested,
        echo_track_id: jump?.trackId ?? null,
        echo_node_id: jump?.nodeId ?? null
      };
    })
  }));

  let currentTrackId: string | null = null;
  if (meta.last_track_id && tracks.has(meta.last_track_id)) currentTrackId = meta.last_track_id;
  if (!currentTrackId) currentTrackId = chooseFallbackTrackId(nodes);

  const suggestionQuota = Math.max(0, 3 - (meta.suggestion_decay ?? 0));
  const suggestedQuestions = buildSuggestedQuestions(space.root_question_text, meta.background_text ?? null, suggestionQuota);

  return {
    root: space,
    current_track_id: currentTrackId,
    tracks: trackPayload,
    suggested_questions: suggestedQuestions,
    freeze_note: meta.user_freeze_note ?? null,
    background_text: meta.background_text ?? null,
    background_version: meta.background_version ?? 0
  };
}

export function setActiveTrack(db: DbState, userId: string, spaceId: string, trackId: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  const meta = ensureMeta(db, spaceId);
  const nodes = getSpaceNodes(db, spaceId);
  const tracks = getTrackMap(nodes);
  if (!trackId) {
    meta.last_track_id = null;
    return { kind: "ok" as const, track_id: null };
  }
  const normalized = normalizeTrackId(trackId);
  if (!normalized || normalized === "__new__") return { kind: "track_not_found" as const };
  if (!tracks.has(normalized)) return { kind: "track_not_found" as const };
  meta.last_track_id = normalized;
  return { kind: "ok" as const, track_id: normalized };
}

export function updateSpaceBackground(db: DbState, userId: string, spaceId: string, backgroundText: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  const meta = ensureMeta(db, spaceId);
  const normalized = backgroundText ? collapseWhitespace(backgroundText) : "";
  if (!normalized) {
    if (meta.background_text !== null) {
      meta.background_text = null;
      meta.background_version = (meta.background_version ?? 0) + 1;
    }
    return { kind: "ok" as const, background_text: null, background_version: meta.background_version ?? 0 };
  }
  if (normalized.length < 100 || normalized.length > 300) return { kind: "invalid_length" as const };

  if (meta.background_text !== normalized) {
    meta.background_text = normalized;
    meta.background_version = (meta.background_version ?? 0) + 1;
  }
  return { kind: "ok" as const, background_text: meta.background_text, background_version: meta.background_version ?? 0 };
}

export function moveNode(db: DbState, userId: string, nodeId: string, targetTrackId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return null;
  if (space.status !== "active") return { readonly: true as const };

  const normalizedTarget = normalizeTrackId(targetTrackId);
  const nextTrackId = normalizedTarget === "__new__" || !normalizedTarget ? createId() : normalizedTarget;
  node.parent_node_id = toTrackParentId(nextTrackId);
  node.dimension = classifyDimension(node.raw_question_text);
  const meta = ensureMeta(db, node.space_id);
  meta.last_track_id = nextTrackId;
  return { readonly: false as const, node, track_id: nextTrackId };
}

export function markNodeMisplaced(db: DbState, userId: string, nodeId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return null;
  if (space.status !== "active") return { readonly: true as const };

  const nodes = getSpaceNodes(db, node.space_id).filter((item) => item.id !== node.id);
  const tracks = getTrackMap(nodes);
  const profiles = new Map<string, ReturnType<typeof getTrackProfile>>();
  for (const [trackId, trackNodes] of tracks.entries()) profiles.set(trackId, getTrackProfile(trackNodes));

  let targetTrackId: string | null = null;
  let bestScore = 0;
  for (const [trackId, profile] of profiles.entries()) {
    const score = scoreNodeForTrack(node, profile);
    if (score > bestScore) {
      bestScore = score;
      targetTrackId = trackId;
    }
  }
  if (!targetTrackId || bestScore < 0.42) targetTrackId = createId();

  node.parent_node_id = toTrackParentId(targetTrackId);
  node.dimension = classifyDimension(node.raw_question_text);
  const meta = ensureMeta(db, node.space_id);
  meta.last_track_id = targetTrackId;
  return { readonly: false as const, node, track_id: targetTrackId };
}

export function deleteNode(db: DbState, userId: string, nodeId: string) {
  const node = db.thinking_nodes.find((item) => item.id === nodeId);
  if (!node) return { kind: "not_found" as const };
  const space = requireSpace(db, userId, node.space_id);
  if (!space) return { kind: "not_found" as const };
  if (space.status !== "active") return { kind: "readonly" as const };

  db.thinking_nodes = db.thinking_nodes.filter((item) => item.id !== nodeId);
  const meta = ensureMeta(db, node.space_id);
  const fallback = chooseFallbackTrackId(getSpaceNodes(db, node.space_id));
  if (!fallback) meta.last_track_id = null;
  else if (!meta.last_track_id || !getTrackMap(getSpaceNodes(db, node.space_id)).has(meta.last_track_id)) meta.last_track_id = fallback;
  return { kind: "ok" as const, space_id: node.space_id };
}

export function freezeSpace(db: DbState, userId: string, spaceId: string, userFreezeNote: string | null) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;
  if (space.status !== "active") return { already_frozen: true as const, space };

  const note = userFreezeNote ? collapseWhitespace(userFreezeNote).slice(0, 48) : "";
  space.status = "frozen";
  space.frozen_at = nowIso();

  const meta = ensureMeta(db, spaceId);
  meta.user_freeze_note = note || null;
  meta.export_version += 1;

  return { already_frozen: false as const, space, freeze_note: meta.user_freeze_note };
}

export function setSpaceStatus(db: DbState, userId: string, spaceId: string, targetStatus: "active" | "archived") {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return { kind: "not_found" as const };

  if (targetStatus === "archived") {
    space.status = "archived";
    return { kind: "ok" as const, space };
  }

  if (space.status === "active") return { kind: "ok" as const, space };
  const activeCount = userSpaces(db, userId).filter((item) => item.status === "active").length;
  if (activeCount >= MAX_ACTIVE_SPACES) return { kind: "over_limit" as const };
  space.status = "active";
  return { kind: "ok" as const, space };
}

export function getThinkingSnapshot(db: DbState, userId: string): ThinkingSnapshot {
  const spaces = userSpaces(db, userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const spaceIds = new Set(spaces.map((space) => space.id));
  const nodes = db.thinking_nodes
    .filter((node) => spaceIds.has(node.space_id))
    .sort((a, b) => a.order_index - b.order_index);
  const metas = db.thinking_space_meta.filter((meta) => spaceIds.has(meta.space_id)).map(sanitizeMeta);
  const inbox = db.thinking_inbox.filter((item) => spaceIds.has(item.space_id));

  const inboxMap: ThinkingSnapshot["inbox"] = {};
  for (const item of inbox) {
    if (!inboxMap[item.space_id]) inboxMap[item.space_id] = [];
    inboxMap[item.space_id].push({
      id: item.id,
      rawText: item.raw_text,
      createdAt: item.created_at
    });
  }
  for (const key of Object.keys(inboxMap)) {
    inboxMap[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  return {
    spaces: spaces.map((space) => ({
      id: space.id,
      userId: space.user_id,
      rootQuestionText: space.root_question_text,
      status: space.status,
      createdAt: space.created_at,
      frozenAt: space.frozen_at,
      sourceTimeDoubtId: space.source_time_doubt_id
    })),
    nodes: nodes.map((node) => ({
      id: node.id,
      spaceId: node.space_id,
      parentNodeId: node.parent_node_id,
      rawQuestionText: node.raw_question_text,
      noteText: node.note_text ?? null,
      createdAt: node.created_at,
      orderIndex: node.order_index,
      isSuggested: node.is_suggested,
      state: node.state,
      dimension: node.dimension
    })),
    spaceMeta: metas.map((meta) => ({
      spaceId: meta.space_id,
      userFreezeNote: meta.user_freeze_note,
      exportVersion: meta.export_version,
      backgroundText: meta.background_text ?? null,
      backgroundVersion: meta.background_version ?? 0,
      suggestionDecay: meta.suggestion_decay ?? 0,
      lastTrackId: meta.last_track_id ?? null,
      lastOrganizedOrder: meta.last_organized_order ?? -1
    })),
    inbox: inboxMap,
    assistEnabled: true
  };
}

export function replaceThinkingSnapshot(db: DbState, userId: string, snapshot: ThinkingSnapshot) {
  const nextSpaces: ThinkingSpaceRecord[] = (snapshot.spaces ?? []).map((space) => ({
    id: typeof space.id === "string" ? space.id : createId(),
    user_id: userId,
    root_question_text: collapseWhitespace(space.rootQuestionText ?? ""),
    status: space.status === "active" || space.status === "frozen" || space.status === "archived" ? space.status : "active",
    created_at: typeof space.createdAt === "string" ? space.createdAt : nowIso(),
    frozen_at: typeof space.frozenAt === "string" ? space.frozenAt : null,
    source_time_doubt_id: typeof space.sourceTimeDoubtId === "string" ? space.sourceTimeDoubtId : null
  }));
  const spaceIds = new Set(nextSpaces.map((space) => space.id));

  const nextNodes: ThinkingNodeRecord[] = (snapshot.nodes ?? [])
    .filter((node) => typeof node.spaceId === "string" && spaceIds.has(node.spaceId))
    .map((node) => ({
      id: typeof node.id === "string" ? node.id : createId(),
      space_id: node.spaceId,
      parent_node_id: typeof node.parentNodeId === "string" ? node.parentNodeId : null,
      raw_question_text: collapseWhitespace(node.rawQuestionText ?? ""),
      note_text: typeof node.noteText === "string" ? collapseWhitespace(node.noteText) : null,
      created_at: typeof node.createdAt === "string" ? node.createdAt : nowIso(),
      order_index: Number.isFinite(node.orderIndex) ? node.orderIndex : 0,
      is_suggested: Boolean(node.isSuggested),
      state: node.state === "hidden" ? ("hidden" as const) : ("normal" as const),
      dimension: node.dimension ?? "definition"
    }))
    .filter((node) => node.raw_question_text);

  const nextMeta: ThinkingSpaceMetaRecord[] = (snapshot.spaceMeta ?? [])
    .filter((meta) => typeof meta.spaceId === "string" && spaceIds.has(meta.spaceId))
    .map((meta) =>
      sanitizeMeta({
        space_id: meta.spaceId,
        user_freeze_note: typeof meta.userFreezeNote === "string" ? collapseWhitespace(meta.userFreezeNote).slice(0, 48) : null,
        export_version: Number.isFinite(meta.exportVersion) && meta.exportVersion > 0 ? meta.exportVersion : 1,
        background_text: typeof meta.backgroundText === "string" ? collapseWhitespace(meta.backgroundText) : null,
        background_version:
          typeof meta.backgroundVersion === "number" && Number.isFinite(meta.backgroundVersion) && meta.backgroundVersion >= 0
            ? meta.backgroundVersion
            : 0,
        suggestion_decay:
          typeof meta.suggestionDecay === "number" && Number.isFinite(meta.suggestionDecay) && meta.suggestionDecay >= 0
            ? meta.suggestionDecay
            : 0,
        last_track_id: typeof meta.lastTrackId === "string" ? meta.lastTrackId : null,
        last_organized_order:
          Number.isFinite(meta.lastOrganizedOrder) && typeof meta.lastOrganizedOrder === "number" ? meta.lastOrganizedOrder : -1
      })
    );

  const rawInbox = snapshot.inbox ?? {};
  const nextInbox = Object.entries(rawInbox).flatMap(([spaceId, list]) => {
    if (!spaceIds.has(spaceId)) return [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : createId(),
        space_id: spaceId,
        raw_text: collapseWhitespace(item.rawText ?? ""),
        created_at: typeof item.createdAt === "string" ? item.createdAt : nowIso()
      }))
      .filter((item) => item.raw_text);
  });

  const userSpaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  db.thinking_spaces = [...db.thinking_spaces.filter((space) => space.user_id !== userId), ...nextSpaces];
  db.thinking_nodes = [
    ...db.thinking_nodes.filter((node) => !userSpaceIds.has(node.space_id)),
    ...nextNodes.sort((a, b) => a.order_index - b.order_index)
  ];
  db.thinking_space_meta = [...db.thinking_space_meta.filter((meta) => !userSpaceIds.has(meta.space_id)), ...nextMeta];
  db.thinking_inbox = [...db.thinking_inbox.filter((item) => !userSpaceIds.has(item.space_id)), ...nextInbox];
}

export function exportSpace(db: DbState, userId: string, spaceId: string) {
  const space = requireSpace(db, userId, spaceId);
  if (!space) return null;

  const nodes = getSpaceNodes(db, spaceId);
  const meta = sanitizeMeta(db.thinking_space_meta.find((item) => item.space_id === spaceId) ?? ensureMeta(db, spaceId));
  const tracks = getTrackMap(nodes);
  const orderedTracks = [...tracks.entries()].sort(
    (a, b) => (a[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER) - (b[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER)
  );

  const lines: string[] = [];
  lines.push("# 思考轨道导出");
  lines.push("");
  lines.push(`- 根问题：${space.root_question_text}`);
  lines.push(`- 状态：${space.status}`);
  lines.push(`- 创建时间：${formatDateTime(space.created_at)}`);
  if (space.frozen_at) lines.push(`- 冻结时间：${formatDateTime(space.frozen_at)}`);
  if (meta.background_text) {
    lines.push(`- 背景版本：v${meta.background_version ?? 0}`);
    lines.push(`- 背景说明：${meta.background_text}`);
  }
  lines.push("");

  orderedTracks.forEach(([trackId, trackNodes], index) => {
    lines.push(`## 方向 ${index + 1}`);
    lines.push(`- 轨道ID：${trackId}`);
    lines.push(`- 首条疑问：${trackNodes[0]?.raw_question_text ?? ""}`);
    for (const node of trackNodes) {
      lines.push(`- ${node.raw_question_text}`);
      if (node.note_text) lines.push(`  - 附注：${node.note_text}`);
    }
    lines.push("");
  });

  if (meta.user_freeze_note) {
    lines.push("## 当前状态");
    lines.push(meta.user_freeze_note);
    lines.push("");
  }

  return { markdown: lines.join("\n") };
}

export function deleteAllUserData(db: DbState, userId: string, reason: string) {
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) return null;

  const spaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  const doubtIds = new Set(db.doubts.filter((doubt) => doubt.user_id === userId).map((doubt) => doubt.id));

  const counts = {
    doubts: doubtIds.size,
    notes: db.doubt_notes.filter((note) => doubtIds.has(note.doubt_id)).length,
    spaces: spaceIds.size,
    nodes: db.thinking_nodes.filter((node) => spaceIds.has(node.space_id)).length,
    inbox: db.thinking_inbox.filter((item) => spaceIds.has(item.space_id)).length
  };

  db.doubt_notes = db.doubt_notes.filter((note) => !doubtIds.has(note.doubt_id));
  db.doubts = db.doubts.filter((doubt) => doubt.user_id !== userId);
  db.thinking_nodes = db.thinking_nodes.filter((node) => !spaceIds.has(node.space_id));
  db.thinking_inbox = db.thinking_inbox.filter((item) => !spaceIds.has(item.space_id));
  db.thinking_space_meta = db.thinking_space_meta.filter((meta) => !spaceIds.has(meta.space_id));
  db.thinking_spaces = db.thinking_spaces.filter((space) => space.user_id !== userId);

  user.deleted_at = nowIso();
  appendAuditLog(db, {
    userId,
    action: "delete_all_data",
    targetType: "user",
    targetId: userId,
    detail: `reason=${reason}; doubts=${counts.doubts}; notes=${counts.notes}; spaces=${counts.spaces}; nodes=${counts.nodes}; inbox=${counts.inbox}`
  });

  return counts;
}


