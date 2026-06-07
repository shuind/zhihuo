import type { ThinkingSpaceView } from "@/components/thinking-layer";
import { formatDateTime, type ThinkingNode, type ThinkingSpace, type ThinkingStore } from "@/components/zhihuo-model";

export function isThinkingMediaAssetReferenced(store: ThinkingStore, assetId: string, options?: { ignoreNodeId?: string | null }) {
  if (!assetId) return false;
  if (
    store.nodes.some(
      (node) => node.id !== options?.ignoreNodeId && node.imageAssetId === assetId
    )
  ) {
    return true;
  }
  return store.spaceMeta.some((meta) => (meta.backgroundAssetIds ?? []).includes(assetId));
}

export function collectUnreferencedMediaAssetIds(store: ThinkingStore, candidateAssetIds: Iterable<string>) {
  const next = new Set<string>();
  for (const assetId of candidateAssetIds) {
    if (!assetId || isThinkingMediaAssetReferenced(store, assetId)) continue;
    next.add(assetId);
  }
  return [...next];
}

export function toTrackParentId(trackId: string) {
  return trackId.startsWith("track:") ? trackId : `track:${trackId}`;
}

export function fromTrackParentId(parentNodeId: string | null | undefined) {
  if (!parentNodeId) return null;
  return parentNodeId.startsWith("track:") ? parentNodeId.slice(6) : parentNodeId;
}

export function normalizeTrackList(tracks: ThinkingSpaceView["tracks"]): ThinkingSpaceView["tracks"] {
  return tracks.map((track) => ({
    ...track,
    nodeCount: track.nodes.length
  }));
}
export function normalizeThinkingMultilineText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function getSpaceViewNodeIds(view: ThinkingSpaceView) {
  return new Set(view.tracks.flatMap((track) => track.nodes.map((node) => node.id)));
}

export function getStoreSpaceNodeIds(store: ThinkingStore, spaceId: string) {
  return new Set(store.nodes.filter((node) => node.spaceId === spaceId && node.state !== "hidden").map((node) => node.id));
}

export function isSpaceViewConsistentWithStore(store: ThinkingStore, spaceId: string, view: ThinkingSpaceView | null | undefined) {
  if (!view || view.spaceId !== spaceId) return false;
  const storeNodeIds = getStoreSpaceNodeIds(store, spaceId);
  const viewNodeIds = getSpaceViewNodeIds(view);
  if (storeNodeIds.size !== viewNodeIds.size) return false;
  for (const nodeId of viewNodeIds) {
    if (!storeNodeIds.has(nodeId)) return false;
  }
  return true;
}

export function buildSpaceViewFromStore(store: ThinkingStore, spaceId: string): ThinkingSpaceView | null {
  const space = store.spaces.find((item) => item.id === spaceId);
  if (!space) return null;
  const meta = store.spaceMeta.find((item) => item.spaceId === spaceId) ?? null;
  const fallbackTrackId = meta?.lastTrackId ?? meta?.parkingTrackId ?? "local-track:" + spaceId;
  const trackIds = new Set<string>();
  const trackNodes = new Map<string, ThinkingSpaceView["tracks"][number]["nodes"]>();

  for (const trackId of meta?.emptyTrackIds ?? []) {
    trackIds.add(trackId);
    trackNodes.set(trackId, []);
  }
  if (meta?.parkingTrackId) {
    trackIds.add(meta.parkingTrackId);
    if (!trackNodes.has(meta.parkingTrackId)) trackNodes.set(meta.parkingTrackId, []);
  }

  const sortedNodes = store.nodes
    .filter((node) => node.spaceId === spaceId && node.state !== "hidden")
    .sort((a, b) => a.orderIndex - b.orderIndex || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const node of sortedNodes) {
    const trackId = fromTrackParentId(node.parentNodeId) ?? fallbackTrackId;
    trackIds.add(trackId);
    const nodes = trackNodes.get(trackId) ?? [];
    nodes.push({
      id: node.id,
      questionText: node.rawQuestionText,
      imageAssetId: node.imageAssetId ?? null,
      noteText: null,
      answerText: null,
      isSuggested: node.isSuggested,
      dimension: node.dimension,
      createdAt: node.createdAt,
      echoTrackId: null,
      echoNodeId: null
    });
    trackNodes.set(trackId, nodes);
  }

  if (!trackIds.size) {
    trackIds.add(fallbackTrackId);
    trackNodes.set(fallbackTrackId, []);
  }

  const parkingTrackId = meta?.parkingTrackId ?? null;
  const tracks = Array.from(trackIds)
    .sort((a, b) => {
      if (a === parkingTrackId) return 1;
      if (b === parkingTrackId) return -1;
      return a.localeCompare(b);
    })
    .map((trackId) => {
      const nodes = trackNodes.get(trackId) ?? [];
      const isParking = parkingTrackId === trackId;
      return {
        id: trackId,
        titleQuestionText: isParking ? "????" : nodes[0]?.questionText ?? "???",
        isParking,
        isEmpty: nodes.length === 0,
        nodeCount: nodes.length,
        nodes
      } satisfies ThinkingSpaceView["tracks"][number];
    });

  return {
    spaceId,
    currentTrackId: meta?.lastTrackId ?? tracks.find((track) => !track.isParking)?.id ?? parkingTrackId ?? tracks[0]?.id ?? null,
    parkingTrackId,
    pendingTrackId: meta?.pendingTrackId ?? null,
    tracks: normalizeTrackList(tracks),
    suggestedQuestions: [],
    backgroundText: meta?.backgroundText ?? null,
    backgroundVersion: meta?.backgroundVersion ?? 0,
    backgroundAssetIds: meta?.backgroundAssetIds ?? [],
    backgroundSelectedAssetId: meta?.backgroundSelectedAssetId ?? null
  };
}

