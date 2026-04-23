export type LayerTab = "life" | "thinking" | "settings";
export type OpeningPhase = "black" | "stars" | "text" | "ready";
export type LifeRange = "week" | "month" | "all";

export type LifeDoubt = {
  id: string;
  rawText: string;
  firstNodePreview: string | null;
  lastNodePreview: string | null;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  syncStatus?: "pending" | "repair" | null;
};

export type LifeNote = {
  id: string;
  doubtId: string;
  noteText: string;
  createdAt: string;
};

export type LifeStore = {
  doubts: LifeDoubt[];
  notes: LifeNote[];
  meta: {
    twelvePlaybackSeen: boolean;
  };
};

export type ThinkingSpaceStatus = "active" | "hidden";
export type ThinkingNodeState = "normal" | "hidden";
export type DimensionKey = "definition" | "resource" | "risk" | "value" | "path" | "evidence";

export type ThinkingSpace = {
  id: string;
  userId: string;
  rootQuestionText: string;
  status: ThinkingSpaceStatus;
  createdAt: string;
  lastActivityAt?: string;
  writtenToTimeAt: string | null;
  sourceTimeDoubtId: string | null;
  syncStatus?: "pending" | "repair" | null;
};

export type ThinkingScratchItem = {
  id: string;
  rawText: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  derivedSpaceId: string | null;
  fedTimeDoubtId: string | null;
  syncStatus?: "pending" | "repair" | null;
};

export type ThinkingNode = {
  id: string;
  spaceId: string;
  parentNodeId: string | null;
  rawQuestionText: string;
  imageAssetId?: string | null;
  createdAt: string;
  orderIndex: number;
  isSuggested: boolean;
  state: ThinkingNodeState;
  dimension: DimensionKey;
  syncStatus?: "pending" | "repair" | null;
};

export type ThinkingMediaAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  uploadedAt: string | null;
  deletedAt: string | null;
  syncStatus?: "pending" | "repair" | null;
};

export type ThinkingMediaRef = {
  assetId: string;
  entityType: "thinking_node" | "thinking_space";
  entityId: string;
  role: "cover" | "background";
  position: number;
  createdAt: string;
};

export type ThinkingSpaceMeta = {
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
};

export type ThinkingInboxItem = {
  id: string;
  rawText: string;
  createdAt: string;
};

export type ThinkingStore = {
  spaces: ThinkingSpace[];
  nodes: ThinkingNode[];
  spaceMeta: ThinkingSpaceMeta[];
  mediaAssets: ThinkingMediaAsset[];
  scratch: ThinkingScratchItem[];
  inbox: Record<string, ThinkingInboxItem[]>;
  assistEnabled: boolean;
  timezone: string;
  fixedTopSpacesEnabled: boolean;
  fixedTopSpaceIds: string[];
};

export type StarDot = {
  left: number;
  top: number;
  opacity: number;
  delay: number;
  duration: number;
  large: boolean;
};

export const LIFE_STORAGE_KEY = "zhihuo_life_v1";
export const THINKING_STORAGE_KEY = "zhihuo_thinking_v16";
const LEGACY_STORAGE_KEY = "time_archive_v2";
export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export const OPENING_MS = 600;
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_SPACES = 7;
export const MAX_BRANCH_COUNT = 7;
export const MAX_BRANCH_VISIBLE = 3;
export const MAX_VISIBLE_NODES = 15;
export const MAX_SPACE_NODES = 40;
export const USER_ID = "local_user";

export const DIMENSIONS: DimensionKey[] = ["definition", "resource", "risk", "value", "path", "evidence"];

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  definition: "定义 / 范围",
  resource: "资源 / 约束",
  risk: "风险 / 后果",
  value: "价值 / 动机",
  path: "路径 / 策略",
  evidence: "证据 / 验证"
};

export const EMPTY_LIFE_STORE: LifeStore = {
  doubts: [],
  notes: [],
  meta: { twelvePlaybackSeen: false }
};

