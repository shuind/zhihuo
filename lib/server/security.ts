import { createHash } from "node:crypto";

import type { DbState } from "@/lib/server/types";
import { readThinkingMediaAssetFile } from "@/lib/server/media";

type UserExportData = {
  version: "2026-03-03";
  exported_at: string;
  user_id: string;
  user_email: string;
  life: {
    doubts: DbState["doubts"];
    notes: DbState["doubt_notes"];
  };
  thinking: {
    spaces: DbState["thinking_spaces"];
    nodes: DbState["thinking_nodes"];
    inbox: DbState["thinking_inbox"];
    space_meta: DbState["thinking_space_meta"];
    node_links: DbState["thinking_node_links"];
    media_assets: Array<{
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
      content_base64: string;
    }>;
  };
  audit: DbState["audit_logs"];
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function formatFriendlyDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${hh}:${mm}`;
}

export async function buildUserExport(db: DbState, userId: string, userEmail: string): Promise<{ payload: UserExportData; checksum: string }> {
  const spaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  const doubtIds = new Set(db.doubts.filter((doubt) => doubt.user_id === userId).map((doubt) => doubt.id));
  const mediaAssets = db.thinking_media_assets.filter((asset) => asset.user_id === userId && !asset.deleted_at);

  const payload: UserExportData = {
    version: "2026-03-03",
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_email: userEmail,
    life: {
      doubts: db.doubts.filter((doubt) => doubt.user_id === userId),
      notes: db.doubt_notes.filter((note) => doubtIds.has(note.doubt_id))
    },
    thinking: {
      spaces: db.thinking_spaces.filter((space) => space.user_id === userId),
      nodes: db.thinking_nodes.filter((node) => spaceIds.has(node.space_id)),
      inbox: db.thinking_inbox.filter((item) => spaceIds.has(item.space_id)),
      space_meta: db.thinking_space_meta.filter((meta) => spaceIds.has(meta.space_id)),
      node_links: db.thinking_node_links.filter((link) => spaceIds.has(link.space_id)),
      media_assets: await Promise.all(
        mediaAssets.map(async (asset) => ({
          id: asset.id,
          user_id: asset.user_id,
          file_name: asset.file_name,
          mime_type: asset.mime_type,
          byte_size: asset.byte_size,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          created_at: asset.created_at,
          uploaded_at: asset.uploaded_at,
          deleted_at: asset.deleted_at,
          content_base64: (await readThinkingMediaAssetFile(userId, asset.id)).toString("base64")
        }))
      )
    },
    audit: db.audit_logs.filter((item) => item.user_id === userId)
  };

  const checksum = sha256Hex(stableStringify(payload));
  return { payload, checksum };
}

export function verifyUserExportIntegrity(payload: unknown, checksum: unknown) {
  if (!payload || typeof payload !== "object") return { ok: false as const, reason: "payload must be object" };
  if (typeof checksum !== "string" || checksum.length < 32) return { ok: false as const, reason: "checksum is invalid" };

  const actual = sha256Hex(stableStringify(payload));
  if (actual !== checksum) return { ok: false as const, reason: "checksum mismatch", actual_checksum: actual };
  return { ok: true as const, actual_checksum: actual };
}

const TRACK_PREFIX = "track:";

function stripTrackPrefix(value: string | null | undefined) {
  if (!value) return "default";
  return value.startsWith(TRACK_PREFIX) ? value.slice(TRACK_PREFIX.length) : value;
}

export function buildUserExportMarkdown(
  db: DbState,
  userId: string,
  userEmail: string,
  options?: { includeLife?: boolean; includeThinking?: boolean }
) {
  const includeLife = options?.includeLife !== false;
  const includeThinking = options?.includeThinking !== false;

  const allUserSpaces = db.thinking_spaces
    .filter((space) => space.user_id === userId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const activeSpaces = allUserSpaces.filter((space) => space.status === "active");
  const writtenToTimeSpaces = allUserSpaces.filter((space) => space.status === "hidden" || Boolean(space.frozen_at));

  const activeSpaceIds = new Set(activeSpaces.map((space) => space.id));
  const allMetaMap = new Map(
    db.thinking_space_meta
      .filter((meta) => allUserSpaces.some((space) => space.id === meta.space_id))
      .map((meta) => [meta.space_id, meta])
  );

  const nodesForActiveSpaces = db.thinking_nodes
    .filter((node) => activeSpaceIds.has(node.space_id) && node.state === "normal")
    .sort((a, b) => a.order_index - b.order_index);

  const lifeDoubts = db.doubts
    .filter((doubt) => doubt.user_id === userId && !doubt.deleted_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const lifeDoubtIds = new Set(lifeDoubts.map((doubt) => doubt.id));

  const lifeNotes = db.doubt_notes
    .filter((note) => lifeDoubtIds.has(note.doubt_id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const notesByDoubt = new Map<string, typeof lifeNotes>();
  for (const note of lifeNotes) {
    const list = notesByDoubt.get(note.doubt_id);
    if (list) list.push(note);
    else notesByDoubt.set(note.doubt_id, [note]);
  }

  const lines: string[] = [];
  lines.push("# 知惑导出（Markdown）");
  lines.push("");
  lines.push(`- 导出时间：${formatFriendlyDateTime(new Date().toISOString())}`);
  lines.push(`- 导出范围：${includeLife ? "时间层" : ""}${includeLife && includeThinking ? " + " : ""}${includeThinking ? "思路层" : ""}`);
  lines.push("");

  if (includeLife) {
    lines.push("## 时间层");
    lines.push("");

    if (!lifeDoubts.length) {
      lines.push("- 暂无时间层内容");
      lines.push("");
    } else {
      for (const [index, doubt] of lifeDoubts.entries()) {
        lines.push(`### 条目 ${index + 1}`);
        lines.push(`- 内容：${doubt.raw_text}`);
        lines.push(`- 创建时间：${formatFriendlyDateTime(doubt.created_at)}`);
        if (doubt.archived_at) lines.push(`- 归档时间：${formatFriendlyDateTime(doubt.archived_at)}`);
        const relatedNotes = notesByDoubt.get(doubt.id) ?? [];
        if (relatedNotes.length) {
          lines.push("- 注记：");
          for (const note of relatedNotes) {
            lines.push(`  - ${note.note_text}（${formatFriendlyDateTime(note.created_at)}）`);
          }
        }
        lines.push("");
      }
    }

    if (writtenToTimeSpaces.length) {
      lines.push("### 来自思路层（已写入时间）");
      lines.push("");
      for (const [index, space] of writtenToTimeSpaces.entries()) {
        const meta = allMetaMap.get(space.id);
        lines.push(`- ${index + 1}. ${space.root_question_text}`);
        lines.push(`  - 写回时间：${formatFriendlyDateTime(space.frozen_at)}`);
        if (meta?.user_freeze_note) {
          lines.push(`  - 批注：${meta.user_freeze_note}`);
        }
      }
      lines.push("");
    }
  }

  if (includeThinking) {
    lines.push("## 思路层（仅活跃）");
    lines.push("");

    if (!activeSpaces.length) {
      lines.push("- 暂无活跃思路空间");
      lines.push("");
    } else {
      for (const [spaceIndex, space] of activeSpaces.entries()) {
        const meta = allMetaMap.get(space.id);
        const milestones = new Set((meta?.milestone_node_ids ?? []).filter((id) => typeof id === "string"));
        const spaceNodes = nodesForActiveSpaces.filter((node) => node.space_id === space.id);
        const trackMap = new Map<string, typeof spaceNodes>();

        for (const node of spaceNodes) {
          const trackId = stripTrackPrefix(node.parent_node_id);
          const list = trackMap.get(trackId);
          if (list) list.push(node);
          else trackMap.set(trackId, [node]);
        }

        const orderedTracks = [...trackMap.entries()].sort(
          (a, b) => (a[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER) - (b[1][0]?.order_index ?? Number.MAX_SAFE_INTEGER)
        );

        lines.push(`### 空间 ${spaceIndex + 1}：${space.root_question_text}`);
        lines.push(`- 创建时间：${formatFriendlyDateTime(space.created_at)}`);
        if (meta?.user_freeze_note) lines.push(`- 批注：${meta.user_freeze_note}`);
        lines.push("");

        for (const [trackIndex, [, trackNodes]] of orderedTracks.entries()) {
          lines.push(`#### 方向 ${trackIndex + 1}`);
          for (const node of trackNodes) {
            const star = milestones.has(node.id) ? "⭐ " : "";
            lines.push(`- ${star}${node.raw_question_text}`);
            if (node.note_text) lines.push(`  - 注记：${node.note_text}`);
          }
          lines.push("");
        }
      }
    }
  }

  if (!includeLife && !includeThinking) {
    lines.push("- 未选择导出范围");
    lines.push("");
  }

  return lines.join("\n");
}