export function buildSettleLetterLinesFromView(view: ThinkingSpaceView) {
  return view.tracks.flatMap((track, index) => {
    const nodes = track.nodes.map((node) => node.questionText.trim()).filter(Boolean);
    if (!nodes.length) return [];
    const heading = track.isParking ? "未归入方向" : `方向 ${index + 1}`;
    return [heading, ...nodes];
  });
}

export function buildLocalSpaceExportMarkdown(store: ThinkingStore, space: ThinkingSpace, view: ThinkingSpaceView) {
  const mediaAssetIds = new Set(store.mediaAssets.filter((asset) => !asset.deletedAt).map((asset) => asset.id));
  const exportTracks = view.tracks.filter((track) => track.nodes.length > 0);
  const lines: string[] = [];

  lines.push(`# ${space.rootQuestionText}`);
  lines.push("");
  lines.push(`- 创建时间：${formatDateTime(space.createdAt)}`);
  lines.push("");

  exportTracks.forEach((track, index) => {
    lines.push(`## 方向 ${index + 1}`);
    for (const node of track.nodes) {
      lines.push(`- ${node.questionText}`);
      if (node.imageAssetId && mediaAssetIds.has(node.imageAssetId)) {
        lines.push(`  - 图片：${node.imageAssetId}`);
      }
      if (node.noteText) lines.push(`  - 附注：${node.noteText}`);
      if (node.answerText) lines.push(`  - 回答：${node.answerText}`);
    }
    lines.push("");
  });

  if (view.backgroundAssetIds.length) {
    lines.push("## 空间图集");
    for (const assetId of view.backgroundAssetIds) {
      if (!mediaAssetIds.has(assetId)) continue;
      lines.push(`- ${assetId}${view.backgroundSelectedAssetId === assetId ? "（当前选中）" : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function syncStoreNodesFromView(store: ThinkingStore, spaceId: string, view: ThinkingSpaceView): ThinkingStore {
  const existingById = new Map(store.nodes.filter((node) => node.spaceId === spaceId).map((node) => [node.id, node]));
  let orderIndex = 0;
  const nextNodes = view.tracks.flatMap((track) =>
    track.nodes.map((node) => {
      const existing = existingById.get(node.id);
        const next = {
          id: node.id,
          spaceId,
          parentNodeId: toTrackParentId(track.id),
          rawQuestionText: node.questionText,
          imageAssetId: node.imageAssetId ?? null,
          createdAt: existing?.createdAt ?? node.createdAt ?? new Date().toISOString(),
          orderIndex,
          isSuggested: node.isSuggested,
        state: "normal" as const,
        dimension: node.dimension ?? existing?.dimension ?? "definition"
      };
      orderIndex += 1;
      return next;
    })
  );

  return {
    ...store,
    nodes: [...store.nodes.filter((node) => node.spaceId !== spaceId), ...nextNodes]
  };
}

export function sortSpacesByLatestActivity(a: ThinkingSpace, b: ThinkingSpace) {
  return new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime();
}

export function safeTimeValue(value: string | null | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getSpaceLatestActivityTime(space: ThinkingSpace, nodes?: ThinkingNode[]) {
  let latest = safeTimeValue(space.createdAt) ?? Date.now();
  const explicitActivity = safeTimeValue(space.lastActivityAt);
  if (explicitActivity !== null) latest = Math.max(latest, explicitActivity);
  const writtenAt = safeTimeValue(space.writtenToTimeAt);
  if (writtenAt !== null) latest = Math.max(latest, writtenAt);
  for (const node of nodes ?? []) {
    if (node.spaceId !== space.id || node.state === "hidden") continue;
    const nodeTime = safeTimeValue(node.createdAt);
    if (nodeTime !== null) latest = Math.max(latest, nodeTime);
  }
  return latest;
}

export function computeSpaceActivityIso(space: ThinkingSpace, nodes: ThinkingNode[]) {
  return new Date(getSpaceLatestActivityTime(space, nodes)).toISOString();
}

export function withComputedSpaceActivity(store: ThinkingStore): ThinkingStore {
  return {
    ...store,
    spaces: store.spaces.map((space) => ({
      ...space,
      lastActivityAt: computeSpaceActivityIso(space, store.nodes)
    }))
  };
}

export function getIncompleteSpaceIdsForExport(store: ThinkingStore, thinkingViews: Record<string, ThinkingSpaceView>) {
  return store.spaces
    .filter((space) => {
      const visibleNodeCount = store.nodes.filter((node) => node.spaceId === space.id && node.state !== "hidden").length;
      if (visibleNodeCount > 0) return false;
      return !isSpaceViewConsistentWithStore(store, space.id, thinkingViews[space.id] ?? null);
    })
    .map((space) => space.id);
}