export const EMPTY_THINKING_STORE: ThinkingStore = {
  spaces: [],
  nodes: [],
  spaceMeta: [],
  mediaAssets: [],
  scratch: [],
  inbox: {},
  assistEnabled: true,
  timezone: DEFAULT_TIMEZONE,
  fixedTopSpacesEnabled: false,
  fixedTopSpaceIds: []
};

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function sanitizeTimeZone(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: input }).format(new Date());
    return input;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function formatDateTimeInTimeZone(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const normalized = sanitizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: normalized,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function formatTimeInTimeZone(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: sanitizeTimeZone(timeZone),
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function getDateKeyInTimeZone(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: sanitizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function isOlderThanOneYear(iso: string) {
  return Date.now() - new Date(iso).getTime() >= ONE_YEAR_MS;
}

export function daysBetween(a: string, b: string) {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / (24 * 60 * 60 * 1000);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function copyText(value: string, onDone: () => void) {
  try {
    await navigator.clipboard.writeText(value);
    onDone();
  } catch {
    // clipboard failure ignored
  }
}

export function createStars(count: number) {
  const stars: StarDot[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      left: Number((Math.random() * 100).toFixed(2)),
      top: Number((Math.random() * 100).toFixed(2)),
      opacity: Number((0.12 + Math.random() * 0.42).toFixed(2)),
      delay: Number((-Math.random() * 8).toFixed(2)),
      duration: Number((6 + Math.random() * 9).toFixed(2)),
      large: Math.random() > 0.84
    });
  }
  return stars;
}

export function normalizeQuestionInput(raw: string): { ok: true; text: string; converted: boolean } | { ok: false } {
  const text = collapseWhitespace(raw);
  if (!text || text.length < 2) return { ok: false };
  if (/[?？]$/.test(text)) return { ok: true, text, converted: false };
  const trimmed = text.replace(/[。.!！？?]+$/g, "");
  if (!trimmed) return { ok: false };
  return { ok: true, text: trimmed, converted: false };
}

export function classifyDimension(text: string): DimensionKey {
  const rules: Record<DimensionKey, RegExp[]> = {
    definition: [/define|what|scope|boundary|meaning|definition|定义|范围|边界|是什么/i],
    resource: [/resource|constraint|cost|budget|time|capacity|资源|成本|预算|时间/i],
    risk: [/risk|worst|failure|loss|outcome|风险|后果|最坏|失败/i],
    value: [/value|motivation|why|worth|purpose|价值|动机|意义|为什么/i],
    path: [/path|strategy|step|plan|how|路径|策略|步骤|如何|怎么/i],
    evidence: [/evidence|prove|data|metric|validate|证据|验证|数据|指标/i]
  };
  for (const dimension of DIMENSIONS) {
    if (rules[dimension].some((rule) => rule.test(text))) return dimension;
  }
  return DIMENSIONS[hashText(text) % DIMENSIONS.length];
}

export function pickDefaultSpaceId(spaces: ThinkingSpace[]) {
  const active = spaces.find((space) => space.status === "active");
  if (active) return active.id;
  return spaces[0]?.id ?? null;
}

export function pickPlaybackRoute(sortedAscending: LifeDoubt[]) {
  const count = clamp(Math.ceil(sortedAscending.length * 0.45), 5, 6);
  if (sortedAscending.length <= count) return sortedAscending;
  const picks: LifeDoubt[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (sortedAscending.length - 1)) / (count - 1));
    if (used.has(index)) continue;
    used.add(index);
    picks.push(sortedAscending[index]);
  }
  return picks;
}

export function resolveLifeGap(prev: LifeDoubt | null, current: LifeDoubt, denseMode: boolean) {
  if (!prev) return 0;
  const gap = daysBetween(prev.createdAt, current.createdAt);

  // Baseline rhythm before the 5th-entry density reveal.
  let base = 20;
  if (gap <= 1) base = 16;
  else if (gap <= 7) base = 18;
  else if (gap <= 30) base = 20;
  else if (gap <= 120) base = 24;
  else base = 28;

  if (!denseMode) return base;

  // At 5+ entries, expand overall spacing by ~12% while keeping same-day/week denser.
  const expanded = base * 1.12;
  if (gap <= 1) return Math.round(expanded * 0.86);
  if (gap <= 7) return Math.round(expanded * 0.92);
  return Math.round(expanded);
}

export function loadLifeStore(): LifeStore {
  if (typeof window === "undefined") return EMPTY_LIFE_STORE;
  try {
    const raw = window.localStorage.getItem(LIFE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LifeStore>;
      return normalizeLifeStore(parsed);
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return EMPTY_LIFE_STORE;
    const parsed = JSON.parse(legacy) as {
      doubts?: Array<{ id?: string; text?: string; createdAt?: string; archivedAt?: string | null; note?: string }>;
      meta?: { twelvePlaybackSeen?: boolean };
    };
    const doubts: LifeDoubt[] = [];
    const notes: LifeNote[] = [];
    for (const item of parsed.doubts ?? []) {
      const rawText = typeof item.text === "string" ? collapseWhitespace(item.text) : "";
      if (!rawText) continue;
      const id = typeof item.id === "string" ? item.id : createId();
      doubts.push({
        id,
        rawText,
        firstNodePreview: null,
        lastNodePreview: null,
        createdAt: toIso(item.createdAt),
        archivedAt: item.archivedAt ? toIso(item.archivedAt) : null,
        deletedAt: null
      });
      if (item.note && collapseWhitespace(item.note)) {
        notes.push({ id: createId(), doubtId: id, noteText: collapseWhitespace(item.note).slice(0, 42), createdAt: new Date().toISOString() });
      }
    }
    return { doubts, notes, meta: { twelvePlaybackSeen: Boolean(parsed.meta?.twelvePlaybackSeen) } };
  } catch {
    return EMPTY_LIFE_STORE;
  }
}

export function persistLifeStore(store: LifeStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(store));
}

