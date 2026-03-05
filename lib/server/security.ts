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
      space_meta: db.thinking_space_meta.filter((meta) => spaceIds.has(meta.space_id))
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
