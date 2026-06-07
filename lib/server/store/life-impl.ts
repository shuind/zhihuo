import type { DbState, DoubtNoteRecord, DoubtRecord } from "@/lib/server/types";
import { appendAuditLog, normalizeLetterLines, requireDoubt, userDoubts } from "@/lib/server/store/shared";
import { bumpUserRevision } from "@/lib/server/store/sync-impl";
import { collapseWhitespace, createId, nowIso } from "@/lib/server/utils";

const DOUBT_NOTE_MAX_LENGTH = 160;

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

export function listDoubts(db: DbState, userId: string, query: { range: string | null; includeArchived: boolean }) {
  const range = parseRange(query.range);
  return userDoubts(db, userId)
    .filter((item) => !item.deleted_at)
    .filter((item) => isWithinRange(item.created_at, range))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function createDoubt(
  db: DbState,
  userId: string,
  rawText: string,
  options?: { clientEntityId?: string | null; clientUpdatedAt?: string | null }
) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  return createDoubtAt(db, userId, normalized, options?.clientUpdatedAt ?? nowIso(), {
    clientEntityId: options?.clientEntityId ?? null
  });
}

export function createDoubtAt(
  db: DbState,
  userId: string,
  rawText: string,
  createdAt: string,
  options?: { clientEntityId?: string | null }
) {
  const normalized = collapseWhitespace(rawText);
  if (!normalized) return null;
  const preferredId = typeof options?.clientEntityId === "string" && options.clientEntityId.trim() ? options.clientEntityId : null;
  if (preferredId) {
    const existed = db.doubts.find((item) => item.id === preferredId && item.user_id === userId && !item.deleted_at);
    if (existed) return existed;
  }
  const item: DoubtRecord = {
    id: preferredId ?? createId(),
    user_id: userId,
    raw_text: normalized,
    first_node_preview: null,
    last_node_preview: null,
    letter_title: null,
    letter_lines: [],
    letter_variant: null,
    letter_seal_text: null,
    created_at: createdAt,
    archived_at: null,
    deleted_at: null
  };
  db.doubts.unshift(item);
  bumpUserRevision(db, userId);
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

export function replaceLifeSnapshot(
  db: DbState,
  userId: string,
  snapshot: {
    doubts?: Array<{
      id?: string;
      raw_text?: string;
      first_node_preview?: string | null;
      last_node_preview?: string | null;
      letter_title?: string | null;
      letter_lines?: string[] | string | null;
      letter_variant?: string | null;
      letter_seal_text?: string | null;
      created_at?: string;
      archived_at?: string | null;
      deleted_at?: string | null;
    }>;
    notes?: Array<{
      id?: string;
      doubt_id?: string;
      note_text?: string;
      created_at?: string;
    }>;
  }
) {
  const nextDoubts: DoubtRecord[] = (snapshot.doubts ?? [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      user_id: userId,
      raw_text: collapseWhitespace(item.raw_text ?? ""),
      first_node_preview:
        typeof item.first_node_preview === "string" ? collapseWhitespace(item.first_node_preview) || null : null,
      last_node_preview:
        typeof item.last_node_preview === "string" ? collapseWhitespace(item.last_node_preview) || null : null,
      letter_title: typeof item.letter_title === "string" ? item.letter_title.trim() || null : null,
      letter_lines: normalizeLetterLines(item.letter_lines),
      letter_variant: typeof item.letter_variant === "string" ? item.letter_variant.trim() || null : null,
      letter_seal_text: typeof item.letter_seal_text === "string" ? item.letter_seal_text.trim() || null : null,
      created_at: typeof item.created_at === "string" ? item.created_at : nowIso(),
      archived_at: typeof item.archived_at === "string" ? item.archived_at : null,
      deleted_at: typeof item.deleted_at === "string" ? item.deleted_at : null
    }))
    .filter((item) => item.raw_text);

  const doubtIds = new Set(nextDoubts.map((item) => item.id));
  const nextNotes: DoubtNoteRecord[] = (snapshot.notes ?? [])
    .filter((item) => typeof item.doubt_id === "string" && doubtIds.has(item.doubt_id))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      doubt_id: item.doubt_id as string,
      note_text: collapseWhitespace(item.note_text ?? "").slice(0, DOUBT_NOTE_MAX_LENGTH),
      created_at: typeof item.created_at === "string" ? item.created_at : nowIso()
    }))
    .filter((item) => item.note_text);

  db.doubts = [...db.doubts.filter((item) => item.user_id !== userId), ...nextDoubts];
  db.doubt_notes = [
    ...db.doubt_notes.filter((item) => {
      const parent = db.doubts.find((doubt) => doubt.id === item.doubt_id);
      return parent?.user_id !== userId;
    }),
    ...nextNotes
  ];
  bumpUserRevision(db, userId);
}

export function archiveDoubt(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  doubt.archived_at = doubt.archived_at ? null : nowIso();
  bumpUserRevision(db, userId);
  return doubt;
}

export function ensureDoubtArchived(db: DbState, userId: string, doubtId: string) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return { kind: "not_found" as const };
  if (doubt.archived_at) return { kind: "ok" as const, doubt, changed: false as const };
  doubt.archived_at = nowIso();
  bumpUserRevision(db, userId);
  return { kind: "ok" as const, doubt, changed: true as const };
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
    db.thinking_node_links = db.thinking_node_links.filter((link) => !deletingSpaces.has(link.space_id));
  }
  bumpUserRevision(db, userId);
  return true;
}

export function upsertDoubtNote(
  db: DbState,
  userId: string,
  doubtId: string,
  noteText: string,
  options?: { noteId?: string | null; clientUpdatedAt?: string | null }
) {
  const doubt = requireDoubt(db, userId, doubtId);
  if (!doubt) return null;
  const normalized = collapseWhitespace(noteText).slice(0, DOUBT_NOTE_MAX_LENGTH);
  const requestedNoteId = typeof options?.noteId === "string" && options.noteId.trim() ? options.noteId.trim() : null;
  const notes = db.doubt_notes
    .filter((item) => item.doubt_id === doubtId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const existing = requestedNoteId ? notes.find((item) => item.id === requestedNoteId) ?? null : null;
  if (!normalized) {
    const deleteId = existing?.id ?? null;
    if (!deleteId) return { deleted: true as const };
    db.doubt_notes = db.doubt_notes.filter((item) => item.id !== deleteId);
    bumpUserRevision(db, userId);
    return { deleted: true as const };
  }
  if (existing) {
    existing.note_text = normalized;
    existing.created_at = nowIso();
    bumpUserRevision(db, userId);
    return { deleted: false as const, note: existing };
  }
  const note: DoubtNoteRecord = {
    id: requestedNoteId ?? createId(),
    doubt_id: doubtId,
    note_text: normalized,
    created_at: options?.clientUpdatedAt ?? nowIso()
  };
  db.doubt_notes.push(note);
  bumpUserRevision(db, userId);
  return { deleted: false as const, note };
}