export function loadThinkingStore(): ThinkingStore {
  if (typeof window === "undefined") return EMPTY_THINKING_STORE;
  try {
    const raw = window.localStorage.getItem(THINKING_STORAGE_KEY);
    if (!raw) return EMPTY_THINKING_STORE;
    return normalizeThinkingStore(JSON.parse(raw) as Partial<ThinkingStore>);
  } catch {
    return EMPTY_THINKING_STORE;
  }
}

export function persistThinkingStore(store: ThinkingStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THINKING_STORAGE_KEY, JSON.stringify(store));
}

function normalizeLifeStore(store: Partial<LifeStore>): LifeStore {
  const doubts = (store.doubts ?? []).map((item) => ({
    id: typeof item.id === "string" ? item.id : createId(),
    rawText: collapseWhitespace(typeof item.rawText === "string" ? item.rawText : ""),
    firstNodePreview: typeof item.firstNodePreview === "string" ? item.firstNodePreview : null,
    lastNodePreview: typeof item.lastNodePreview === "string" ? item.lastNodePreview : null,
    createdAt: toIso(item.createdAt),
    archivedAt: item.archivedAt ? toIso(item.archivedAt) : null,
    deletedAt: item.deletedAt ? toIso(item.deletedAt) : null
  })).filter((item) => item.rawText);
  const notes = (store.notes ?? []).map((item) => ({
    id: typeof item.id === "string" ? item.id : createId(),
    doubtId: typeof item.doubtId === "string" ? item.doubtId : "",
    noteText: collapseWhitespace(typeof item.noteText === "string" ? item.noteText : "").slice(0, 42),
    createdAt: toIso(item.createdAt)
  })).filter((item) => item.doubtId && item.noteText);
  return { doubts, notes, meta: { twelvePlaybackSeen: Boolean(store.meta?.twelvePlaybackSeen) } };
}

