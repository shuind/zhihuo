import { createHash } from "node:crypto";

import type { DbState } from "@/lib/server/types";

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

export function buildUserExport(db: DbState, userId: string, userEmail: string): { payload: UserExportData; checksum: string } {
  const spaceIds = new Set(db.thinking_spaces.filter((space) => space.user_id === userId).map((space) => space.id));
  const doubtIds = new Set(db.doubts.filter((doubt) => doubt.user_id === userId).map((doubt) => doubt.id));

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
      node_links: db.thinking_node_links.filter((link) => spaceIds.has(link.space_id))
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

export function buildUserExportMarkdown(db: DbState, userId: string, userEmail: string) {
  const spaces = db.thinking_spaces
    .filter((space) => space.user_id === userId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const spaceIds = new Set(spaces.map((space) => space.id));

  const nodes = db.thinking_nodes
    .filter((node) => spaceIds.has(node.space_id) && node.state === "normal")
    .sort((a, b) => a.order_index - b.order_index);
  const metaMap = new Map(db.thinking_space_meta.filter((meta) => spaceIds.has(meta.space_id)).map((meta) => [meta.space_id, meta]));

  const lines: string[] = [];
  lines.push("# 知惑系统导出（Markdown）");
  lines.push("");
  lines.push(`- 用户：${userEmail}`);
  lines.push(`- 用户ID：${userId}`);
  lines.push(`- 导出时间：${new Date().toISOString()}`);
  lines.push("");

  if (!spaces.length) {
    lines.push("暂无思考空间。");
    return lines.join("\n");
  }

  for (const [spaceIndex, space] of spaces.entries()) {
    const meta = metaMap.get(space.id);
    const milestones = new Set((meta?.milestone_node_ids ?? []).filter((id) => typeof id === "string"));
    const spaceNodes = nodes.filter((node) => node.space_id === space.id);
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

    lines.push(`## 空间 ${spaceIndex + 1}：${space.root_question_text}`);
    lines.push(`- 状态：${space.status}`);
    lines.push(`- 创建：${space.created_at}`);
    if (space.frozen_at) lines.push(`- 冻结：${space.frozen_at}`);
    if (meta?.user_freeze_note) lines.push(`- 当前状态：${meta.user_freeze_note}`);
    lines.push("");

    for (const [trackIndex, [, trackNodes]] of orderedTracks.entries()) {
      lines.push(`### 轨道 ${trackIndex + 1}`);
      for (const node of trackNodes) {
        const star = milestones.has(node.id) ? "⭐ " : "";
        lines.push(`- ${star}${node.raw_question_text}`);
        if (node.note_text) lines.push(`  - 附注：${node.note_text}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