export function normalizeThinkingStore(store: Partial<ThinkingStore>): ThinkingStore {
  const spaces: ThinkingSpace[] = (store.spaces ?? []).map((space) => {
    const legacySpace = space as Partial<ThinkingSpace> & { frozenAt?: string | null };
    const status: ThinkingSpaceStatus = space.status === "active" ? "active" : "hidden";
    return {
      id: typeof space.id === "string" ? space.id : createId(),
      userId: typeof space.userId === "string" ? space.userId : USER_ID,
      rootQuestionText: typeof space.rootQuestionText === "string" ? space.rootQuestionText : "Untitled?",
      status,
      createdAt: toIso(space.createdAt),
      lastActivityAt: typeof space.lastActivityAt === "string" ? toIso(space.lastActivityAt) : toIso(space.createdAt),
      writtenToTimeAt:
        typeof space.writtenToTimeAt === "string"
          ? toIso(space.writtenToTimeAt)
          : legacySpace.frozenAt
            ? toIso(legacySpace.frozenAt)
            : null,
      sourceTimeDoubtId: typeof space.sourceTimeDoubtId === "string" ? space.sourceTimeDoubtId : null
    };
  });
  const nodes: ThinkingNode[] = (store.nodes ?? [])
    .map((node) => {
      const state: ThinkingNodeState = node.state === "hidden" ? "hidden" : "normal";
      return {
        id: typeof node.id === "string" ? node.id : createId(),
        spaceId: typeof node.spaceId === "string" ? node.spaceId : "",
        parentNodeId: typeof node.parentNodeId === "string" ? node.parentNodeId : null,
        rawQuestionText: typeof node.rawQuestionText === "string" ? node.rawQuestionText : "",
        imageAssetId: typeof node.imageAssetId === "string" && node.imageAssetId.trim() ? node.imageAssetId : null,
        createdAt: toIso(node.createdAt),
        orderIndex: typeof node.orderIndex === "number" ? node.orderIndex : 0,
        isSuggested: Boolean(node.isSuggested),
        state,
        dimension: DIMENSIONS.includes(node.dimension as DimensionKey) ? (node.dimension as DimensionKey) : "definition"
      };
    })
    .filter((item) => item.spaceId && item.rawQuestionText);
  const spaceMeta = (store.spaceMeta ?? []).map((meta) => ({
    spaceId: typeof meta.spaceId === "string" ? meta.spaceId : "",
    exportVersion: typeof meta.exportVersion === "number" ? meta.exportVersion : 1,
    backgroundText: typeof meta.backgroundText === "string" ? meta.backgroundText : null,
    backgroundVersion: typeof meta.backgroundVersion === "number" ? meta.backgroundVersion : 0,
    backgroundAssetIds: Array.isArray(meta.backgroundAssetIds) ? meta.backgroundAssetIds.filter((id) => typeof id === "string") : [],
    backgroundSelectedAssetId:
      typeof meta.backgroundSelectedAssetId === "string" && meta.backgroundSelectedAssetId.trim() ? meta.backgroundSelectedAssetId : null,
    suggestionDecay: typeof meta.suggestionDecay === "number" ? meta.suggestionDecay : 0,
    lastTrackId: typeof meta.lastTrackId === "string" ? meta.lastTrackId : null,
    lastOrganizedOrder: typeof meta.lastOrganizedOrder === "number" ? meta.lastOrganizedOrder : -1,
    parkingTrackId: typeof meta.parkingTrackId === "string" ? meta.parkingTrackId : null,
    pendingTrackId: typeof meta.pendingTrackId === "string" ? meta.pendingTrackId : null,
    emptyTrackIds: Array.isArray(meta.emptyTrackIds) ? meta.emptyTrackIds.filter((id) => typeof id === "string") : []
  })).filter((meta) => meta.spaceId);
  const mediaAssets: ThinkingMediaAsset[] = (store.mediaAssets ?? [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      fileName: typeof item.fileName === "string" ? item.fileName : "image",
      mimeType: typeof item.mimeType === "string" && item.mimeType.trim() ? item.mimeType : "application/octet-stream",
      byteSize: typeof item.byteSize === "number" && Number.isFinite(item.byteSize) ? Math.max(0, item.byteSize) : 0,
      sha256: typeof item.sha256 === "string" ? item.sha256 : "",
      width: typeof item.width === "number" && Number.isFinite(item.width) ? item.width : null,
      height: typeof item.height === "number" && Number.isFinite(item.height) ? item.height : null,
      createdAt: toIso(item.createdAt),
      uploadedAt: item.uploadedAt ? toIso(item.uploadedAt) : null,
      deletedAt: item.deletedAt ? toIso(item.deletedAt) : null
    }))
    .filter((item) => item.id && item.fileName);
  const inbox: Record<string, ThinkingInboxItem[]> = {};
  for (const [spaceId, items] of Object.entries(store.inbox ?? {})) {
    inbox[spaceId] = (items ?? []).map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      rawText: typeof item.rawText === "string" ? item.rawText : "",
      createdAt: toIso(item.createdAt)
    })).filter((item) => item.rawText);
  }
  const scratch: ThinkingScratchItem[] = (store.scratch ?? [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createId(),
      rawText: collapseWhitespace(typeof item.rawText === "string" ? item.rawText : ""),
      createdAt: toIso(item.createdAt),
      updatedAt: toIso(item.updatedAt),
      archivedAt: item.archivedAt ? toIso(item.archivedAt) : null,
      deletedAt: item.deletedAt ? toIso(item.deletedAt) : null,
      derivedSpaceId: typeof item.derivedSpaceId === "string" ? item.derivedSpaceId : null,
      fedTimeDoubtId: typeof item.fedTimeDoubtId === "string" ? item.fedTimeDoubtId : null
    }))
    .filter((item) => item.rawText);
  const validSpaceIdSet = new Set(spaces.map((space) => space.id));
  const fixedTopSpaceIds = Array.from(
    new Set(
      (Array.isArray(store.fixedTopSpaceIds) ? store.fixedTopSpaceIds : []).filter(
        (id): id is string => typeof id === "string" && validSpaceIdSet.has(id)
      )
    )
  ).slice(0, 3);

  return {
    spaces,
    nodes,
    spaceMeta,
    mediaAssets,
    scratch,
    inbox,
    assistEnabled: store.assistEnabled !== false,
    timezone: sanitizeTimeZone(store.timezone),
    fixedTopSpacesEnabled: store.fixedTopSpacesEnabled === true,
    fixedTopSpaceIds
  };
}

function toIso(input: unknown) {
  if (typeof input !== "string") return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hashText(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

