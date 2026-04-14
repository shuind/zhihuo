"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LifeLayer } from "@/components/life-layer";
import { SettingsLayer } from "@/components/settings-layer";
import { ThinkingLayer, type ThinkingSpaceView } from "@/components/thinking-layer";
import {
  changePin,
  clearOfflineOwnerState,
  clearOfflineSnapshotByOwner,
  clearOfflineState,
  clearPinStatus,
  createOfflineSnapshotMeta,
  disablePin,
  enablePin,
  enqueueOfflineMutation,
  getGuestOwnerKey,
  getPinStatus,
  getOrCreateLocalProfileId,
  getUserOwnerKey,
  isOfflineNetworkError,
  listOfflineMutationsByOwner,
  loadOfflineSnapshotByOwner,
  removeOfflineMutation,
  saveOfflineSnapshotByOwner,
  updateOfflineMutation,
  verifyPin,
  type OfflineOwnerKey,
  type OfflineSnapshotMeta,
  type QueuedMutation
} from "@/components/offline-store";
import { canAccessGuestMode, canUseCloudSync } from "@/lib/capabilities";
import { apiFetch } from "@/lib/api-client";
import {
  type LayerTab,
  type LifeDoubt,
  type LifeNote,
  type ThinkingSpace,
  type ThinkingScratchItem,
  type ThinkingNodeLink,
  type ThinkingSpaceMeta,
  type TrackDirectionHint,
  type ThinkingStore,
  EMPTY_LIFE_STORE,
  EMPTY_THINKING_STORE,
  LIFE_STORAGE_KEY,
  MAX_ACTIVE_SPACES,
  OPENING_MS,
  THINKING_STORAGE_KEY,
  createId,
  createStars,
  loadLifeStore,
  loadThinkingStore,
  persistLifeStore,
  persistThinkingStore,
  pickDefaultSpaceId,
  sanitizeTimeZone
} from "@/components/zhihuo-model";

type ApiLifeDoubt = {
  id: string;
  raw_text: string;
  first_node_preview: string | null;
  last_node_preview: string | null;
  created_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

type ApiLifeNote = {
  id: string;
  doubt_id: string;
  note_text: string;
  created_at: string;
};

type ApiThinkingSpace = {
  id: string;
  user_id: string;
  root_question_text: string;
  status: "active" | "hidden";
  created_at: string;
  last_activity_at?: string;
  frozen_at: string | null;
  source_time_doubt_id: string | null;
};

type ApiThinkingScratch = {
  id: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  derived_space_id: string | null;
  fed_time_doubt_id: string | null;
};

type ApiThinkingSpaceMeta = {
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

type ApiThinkingTrackNode = {
  id: string;
  raw_question_text: string;
  note_text?: string | null;
  answer_text?: string | null;
  created_at: string;
  is_suggested: boolean;
  is_milestone?: boolean;
  has_related_link?: boolean;
  echo_track_id?: string | null;
  echo_node_id?: string | null;
};

type ApiThinkingTrack = {
  id: string;
  title_question_text: string;
  direction_hint?: TrackDirectionHint | null;
  is_parking?: boolean;
  is_empty?: boolean;
  node_count: number;
  nodes: ApiThinkingTrackNode[];
};

type ApiThinkingSpaceView = {
  root: ApiThinkingSpace;
  current_track_id?: string | null;
  tracks?: ApiThinkingTrack[];
  suggested_questions?: string[];
  freeze_note?: string | null;
  background_text?: string | null;
  background_version?: number;
  parking_track_id?: string | null;
  pending_track_id?: string | null;
  empty_track_ids?: string[];
  milestone_node_ids?: string[];
};

type SessionUser = {
  userId: string;
  email: string;
};

type ThinkingJumpTarget = {
  spaceId: string;
  mode: "root" | "freeze" | "milestone";
  trackId?: string | null;
  nodeId?: string | null;
  doubtId?: string;
};

type UserExportPayload = {
  version: "2026-03-03";
  exported_at: string;
  user_id: string;
  user_email: string;
  life: {
    doubts: Array<{
      id: string;
      raw_text: string;
      first_node_preview: string | null;
      last_node_preview: string | null;
      created_at: string;
      archived_at: string | null;
      deleted_at: string | null;
    }>;
    notes: Array<{
      id: string;
      doubt_id: string;
      note_text: string;
      created_at: string;
    }>;
  };
  thinking: {
    spaces: Array<{
      id: string;
      userId: string;
      rootQuestionText: string;
      status: "active" | "hidden";
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
      state: "normal" | "hidden";
      dimension: string;
    }>;
    space_meta: Array<{
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
    node_links: Array<{
      id: string;
      spaceId: string;
      sourceNodeId: string;
      targetNodeId: string;
      linkType: "related";
      score: number;
      createdAt: string;
    }>;
    inbox: Record<string, Array<{ id: string; rawText: string; createdAt: string }>>;
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
  };
  audit: Array<Record<string, never>>;
};

type BindingDialogState = {
  cloudPayload: UserExportPayload;
  submitting: boolean;
};

type OfflineRuntimeState =
  | "guest_ready"
  | "user_bootstrapping"
  | "user_syncing"
  | "user_sync_ready"
  | "user_offline_ready"
  | "binding_required"
  | "switching_account";

const RESTORE_OVER_LIMIT_NOTICE = "当前已有 7 个活跃空间，请先写入或删除一个活跃空间，再恢复这条思路";
const OFFLINE_RETRY_BASE_MS = 1200;
const OFFLINE_RETRY_MAX_MS = 5 * 60 * 1000;

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

async function sha256Hex(input: string) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasMeaningfulLocalData(lifeStore: typeof EMPTY_LIFE_STORE, thinkingStore: ThinkingStore) {
  return (
    lifeStore.doubts.length > 0 ||
    lifeStore.notes.length > 0 ||
    thinkingStore.spaces.length > 0 ||
    thinkingStore.nodes.length > 0 ||
    thinkingStore.scratch.length > 0 ||
    Object.values(thinkingStore.inbox).some((items) => items.length > 0)
  );
}

function isCloudPayloadEmpty(payload: UserExportPayload) {
  return (
    payload.life.doubts.length === 0 &&
    payload.life.notes.length === 0 &&
    payload.thinking.spaces.length === 0 &&
    payload.thinking.nodes.length === 0 &&
    (payload.thinking.scratch?.length ?? 0) === 0 &&
    Object.values(payload.thinking.inbox).every((items) => items.length === 0)
  );
}

function canonicalizeExportPayload(payload: UserExportPayload) {
  const rawSpaces = Array.isArray(payload.thinking.spaces) ? (payload.thinking.spaces as Array<Record<string, unknown>>) : [];
  const rawNodes = Array.isArray(payload.thinking.nodes) ? (payload.thinking.nodes as Array<Record<string, unknown>>) : [];
  const rawMeta = Array.isArray(payload.thinking.space_meta) ? (payload.thinking.space_meta as Array<Record<string, unknown>>) : [];
  const rawNodeLinks = Array.isArray(payload.thinking.node_links) ? (payload.thinking.node_links as Array<Record<string, unknown>>) : [];
  const rawScratch = Array.isArray(payload.thinking.scratch) ? (payload.thinking.scratch as Array<Record<string, unknown>>) : [];
  const rawInbox = payload.thinking.inbox as unknown;
  const normalizedInboxEntries = Array.isArray(rawInbox)
    ? (rawInbox as Array<Record<string, unknown>>).reduce<Record<string, Array<Record<string, unknown>>>>((acc, item) => {
        const spaceId = typeof item.space_id === "string" ? item.space_id : typeof item.spaceId === "string" ? item.spaceId : "";
        if (!spaceId) return acc;
        if (!acc[spaceId]) acc[spaceId] = [];
        acc[spaceId].push(item);
        return acc;
      }, {})
    : Object.fromEntries(
        Object.entries((rawInbox ?? {}) as Record<string, unknown>).map(([spaceId, items]) => [
          spaceId,
          Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []
        ])
      );

  return {
    life: {
      doubts: [...payload.life.doubts]
        .map((item) => ({
          id: item.id,
          raw_text: item.raw_text,
          first_node_preview: item.first_node_preview ?? null,
          last_node_preview: item.last_node_preview ?? null,
          created_at: item.created_at,
          archived_at: item.archived_at ?? null,
          deleted_at: item.deleted_at ?? null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      notes: [...payload.life.notes]
        .map((item) => ({
          id: item.id,
          doubt_id: item.doubt_id,
          note_text: item.note_text,
          created_at: item.created_at
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    },
    thinking: {
      spaces: rawSpaces
        .map((item) => ({
          id: item.id,
          rootQuestionText:
            typeof item.rootQuestionText === "string"
              ? item.rootQuestionText
              : typeof item.root_question_text === "string"
                ? item.root_question_text
                : "",
          status: item.status,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          frozenAt:
            typeof item.frozenAt === "string" ? item.frozenAt : typeof item.frozen_at === "string" ? item.frozen_at : null,
          sourceTimeDoubtId:
            typeof item.sourceTimeDoubtId === "string"
              ? item.sourceTimeDoubtId
              : typeof item.source_time_doubt_id === "string"
                ? item.source_time_doubt_id
                : null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      nodes: rawNodes
        .map((item) => ({
          id: item.id,
          spaceId: typeof item.spaceId === "string" ? item.spaceId : typeof item.space_id === "string" ? item.space_id : "",
          parentNodeId:
            typeof item.parentNodeId === "string"
              ? item.parentNodeId
              : typeof item.parent_node_id === "string"
                ? item.parent_node_id
                : null,
          rawQuestionText:
            typeof item.rawQuestionText === "string"
              ? item.rawQuestionText
              : typeof item.raw_question_text === "string"
                ? item.raw_question_text
                : "",
          noteText:
            typeof item.noteText === "string" ? item.noteText : typeof item.note_text === "string" ? item.note_text : null,
          answerText:
            typeof item.answerText === "string"
              ? item.answerText
              : typeof item.answer_text === "string"
                ? item.answer_text
                : null,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          orderIndex:
            typeof item.orderIndex === "number"
              ? item.orderIndex
              : typeof item.order_index === "number"
                ? item.order_index
                : 0,
          isSuggested: item.isSuggested === true || item.is_suggested === true,
          state: item.state,
          dimension: item.dimension
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      space_meta: rawMeta
        .map((item) => ({
          spaceId: typeof item.spaceId === "string" ? item.spaceId : typeof item.space_id === "string" ? item.space_id : "",
          userFreezeNote:
            typeof item.userFreezeNote === "string"
              ? item.userFreezeNote
              : typeof item.user_freeze_note === "string"
                ? item.user_freeze_note
                : null,
          exportVersion:
            typeof item.exportVersion === "number"
              ? item.exportVersion
              : typeof item.export_version === "number"
                ? item.export_version
                : 1,
          backgroundText:
            typeof item.backgroundText === "string"
              ? item.backgroundText
              : typeof item.background_text === "string"
                ? item.background_text
                : null,
          backgroundVersion:
            typeof item.backgroundVersion === "number"
              ? item.backgroundVersion
              : typeof item.background_version === "number"
                ? item.background_version
                : 0,
          suggestionDecay:
            typeof item.suggestionDecay === "number"
              ? item.suggestionDecay
              : typeof item.suggestion_decay === "number"
                ? item.suggestion_decay
                : 0,
          lastTrackId:
            typeof item.lastTrackId === "string"
              ? item.lastTrackId
              : typeof item.last_track_id === "string"
                ? item.last_track_id
                : null,
          lastOrganizedOrder:
            typeof item.lastOrganizedOrder === "number"
              ? item.lastOrganizedOrder
              : typeof item.last_organized_order === "number"
                ? item.last_organized_order
                : -1,
          parkingTrackId:
            typeof item.parkingTrackId === "string"
              ? item.parkingTrackId
              : typeof item.parking_track_id === "string"
                ? item.parking_track_id
                : null,
          pendingTrackId:
            typeof item.pendingTrackId === "string"
              ? item.pendingTrackId
              : typeof item.pending_track_id === "string"
                ? item.pending_track_id
                : null,
          emptyTrackIds: [...(((item.emptyTrackIds ?? item.empty_track_ids ?? []) as string[]) ?? [])].sort(),
          milestoneNodeIds: [...(((item.milestoneNodeIds ?? item.milestone_node_ids ?? []) as string[]) ?? [])].sort(),
          trackDirectionHints: Object.fromEntries(
            Object.entries(((item.trackDirectionHints ?? item.track_direction_hints ?? {}) as Record<string, TrackDirectionHint | null>) ?? {}).sort(
              ([a], [b]) => a.localeCompare(b)
            )
          )
        }))
        .sort((a, b) => a.spaceId.localeCompare(b.spaceId)),
      node_links: rawNodeLinks
        .map((item) => ({
          id: item.id,
          spaceId: typeof item.spaceId === "string" ? item.spaceId : typeof item.space_id === "string" ? item.space_id : "",
          sourceNodeId:
            typeof item.sourceNodeId === "string"
              ? item.sourceNodeId
              : typeof item.source_node_id === "string"
                ? item.source_node_id
                : "",
          targetNodeId:
            typeof item.targetNodeId === "string"
              ? item.targetNodeId
              : typeof item.target_node_id === "string"
                ? item.target_node_id
                : "",
          linkType:
            (typeof item.linkType === "string" ? item.linkType : typeof item.link_type === "string" ? item.link_type : "related") as "related",
          score: item.score,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : ""
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      inbox: Object.fromEntries(
        Object.entries(normalizedInboxEntries)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([spaceId, items]) => [
            spaceId,
            [...items]
              .map((item) => ({
                id: item.id,
                rawText: typeof item.rawText === "string" ? item.rawText : typeof item.raw_text === "string" ? item.raw_text : "",
                createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : ""
              }))
              .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          ])
      ),
      scratch: rawScratch
        .map((item) => ({
          id: item.id,
          rawText: typeof item.rawText === "string" ? item.rawText : typeof item.raw_text === "string" ? item.raw_text : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.created_at === "string" ? item.created_at : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : typeof item.updated_at === "string" ? item.updated_at : "",
          archivedAt:
            typeof item.archivedAt === "string" ? item.archivedAt : typeof item.archived_at === "string" ? item.archived_at : null,
          deletedAt:
            typeof item.deletedAt === "string" ? item.deletedAt : typeof item.deleted_at === "string" ? item.deleted_at : null,
          derivedSpaceId:
            typeof item.derivedSpaceId === "string"
              ? item.derivedSpaceId
              : typeof item.derived_space_id === "string"
                ? item.derived_space_id
                : null,
          fedTimeDoubtId:
            typeof item.fedTimeDoubtId === "string"
              ? item.fedTimeDoubtId
              : typeof item.fed_time_doubt_id === "string"
                ? item.fed_time_doubt_id
                : null
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }
  };
}

function arePayloadsEquivalent(localPayload: UserExportPayload, cloudPayload: UserExportPayload) {
  return stableStringify(canonicalizeExportPayload(localPayload)) === stableStringify(canonicalizeExportPayload(cloudPayload));
}

function toTrackParentId(trackId: string) {
  return trackId.startsWith("track:") ? trackId : `track:${trackId}`;
}

function fromTrackParentId(parentNodeId: string | null | undefined) {
  if (!parentNodeId) return null;
  return parentNodeId.startsWith("track:") ? parentNodeId.slice(6) : parentNodeId;
}

function normalizeTrackListWithLinks(
  tracks: ThinkingSpaceView["tracks"],
  nodeLinks: ThinkingNodeLink[],
  spaceId: string
): ThinkingSpaceView["tracks"] {
  const linkedNodeIds = new Set<string>();
  for (const link of nodeLinks) {
    if (link.spaceId !== spaceId) continue;
    linkedNodeIds.add(link.sourceNodeId);
    linkedNodeIds.add(link.targetNodeId);
  }
  return tracks.map((track) => ({
    ...track,
    nodeCount: track.nodes.length,
    nodes: track.nodes.map((node) => ({
      ...node,
      hasRelatedLink: linkedNodeIds.has(node.id)
    }))
  }));
}

function getSpaceViewNodeIds(view: ThinkingSpaceView) {
  return new Set(view.tracks.flatMap((track) => track.nodes.map((node) => node.id)));
}

function getStoreSpaceNodeIds(store: ThinkingStore, spaceId: string) {
  return new Set(store.nodes.filter((node) => node.spaceId === spaceId && node.state !== "hidden").map((node) => node.id));
}

function isSpaceViewConsistentWithStore(store: ThinkingStore, spaceId: string, view: ThinkingSpaceView | null | undefined) {
  if (!view || view.spaceId !== spaceId) return false;
  const storeNodeIds = getStoreSpaceNodeIds(store, spaceId);
  const viewNodeIds = getSpaceViewNodeIds(view);
  if (storeNodeIds.size !== viewNodeIds.size) return false;
  for (const nodeId of viewNodeIds) {
    if (!storeNodeIds.has(nodeId)) return false;
  }
  return true;
}

function buildSpaceViewFromStore(store: ThinkingStore, spaceId: string): ThinkingSpaceView | null {
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
      noteText: null,
      answerText: null,
      isSuggested: node.isSuggested,
      isMilestone: (meta?.milestoneNodeIds ?? []).includes(node.id),
      hasRelatedLink: false,
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
        directionHint: meta?.trackDirectionHints?.[trackId] ?? null,
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
    milestoneNodeIds: meta?.milestoneNodeIds ?? [],
    tracks: normalizeTrackListWithLinks(tracks, store.nodeLinks, spaceId),
    suggestedQuestions: [],
    freezeNote: meta?.userFreezeNote ?? null,
    backgroundText: meta?.backgroundText ?? null,
    backgroundVersion: meta?.backgroundVersion ?? 0
  };
}

function syncStoreNodesFromView(store: ThinkingStore, spaceId: string, view: ThinkingSpaceView): ThinkingStore {
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
        createdAt: existing?.createdAt ?? node.createdAt ?? new Date().toISOString(),
        orderIndex,
        isSuggested: node.isSuggested,
        state: "normal" as const,
        dimension: existing?.dimension ?? "definition"
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

function mapApiLifeDoubt(item: ApiLifeDoubt): LifeDoubt {
  return {
    id: item.id,
    rawText: item.raw_text,
    firstNodePreview: typeof item.first_node_preview === "string" ? item.first_node_preview : null,
    lastNodePreview: typeof item.last_node_preview === "string" ? item.last_node_preview : null,
    createdAt: item.created_at,
    archivedAt: item.archived_at,
    deletedAt: item.deleted_at
  };
}

function mapApiLifeNote(item: ApiLifeNote): LifeNote {
  return {
    id: item.id,
    doubtId: item.doubt_id,
    noteText: item.note_text,
    createdAt: item.created_at
  };
}

function mapApiThinkingSpace(item: ApiThinkingSpace): ThinkingSpace {
  return {
    id: item.id,
    userId: item.user_id,
    rootQuestionText: item.root_question_text,
    status: item.status,
    createdAt: item.created_at,
    lastActivityAt: typeof item.last_activity_at === "string" ? item.last_activity_at : item.created_at,
    frozenAt: item.frozen_at,
    sourceTimeDoubtId: item.source_time_doubt_id
  };
}

function mapApiThinkingScratch(item: ApiThinkingScratch): ThinkingScratchItem {
  return {
    id: item.id,
    rawText: item.raw_text,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    archivedAt: item.archived_at,
    deletedAt: item.deleted_at,
    derivedSpaceId: item.derived_space_id,
    fedTimeDoubtId: item.fed_time_doubt_id
  };
}

function mapApiThinkingMeta(item: ApiThinkingSpaceMeta): ThinkingSpaceMeta {
  return {
    spaceId: item.space_id,
    userFreezeNote: item.user_freeze_note,
    exportVersion: item.export_version,
    backgroundText: typeof item.background_text === "string" ? item.background_text : null,
    backgroundVersion: Number.isFinite(item.background_version) ? Number(item.background_version) : 0,
    suggestionDecay: Number.isFinite(item.suggestion_decay) ? Number(item.suggestion_decay) : 0,
    lastTrackId: typeof item.last_track_id === "string" ? item.last_track_id : null,
    lastOrganizedOrder: Number.isFinite(item.last_organized_order) ? Number(item.last_organized_order) : -1,
    parkingTrackId: typeof item.parking_track_id === "string" ? item.parking_track_id : null,
    pendingTrackId: typeof item.pending_track_id === "string" ? item.pending_track_id : null,
    emptyTrackIds: Array.isArray(item.empty_track_ids) ? item.empty_track_ids.filter((id) => typeof id === "string") : [],
    milestoneNodeIds: Array.isArray(item.milestone_node_ids) ? item.milestone_node_ids.filter((id) => typeof id === "string") : [],
    trackDirectionHints:
      item.track_direction_hints && typeof item.track_direction_hints === "object" && !Array.isArray(item.track_direction_hints)
        ? Object.fromEntries(
            Object.entries(item.track_direction_hints).filter(
              ([trackId, hint]) =>
                typeof trackId === "string" &&
                (hint === null ||
                  hint === "hypothesis" ||
                  hint === "memory" ||
                  hint === "counterpoint" ||
                  hint === "worry" ||
                  hint === "constraint" ||
                  hint === "aside")
            )
          )
        : {}
  };
}

function mapApiThinkingView(payload: ApiThinkingSpaceView): ThinkingSpaceView {
  return {
    spaceId: payload.root.id,
    currentTrackId: typeof payload.current_track_id === "string" ? payload.current_track_id : null,
    tracks: (payload.tracks ?? []).map((track) => ({
      id: track.id,
      titleQuestionText: track.title_question_text,
      directionHint:
        track.direction_hint === "hypothesis" ||
        track.direction_hint === "memory" ||
        track.direction_hint === "counterpoint" ||
        track.direction_hint === "worry" ||
        track.direction_hint === "constraint" ||
        track.direction_hint === "aside"
          ? track.direction_hint
          : null,
      isParking: track.is_parking === true,
      isEmpty: track.is_empty === true,
      nodes: (track.nodes ?? []).map((node) => ({
        id: node.id,
        questionText: node.raw_question_text,
        noteText: typeof node.note_text === "string" ? node.note_text : null,
        answerText: typeof node.answer_text === "string" ? node.answer_text : null,
        isSuggested: Boolean(node.is_suggested),
        isMilestone: node.is_milestone === true,
        hasRelatedLink: node.has_related_link === true,
        createdAt: node.created_at,
        echoTrackId: typeof node.echo_track_id === "string" ? node.echo_track_id : null,
        echoNodeId: typeof node.echo_node_id === "string" ? node.echo_node_id : null
      })),
      nodeCount: Math.max(0, track.node_count ?? 0)
    })),
    parkingTrackId: typeof payload.parking_track_id === "string" ? payload.parking_track_id : null,
    pendingTrackId: typeof payload.pending_track_id === "string" ? payload.pending_track_id : null,
    milestoneNodeIds: Array.isArray(payload.milestone_node_ids) ? payload.milestone_node_ids.filter((id) => typeof id === "string") : [],
    suggestedQuestions: (payload.suggested_questions ?? []).filter((item) => typeof item === "string"),
    freezeNote: payload.freeze_note ?? null,
    backgroundText: typeof payload.background_text === "string" ? payload.background_text : null,
    backgroundVersion: Number.isFinite(payload.background_version) ? Number(payload.background_version) : 0
  };
}

function sortSpacesByLatestActivity(a: ThinkingSpace, b: ThinkingSpace) {
  return new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime();
}

export function TimeArchive() {
  const [tab, setTab] = useState<LayerTab>("thinking");
  const [hydrated, setHydrated] = useState(false);
  const [lifeStore, setLifeStore] = useState(EMPTY_LIFE_STORE);
  const [thinkingStore, setThinkingStore] = useState(EMPTY_THINKING_STORE);
  const [thinkingView, setThinkingView] = useState<ThinkingSpaceView | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [openingPhase, setOpeningPhase] = useState<"black" | "stars" | "text" | "ready">("black");
  const [lifeReady, setLifeReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [pinReady, setPinReady] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState(0);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [, setOfflineSnapshotExists] = useState(false);
  const [offlineMeta, setOfflineMeta] = useState<OfflineSnapshotMeta | null>(null);
  const [offlineRuntimeState, setOfflineRuntimeState] = useState<OfflineRuntimeState>("guest_ready");
  const [activeOwnerKey, setActiveOwnerKey] = useState<OfflineOwnerKey | null>(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [pinTick, setPinTick] = useState(0);
  const [thinkingFocusMode, setThinkingFocusMode] = useState(false);
  const [thinkingViewMode, setThinkingViewMode] = useState<"spaces" | "detail">("spaces");
  const [thinkingJumpTarget, setThinkingJumpTarget] = useState<ThinkingJumpTarget | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [bindingDialog, setBindingDialog] = useState<BindingDialogState | null>(null);

  const noticeTimerRef = useRef<number | null>(null);
  const thinkingViewCacheRef = useRef<Record<string, ThinkingSpaceView>>({});
  const offlineSyncingRef = useRef(false);
  const userBootstrapRef = useRef<string | null>(null);
  const localProfileIdRef = useRef("");
  const bindingCheckUserIdRef = useRef<string | null>(null);
  const activeSpaceIdRef = useRef<string | null>(null);
  const [stars] = useState(() => createStars(36));
  const freezeNoteByDoubtId = useMemo(() => {
    const metaBySpaceId = new Map(thinkingStore.spaceMeta.map((meta) => [meta.spaceId, meta]));
    const grouped = new Map<string, { note: string; timestamp: number }>();
    for (const space of thinkingStore.spaces) {
      const doubtId = space.sourceTimeDoubtId;
      if (!doubtId) continue;
      const note = (metaBySpaceId.get(space.id)?.userFreezeNote ?? "").trim();
      if (!note) continue;
      const timestamp = new Date(space.lastActivityAt ?? space.createdAt).getTime();
      const previous = grouped.get(doubtId);
      if (!previous || timestamp >= previous.timestamp) {
        grouped.set(doubtId, { note, timestamp });
      }
    }
    return Object.fromEntries(Array.from(grouped.entries(), ([doubtId, payload]) => [doubtId, payload.note]));
  }, [thinkingStore.spaceMeta, thinkingStore.spaces]);

  const activeThinkingSpaceOptions = useMemo(
    () =>
      [...thinkingStore.spaces]
        .filter((space) => space.status === "active")
        .sort(sortSpacesByLatestActivity)
        .map((space) => ({ id: space.id, title: space.rootQuestionText })),
    [thinkingStore.spaces]
  );

  const showNotice = useCallback((message: string, duration = 1800) => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, duration);
  }, []);

  const refreshPinState = useCallback(() => {
    const status = getPinStatus();
    setPinEnabled(status.enabled);
    setPinLockedUntil(status.lockedUntil);
    return status;
  }, []);

  const guestModeEnabled = canAccessGuestMode();
  const cloudSyncEnabled = canUseCloudSync(sessionUser);
  const guestOwnerKey = getGuestOwnerKey(localProfileIdRef.current || getOrCreateLocalProfileId());
  const currentUserOwnerKey = sessionUser ? getUserOwnerKey(sessionUser.userId) : null;
  const cloudSyncReady =
    cloudSyncEnabled &&
    offlineRuntimeState === "user_sync_ready" &&
    offlineMeta?.ownerMode === "user" &&
    offlineMeta.boundUserId === sessionUser?.userId &&
    activeOwnerKey === currentUserOwnerKey;
  const editingLocked =
    offlineRuntimeState === "user_bootstrapping" ||
    offlineRuntimeState === "user_syncing" ||
    offlineRuntimeState === "binding_required" ||
    offlineRuntimeState === "switching_account";

  const updateOfflineMeta = useCallback((updater: (current: OfflineSnapshotMeta) => OfflineSnapshotMeta) => {
    setOfflineMeta((current) => {
      const fallback = createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId());
      return updater(current ?? fallback);
    });
  }, []);

  const markLocalChange = useCallback(() => {
    updateOfflineMeta((current) => ({
      ...current,
      syncState: {
        ...current.syncState,
        hasLocalChanges: true
      }
    }));
  }, [updateOfflineMeta]);

  const markCloudSynced = useCallback(
    (userId?: string | null) => {
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: userId ? "user" : current.ownerMode,
        boundUserId: userId ?? current.boundUserId,
        syncState: {
          ...current.syncState,
          lastSyncedAt: new Date().toISOString(),
          hasLocalChanges: false,
          bindingRequired: false
        }
      }));
    },
    [updateOfflineMeta]
  );

  const applySnapshotToState = useCallback(
    (snapshot: {
      lifeStore: typeof EMPTY_LIFE_STORE;
      thinkingStore: ThinkingStore;
      activeSpaceId: string | null;
      thinkingViews?: Record<string, ThinkingSpaceView>;
      meta: OfflineSnapshotMeta;
    }) => {
      const initialSpaceId = snapshot.activeSpaceId ?? pickDefaultSpaceId(snapshot.thinkingStore.spaces);
      const cachedInitialView = initialSpaceId ? snapshot.thinkingViews?.[initialSpaceId] ?? null : null;
      const initialView = isSpaceViewConsistentWithStore(snapshot.thinkingStore, initialSpaceId ?? "", cachedInitialView)
        ? cachedInitialView
        : initialSpaceId
          ? buildSpaceViewFromStore(snapshot.thinkingStore, initialSpaceId)
          : null;
      setLifeStore(snapshot.lifeStore);
      setThinkingStore(snapshot.thinkingStore);
      setActiveSpaceId(initialSpaceId);
      thinkingViewCacheRef.current = snapshot.thinkingViews ?? {};
      if (initialSpaceId && initialView) thinkingViewCacheRef.current[initialSpaceId] = initialView;
      setThinkingView(initialView);
      setOfflineMeta(snapshot.meta);
      setOfflineSnapshotExists(
        hasMeaningfulLocalData(snapshot.lifeStore, snapshot.thinkingStore) ||
          Object.keys(snapshot.thinkingViews ?? {}).length > 0
      );
    },
    []
  );

  const resetArchiveState = useCallback(
    (ownerMeta: OfflineSnapshotMeta) => {
      thinkingViewCacheRef.current = {};
      setThinkingView(null);
      setActiveSpaceId(null);
      setLifeStore((prev) => ({ ...EMPTY_LIFE_STORE, meta: prev.meta }));
      setThinkingStore((prev) => ({
        ...EMPTY_THINKING_STORE,
        timezone: prev.timezone,
        fixedTopSpacesEnabled: prev.fixedTopSpacesEnabled,
        fixedTopSpaceIds: []
      }));
      setOfflineMeta(ownerMeta);
      setOfflineSnapshotExists(false);
    },
    []
  );

  const loadOwnerSnapshot = useCallback(
    async (ownerKey: OfflineOwnerKey, fallbackMeta: OfflineSnapshotMeta) => {
      const snapshot = await loadOfflineSnapshotByOwner(ownerKey);
      if (snapshot) {
        applySnapshotToState({
          ...snapshot,
          meta: snapshot.meta ?? fallbackMeta
        });
        return snapshot;
      }
      resetArchiveState(fallbackMeta);
      return null;
    },
    [applySnapshotToState, resetArchiveState]
  );

  const buildLocalExportPayload = useCallback(
    (user: SessionUser): UserExportPayload => ({
      version: "2026-03-03",
      exported_at: new Date().toISOString(),
      user_id: user.userId,
      user_email: user.email,
      life: {
        doubts: lifeStore.doubts.map((item) => ({
          id: item.id,
          raw_text: item.rawText,
          first_node_preview: item.firstNodePreview,
          last_node_preview: item.lastNodePreview,
          created_at: item.createdAt,
          archived_at: item.archivedAt,
          deleted_at: item.deletedAt
        })),
        notes: lifeStore.notes.map((item) => ({
          id: item.id,
          doubt_id: item.doubtId,
          note_text: item.noteText,
          created_at: item.createdAt
        }))
      },
      thinking: {
        spaces: thinkingStore.spaces.map((item) => ({
          id: item.id,
          userId: user.userId,
          rootQuestionText: item.rootQuestionText,
          status: item.status,
          createdAt: item.createdAt,
          frozenAt: item.frozenAt,
          sourceTimeDoubtId: item.sourceTimeDoubtId
        })),
        nodes: thinkingStore.nodes.map((item) => ({
          id: item.id,
          spaceId: item.spaceId,
          parentNodeId: item.parentNodeId,
          rawQuestionText: item.rawQuestionText,
          createdAt: item.createdAt,
          orderIndex: item.orderIndex,
          isSuggested: item.isSuggested,
          state: item.state,
          dimension: item.dimension
        })),
        space_meta: thinkingStore.spaceMeta.map((item) => ({
          spaceId: item.spaceId,
          userFreezeNote: item.userFreezeNote,
          exportVersion: item.exportVersion,
          backgroundText: item.backgroundText ?? null,
          backgroundVersion: item.backgroundVersion ?? 0,
          suggestionDecay: item.suggestionDecay ?? 0,
          lastTrackId: item.lastTrackId ?? null,
          lastOrganizedOrder: item.lastOrganizedOrder ?? -1,
          parkingTrackId: item.parkingTrackId ?? null,
          pendingTrackId: item.pendingTrackId ?? null,
          emptyTrackIds: item.emptyTrackIds ?? [],
          milestoneNodeIds: item.milestoneNodeIds ?? [],
          trackDirectionHints: item.trackDirectionHints ?? {}
        })),
        node_links: thinkingStore.nodeLinks.map((item) => ({
          id: item.id,
          spaceId: item.spaceId,
          sourceNodeId: item.sourceNodeId,
          targetNodeId: item.targetNodeId,
          linkType: item.linkType,
          score: item.score,
          createdAt: item.createdAt
        })),
        inbox: thinkingStore.inbox,
        scratch: thinkingStore.scratch.map((item) => ({
          id: item.id,
          userId: user.userId,
          rawText: item.rawText,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          archivedAt: item.archivedAt,
          deletedAt: item.deletedAt,
          derivedSpaceId: item.derivedSpaceId,
          fedTimeDoubtId: item.fedTimeDoubtId
        }))
      },
      audit: []
    }),
    [lifeStore.doubts, lifeStore.notes, thinkingStore.inbox, thinkingStore.nodeLinks, thinkingStore.nodes, thinkingStore.scratch, thinkingStore.spaceMeta, thinkingStore.spaces]
  );

  const getLocalSpaceView = useCallback(
    (spaceId: string) => {
      const cached = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (isSpaceViewConsistentWithStore(thinkingStore, spaceId, cached)) return cached;
      const rebuilt = buildSpaceViewFromStore(thinkingStore, spaceId);
      if (rebuilt) thinkingViewCacheRef.current[spaceId] = rebuilt;
      else delete thinkingViewCacheRef.current[spaceId];
      return rebuilt;
    },
    [thinkingStore, thinkingView]
  );

  const commitLocalSpaceView = useCallback(
    (spaceId: string, nextView: ThinkingSpaceView | null) => {
      if (nextView && nextView.spaceId !== spaceId) return;
      if (nextView) thinkingViewCacheRef.current[spaceId] = nextView;
      else delete thinkingViewCacheRef.current[spaceId];
      if ((thinkingView?.spaceId === spaceId || activeSpaceId === spaceId) && nextView !== thinkingView) {
        setThinkingView(nextView);
      }
      if (!nextView && (thinkingView?.spaceId === spaceId || activeSpaceId === spaceId)) {
        setThinkingView(null);
      }
    },
    [activeSpaceId, thinkingView]
  );

  const syncAuth = useCallback(async () => {
    try {
      const response = await apiFetch("/v1/auth/me", { method: "GET", cache: "no-store" });
      if (!response.ok) {
        setSessionUser(null);
        setAuthReady(true);
        return false;
      }
      const payload = (await response.json()) as { user_id?: string; email?: string };
      if (typeof payload.user_id !== "string" || typeof payload.email !== "string") {
        setSessionUser(null);
        setAuthReady(true);
        return false;
      }
      setSessionUser({ userId: payload.user_id, email: payload.email });
      setAuthReady(true);
      return true;
    } catch {
      setSessionUser(null);
      setAuthReady(true);
      return false;
    }
  }, []);

  const handleUnauthorized = useCallback(
    (response: Response) => {
      if (response.status !== 401) return false;
      setSessionUser(null);
      setAuthReady(true);
      if (sessionUser) showNotice("登录已失效，请重新登录");
      return true;
    },
    [sessionUser, showNotice]
  );

  const syncLifeFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/doubts?range=all&include_notes=true", {
          method: "GET",
          cache: "no-store"
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          if (!silent) showNotice("时间档案同步失败");
          return false;
        }
        const payload = (await response.json()) as { doubts?: ApiLifeDoubt[]; notes?: ApiLifeNote[] };
        const nextDoubts = Array.isArray(payload.doubts) ? payload.doubts.map(mapApiLifeDoubt) : [];
        const nextNotes = Array.isArray(payload.notes) ? payload.notes.map(mapApiLifeNote) : [];
        setLifeStore((prev) => ({
          ...prev,
          doubts: nextDoubts,
          notes: nextNotes
        }));
        return true;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice]
  );

  const syncThinkingSpacesFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/thinking/spaces", { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) {
          if (!silent) showNotice("思考空间同步失败");
          return [];
        }
        const payload = (await response.json()) as {
          spaces?: ApiThinkingSpace[];
          space_meta?: ApiThinkingSpaceMeta[];
        };
        const spaces = Array.isArray(payload.spaces) ? payload.spaces.map(mapApiThinkingSpace) : [];
        const spaceMeta = Array.isArray(payload.space_meta) ? payload.space_meta.map(mapApiThinkingMeta) : [];
        setThinkingStore((prev) => ({
          ...prev,
          spaces,
          spaceMeta
        }));
        return spaces;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return [];
      }
    },
    [handleUnauthorized, showNotice]
  );

  const syncThinkingScratchFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await apiFetch("/v1/thinking/scratch", { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) {
          if (!silent) showNotice("随记同步失败");
          return [];
        }
        const payload = (await response.json()) as { scratch?: ApiThinkingScratch[] };
        const scratch = Array.isArray(payload.scratch) ? payload.scratch.map(mapApiThinkingScratch) : [];
        setThinkingStore((prev) => ({
          ...prev,
          scratch
        }));
        return scratch;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return [];
      }
    },
    [handleUnauthorized, showNotice]
  );

  const loadThinkingViewFromApi = useCallback(
    async (spaceId: string, silent = false) => {
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          if (response.status === 404 && activeSpaceIdRef.current === spaceId) setThinkingView(null);
          else if (!silent) showNotice("思考详情加载失败");
          return false;
        }
        const payload = (await response.json()) as ApiThinkingSpaceView;
        const mappedView = mapApiThinkingView(payload);
        thinkingViewCacheRef.current[mappedView.spaceId] = mappedView;
        if (activeSpaceIdRef.current === mappedView.spaceId) {
          setThinkingView(mappedView);
        }
        const latestSpace = mapApiThinkingSpace(payload.root);
        setThinkingStore((prev) => {
          const index = prev.spaces.findIndex((space) => space.id === latestSpace.id);
          const nextSpaces = [...prev.spaces];
          if (index >= 0) {
            nextSpaces[index] = {
              ...nextSpaces[index],
              ...latestSpace
            };
          } else {
            nextSpaces.unshift(latestSpace);
          }
          const viewNodeIds = new Set<string>();
          const nextNodes = prev.nodes.filter((node) => {
            if (node.spaceId !== mappedView.spaceId) return true;
            return false;
          });
          for (const track of mappedView.tracks) {
            for (let indexWithinTrack = 0; indexWithinTrack < track.nodes.length; indexWithinTrack += 1) {
              const node = track.nodes[indexWithinTrack];
              if (viewNodeIds.has(node.id)) continue;
              viewNodeIds.add(node.id);
              nextNodes.push({
                id: node.id,
                spaceId: mappedView.spaceId,
                parentNodeId: `track:${track.id}`,
                rawQuestionText: node.questionText,
                createdAt: node.createdAt ?? new Date().toISOString(),
                orderIndex: indexWithinTrack,
                isSuggested: node.isSuggested,
                state: "normal",
                dimension: "definition"
              });
            }
          }
          return {
            ...prev,
            spaces: nextSpaces,
            nodes: nextNodes
          };
        });
        return true;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice]
  );

  const fetchCloudExport = useCallback(async () => {
    const response = await apiFetch("/v1/system/export", { method: "GET", cache: "no-store" });
    if (handleUnauthorized(response) || !response.ok) return null;
    const payload = (await response.json().catch(() => null)) as { payload?: UserExportPayload; checksum?: string } | null;
    if (!payload?.payload || typeof payload.checksum !== "string") return null;
    return payload;
  }, [handleUnauthorized]);

  const refreshFromCloud = useCallback(
    async (preferredSpaceId?: string | null, userId?: string | null) => {
      thinkingViewCacheRef.current = {};
      setThinkingView(null);
      setActiveSpaceId(null);
      setThinkingStore((prev) => ({
        ...prev,
        spaces: [],
        nodes: [],
        spaceMeta: [],
        nodeLinks: [],
        scratch: [],
        inbox: {}
      }));
      const [lifeOk, spaces, scratch] = await Promise.all([
        syncLifeFromApi(true),
        syncThinkingSpacesFromApi(true),
        syncThinkingScratchFromApi(true)
      ]);
      const nextActive =
        (preferredSpaceId && spaces.some((space) => space.id === preferredSpaceId) ? preferredSpaceId : null) ??
        pickDefaultSpaceId(spaces);
      setActiveSpaceId(nextActive);
      if (nextActive) await loadThinkingViewFromApi(nextActive, true);
      else setThinkingView(null);
      const targetUserId = userId ?? sessionUser?.userId ?? null;
      if (lifeOk || spaces.length || scratch.length || !hasMeaningfulLocalData(lifeStore, thinkingStore)) {
        markCloudSynced(targetUserId);
      }
      if (targetUserId) {
        setOfflineRuntimeState("user_sync_ready");
      }
    },
    [
      lifeStore,
      loadThinkingViewFromApi,
      markCloudSynced,
      syncLifeFromApi,
      syncThinkingScratchFromApi,
      syncThinkingSpacesFromApi,
      thinkingStore
    ]
  );

  const importLocalPayloadToCloud = useCallback(
    async (user: SessionUser) => {
      const payload = buildLocalExportPayload(user);
      const checksum = await sha256Hex(stableStringify(payload));
      const response = await apiFetch("/v1/system/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, checksum, mode: "replace" })
      });
      if (handleUnauthorized(response) || !response.ok) return false;
      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: "user",
        boundUserId: user.userId,
        syncState: {
          lastSyncedAt: new Date().toISOString(),
          hasLocalChanges: false,
          bindingRequired: false
        }
      }));
      await refreshFromCloud(null);
      return true;
    },
    [buildLocalExportPayload, handleUnauthorized, refreshFromCloud, updateOfflineMeta]
  );

  const syncQueuedMutations = useCallback(async (ownerKey: OfflineOwnerKey | null) => {
    if (!ownerKey || !ownerKey.startsWith("user:")) return;
    if (offlineSyncingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    offlineSyncingRef.current = true;
    try {
      const pending = await listOfflineMutationsByOwner(ownerKey);
      if (!pending.length) return;
      let touched = false;
      for (const item of pending) {
        const payload: Record<string, unknown> = {
          ...(item.body ?? {}),
          client_mutation_id: item.clientMutationId,
          client_updated_at: item.clientUpdatedAt
        };
        try {
          const response = await apiFetch(item.route, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) break;
          if (response.ok || (response.status >= 400 && response.status < 500)) {
            await removeOfflineMutation(item.id);
            touched = true;
            continue;
          }
          const retryCount = item.retryCount + 1;
          const delay = Math.min(OFFLINE_RETRY_MAX_MS, OFFLINE_RETRY_BASE_MS * 2 ** retryCount);
          await updateOfflineMutation(item.id, {
            retryCount,
            nextRetryAt: Date.now() + delay,
            lastError: `status_${response.status}`
          });
        } catch (error) {
          const retryCount = item.retryCount + 1;
          const delay = Math.min(OFFLINE_RETRY_MAX_MS, OFFLINE_RETRY_BASE_MS * 2 ** retryCount);
          await updateOfflineMutation(item.id, {
            retryCount,
            nextRetryAt: Date.now() + delay,
            lastError: error instanceof Error ? error.message : String(error)
          });
        }
      }
      if (!touched) return;
      await refreshFromCloud(activeSpaceIdRef.current, ownerKey.slice(5));
    } finally {
      offlineSyncingRef.current = false;
    }
  }, [
    handleUnauthorized,
    loadThinkingViewFromApi,
    refreshFromCloud,
    syncLifeFromApi,
    syncThinkingScratchFromApi,
    syncThinkingSpacesFromApi
  ]);

  const queueMutation = useCallback(
    async (route: string, body: Record<string, unknown> | null = null) => {
      if (!activeOwnerKey || !sessionUser || !activeOwnerKey.startsWith("user:")) {
        markLocalChange();
        return null;
      }
      if (offlineRuntimeState !== "user_offline_ready" && offlineRuntimeState !== "user_sync_ready") {
        return null;
      }
      const now = new Date().toISOString();
      const queued: QueuedMutation = {
        id: createId(),
        ownerKey: activeOwnerKey,
        route,
        method: "POST",
        body,
        clientMutationId: createId(),
        clientUpdatedAt: now,
        createdAt: now,
        retryCount: 0,
        nextRetryAt: Date.now(),
        lastError: null
      };
      await enqueueOfflineMutation(queued);
      markLocalChange();
      return queued;
    },
    [activeOwnerKey, markLocalChange, offlineRuntimeState, sessionUser]
  );

  const createLifeDoubt = useCallback(
    async (rawText: string) => {
      const now = new Date().toISOString();
      const localDoubtId = createId();
      const payload = {
        raw_text: rawText,
        layer: "life" as const,
        client_entity_id: localDoubtId,
        client_updated_at: now
      };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/doubts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            if (response.status >= 500) {
              await queueMutation("/v1/doubts", payload);
              setLifeStore((prev) => ({
                ...prev,
                doubts: [
                  {
                    id: localDoubtId,
                    rawText,
                    firstNodePreview: null,
                    lastNodePreview: null,
                    createdAt: now,
                    archivedAt: null,
                    deletedAt: null
                  },
                  ...prev.doubts.filter((item) => item.id !== localDoubtId)
                ]
              }));
              return true;
            }
            showNotice("放入失败，请稍后再试");
            return false;
          }
          void syncLifeFromApi(true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            showNotice("网络异常，请稍后再试");
            return false;
          }
        }
      }
      await queueMutation("/v1/doubts", payload);
      setLifeStore((prev) => ({
        ...prev,
        doubts: [
          {
            id: localDoubtId,
            rawText,
            firstNodePreview: null,
            lastNodePreview: null,
            createdAt: now,
            archivedAt: null,
            deletedAt: null
          },
          ...prev.doubts.filter((item) => item.id !== localDoubtId)
        ]
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncLifeFromApi]
  );

  const saveLifeDoubtNote = useCallback(
    async (doubtId: string, noteText: string) => {
      const now = new Date().toISOString();
      const payload = { note_text: noteText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/doubts/${doubtId}/note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            if (response.status >= 500) {
              await queueMutation(`/v1/doubts/${doubtId}/note`, payload);
              setLifeStore((prev) => {
                const noteId = prev.notes.find((item) => item.doubtId === doubtId)?.id ?? createId();
                const cleaned = noteText.trim();
                const nextNotes = cleaned
                  ? [
                      ...prev.notes.filter((item) => item.doubtId !== doubtId),
                      { id: noteId, doubtId, noteText: cleaned, createdAt: now }
                    ]
                  : prev.notes.filter((item) => item.doubtId !== doubtId);
                return { ...prev, notes: nextNotes };
              });
              return true;
            }
            showNotice("注记保存失败");
            return false;
          }
          void syncLifeFromApi(true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            showNotice("网络异常，请稍后再试");
            return false;
          }
        }
      }
      await queueMutation(`/v1/doubts/${doubtId}/note`, payload);
      setLifeStore((prev) => {
        const noteId = prev.notes.find((item) => item.doubtId === doubtId)?.id ?? createId();
        const cleaned = noteText.trim();
        const nextNotes = cleaned
          ? [...prev.notes.filter((item) => item.doubtId !== doubtId), { id: noteId, doubtId, noteText: cleaned, createdAt: now }]
          : prev.notes.filter((item) => item.doubtId !== doubtId);
        return { ...prev, notes: nextNotes };
      });
      markLocalChange();
      return true;
    },
    [cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncLifeFromApi]
  );

  const pruneDerivedThinkingByDoubt = useCallback((doubtId: string) => {
    setThinkingStore((prev) => {
      const deletingSpaceIds = new Set(prev.spaces.filter((space) => space.sourceTimeDoubtId === doubtId).map((space) => space.id));
      if (!deletingSpaceIds.size) return prev;
      const nextInbox = { ...prev.inbox };
      for (const spaceId of deletingSpaceIds) delete nextInbox[spaceId];
      return {
        ...prev,
        spaces: prev.spaces.filter((space) => !deletingSpaceIds.has(space.id)),
        nodes: prev.nodes.filter((node) => !deletingSpaceIds.has(node.spaceId)),
        spaceMeta: prev.spaceMeta.filter((meta) => !deletingSpaceIds.has(meta.spaceId)),
        inbox: nextInbox
      };
    });
  }, []);

  const deleteLifeDoubtWithDerived = useCallback(
    async (doubtId: string) => {
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/doubts/${doubtId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) {
            showNotice("删除失败，请稍后再试");
            return false;
          }
          pruneDerivedThinkingByDoubt(doubtId);
          void syncLifeFromApi(true);
          void syncThinkingSpacesFromApi(true);
          if (activeSpaceId && thinkingStore.spaces.some((space) => space.sourceTimeDoubtId === doubtId && space.id === activeSpaceId)) {
            setThinkingView(null);
          }
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch {
          showNotice("网络异常，请稍后再试");
          return false;
        }
      }
      pruneDerivedThinkingByDoubt(doubtId);
      setLifeStore((prev) => ({
        ...prev,
        doubts: prev.doubts.filter((item) => item.id !== doubtId),
        notes: prev.notes.filter((item) => item.doubtId !== doubtId)
      }));
      markLocalChange();
      return true;
    },
    [activeSpaceId, cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, pruneDerivedThinkingByDoubt, sessionUser?.userId, showNotice, syncLifeFromApi, syncThinkingSpacesFromApi, thinkingStore.spaces]
  );

  const createThinkingSpaceApi = useCallback(
    async (
      rootQuestionText: string,
      sourceTimeDoubtId: string | null
    ): Promise<
      | {
          ok: true;
          spaceId: string;
          converted: boolean;
          createdAsStatement: boolean;
          suggestedQuestions: string[];
          questionSuggestion: string | null;
        }
      | { ok: false; message: string; suggestedQuestions?: string[] }
    > => {
      const now = new Date().toISOString();
      const localSpaceId = createId();
      const localParkingTrackId = createId();
      const basePayload = {
        root_question_text: rootQuestionText,
        source_time_doubt_id: sourceTimeDoubtId,
        client_space_id: localSpaceId,
        client_parking_track_id: localParkingTrackId,
        client_updated_at: now
      };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/thinking/spaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basePayload)
          });
          if (handleUnauthorized(response)) return { ok: false, message: "登录已失效，请重新登录" };
          if (response.status === 409) return { ok: false, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
          const payload = (await response.json().catch(() => ({}))) as {
            space_id?: string;
            converted?: boolean;
            created_as_statement?: boolean;
            suggested_questions?: string[];
            question_suggestion?: string | null;
            error?: string;
          };
          if (!response.ok) {
            return {
              ok: false,
              message: typeof payload.error === "string" ? payload.error : "创建空间失败",
              suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : []
            };
          }
          const spaceId = typeof payload.space_id === "string" ? payload.space_id : null;
          if (!spaceId) return { ok: false, message: "创建空间失败" };
          const spaces = await syncThinkingSpacesFromApi(true);
          setActiveSpaceId(spaceId);
          if (spaces.some((space) => space.id === spaceId)) {
            await loadThinkingViewFromApi(spaceId, true);
          }
          markCloudSynced(sessionUser?.userId ?? null);
          return {
            ok: true,
            spaceId,
            converted: payload.converted === true,
            createdAsStatement: payload.created_as_statement === true,
            suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : [],
            questionSuggestion: typeof payload.question_suggestion === "string" ? payload.question_suggestion : null
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false, message: "网络异常，请稍后再试" };
          }
        }
      }
      await queueMutation("/v1/thinking/spaces", basePayload);
      const localSpace: ThinkingSpace = {
        id: localSpaceId,
        userId: sessionUser?.userId ?? "offline_user",
        rootQuestionText,
        status: "active",
        createdAt: now,
        lastActivityAt: now,
        frozenAt: null,
        sourceTimeDoubtId: sourceTimeDoubtId ?? null
      };
      const localMeta: ThinkingSpaceMeta = {
        spaceId: localSpaceId,
        userFreezeNote: null,
        exportVersion: 1,
        backgroundText: null,
        backgroundVersion: 0,
        suggestionDecay: 0,
        lastTrackId: null,
        lastOrganizedOrder: -1,
        parkingTrackId: localParkingTrackId,
        pendingTrackId: null,
        emptyTrackIds: [],
        milestoneNodeIds: [],
        trackDirectionHints: {}
      };
      const localView: ThinkingSpaceView = {
        spaceId: localSpaceId,
        currentTrackId: localParkingTrackId,
        parkingTrackId: localParkingTrackId,
        pendingTrackId: null,
        milestoneNodeIds: [],
        tracks: [
          {
            id: localParkingTrackId,
            titleQuestionText: "先放这里",
            directionHint: null,
            isParking: true,
            isEmpty: false,
            nodeCount: 0,
            nodes: []
          }
        ],
        suggestedQuestions: [],
        freezeNote: null,
        backgroundText: null,
        backgroundVersion: 0
      };
      thinkingViewCacheRef.current[localSpaceId] = localView;
      setThinkingStore((prev) => ({
        ...prev,
        spaces: [localSpace, ...prev.spaces.filter((item) => item.id !== localSpaceId)],
        spaceMeta: [localMeta, ...prev.spaceMeta.filter((item) => item.spaceId !== localSpaceId)]
      }));
      setActiveSpaceId(localSpaceId);
      setThinkingView(localView);
      markLocalChange();
      return {
        ok: true,
        spaceId: localSpaceId,
        converted: false,
        createdAsStatement: false,
        suggestedQuestions: [],
        questionSuggestion: null
      }
    },
    [cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncThinkingSpacesFromApi]
  );

  useEffect(() => {
    const status = refreshPinState();
    setPinUnlocked(!status.enabled);
    setPinReady(true);
  }, [refreshPinState]);

  useEffect(() => {
    if (!pinReady || (pinEnabled && !pinUnlocked)) return;
    void syncAuth();
  }, [pinEnabled, pinReady, pinUnlocked, syncAuth]);

  useEffect(() => {
    if (!pinReady || (pinEnabled && !pinUnlocked)) return;
    let cancelled = false;
    void (async () => {
      const localProfileId = getOrCreateLocalProfileId();
      localProfileIdRef.current = localProfileId;
      const initialOwnerKey = getGuestOwnerKey(localProfileId);
      const snapshot = await loadOfflineSnapshotByOwner(initialOwnerKey);
      if (cancelled) return;
      if (snapshot) {
        applySnapshotToState({
          ...snapshot,
          meta: snapshot.meta ?? createOfflineSnapshotMeta(localProfileId)
        });
        setActiveOwnerKey(initialOwnerKey);
        setOfflineRuntimeState("guest_ready");
        setHydrated(true);
        return;
      }
      setOfflineSnapshotExists(false);
      setActiveOwnerKey(initialOwnerKey);
      setOfflineMeta(createOfflineSnapshotMeta(localProfileId));
      setOfflineRuntimeState("guest_ready");
      const loadedLife = loadLifeStore();
      const loadedThinking = loadThinkingStore();
      const initialSpaceId = pickDefaultSpaceId(loadedThinking.spaces);
      const initialView = initialSpaceId ? buildSpaceViewFromStore(loadedThinking, initialSpaceId) : null;
      setLifeStore(loadedLife);
      setThinkingStore(loadedThinking);
      setActiveSpaceId(initialSpaceId);
      if (initialSpaceId && initialView) thinkingViewCacheRef.current[initialSpaceId] = initialView;
      setThinkingView(initialView);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySnapshotToState, pinEnabled, pinReady, pinUnlocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("zhihuo_thinking_focus_mode");
    setThinkingFocusMode(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("zhihuo_thinking_focus_mode", thinkingFocusMode ? "1" : "0");
  }, [thinkingFocusMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOnline(window.navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    activeSpaceIdRef.current = activeSpaceId;
  }, [activeSpaceId]);

  useEffect(() => {
    if (!hydrated || !authReady || !offlineMeta) return;

    let cancelled = false;
    void (async () => {
      const localProfileId = localProfileIdRef.current || getOrCreateLocalProfileId();
      const nextGuestOwnerKey = getGuestOwnerKey(localProfileId);
      const guestMeta = createOfflineSnapshotMeta(localProfileId);

      if (!sessionUser) {
        userBootstrapRef.current = null;
        bindingCheckUserIdRef.current = null;
        setBindingDialog(null);
        if (activeOwnerKey !== nextGuestOwnerKey) {
          setOfflineRuntimeState("switching_account");
          setActiveOwnerKey(nextGuestOwnerKey);
          await loadOwnerSnapshot(nextGuestOwnerKey, guestMeta);
          if (cancelled) return;
        }
        setOfflineRuntimeState("guest_ready");
        return;
      }

      const nextUserOwnerKey = getUserOwnerKey(sessionUser.userId);
      const userMeta = createOfflineSnapshotMeta(localProfileId, {
        ownerMode: "user",
        boundUserId: sessionUser.userId
      });
      const guestHasData = activeOwnerKey === nextGuestOwnerKey && hasMeaningfulLocalData(lifeStore, thinkingStore);

      if (guestHasData) {
        setOfflineRuntimeState(bindingDialog || offlineMeta.syncState.bindingRequired ? "binding_required" : "guest_ready");
        return;
      }

      if (activeOwnerKey !== nextUserOwnerKey) {
        userBootstrapRef.current = null;
        setOfflineRuntimeState("switching_account");
        setActiveOwnerKey(nextUserOwnerKey);
        await loadOwnerSnapshot(nextUserOwnerKey, userMeta);
        if (cancelled) return;
      }

      updateOfflineMeta((current) => ({
        ...current,
        ownerMode: "user",
        boundUserId: sessionUser.userId,
        syncState: {
          ...current.syncState,
          bindingRequired: false
        }
      }));

      if (!isOnline) {
        userBootstrapRef.current = null;
        setOfflineRuntimeState("user_offline_ready");
        return;
      }

      if (userBootstrapRef.current === sessionUser.userId) {
        if (offlineRuntimeState !== "user_sync_ready") {
          setOfflineRuntimeState("user_syncing");
        }
        return;
      }

      userBootstrapRef.current = sessionUser.userId;
      setOfflineRuntimeState("user_bootstrapping");
      await refreshFromCloud(activeSpaceIdRef.current, sessionUser.userId);
      if (cancelled) return;
      await syncQueuedMutations(nextUserOwnerKey);
      if (cancelled) return;
      setOfflineRuntimeState("user_sync_ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeOwnerKey,
    authReady,
    bindingDialog,
    hydrated,
    isOnline,
    lifeStore,
    loadOwnerSnapshot,
    offlineMeta,
    offlineRuntimeState,
    refreshFromCloud,
    sessionUser,
    syncQueuedMutations,
    thinkingStore,
    updateOfflineMeta
  ]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser || !offlineMeta || !isOnline) return;
    if (activeOwnerKey !== guestOwnerKey) return;
    if (bindingCheckUserIdRef.current === sessionUser.userId) return;

    const localHasData = hasMeaningfulLocalData(lifeStore, thinkingStore);
    if (!localHasData) return;

    let cancelled = false;
    const frozenLocalPayload = buildLocalExportPayload(sessionUser);
    bindingCheckUserIdRef.current = sessionUser.userId;
    void (async () => {
      const cloud = await fetchCloudExport();
      if (cancelled) return;
      if (!cloud?.payload) {
        bindingCheckUserIdRef.current = null;
        return;
      }
      if (isCloudPayloadEmpty(cloud.payload)) {
        const imported = await importLocalPayloadToCloud(sessionUser);
        if (cancelled) return;
        if (!imported) {
          bindingCheckUserIdRef.current = null;
          return;
        }
        await clearOfflineSnapshotByOwner(guestOwnerKey);
        setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
        showNotice("本地数据已绑定到当前账号");
        return;
      }
      if (arePayloadsEquivalent(frozenLocalPayload, cloud.payload)) {
        updateOfflineMeta((current) => ({
          ...current,
          ownerMode: "user",
          boundUserId: sessionUser.userId,
          syncState: {
            lastSyncedAt: new Date().toISOString(),
            hasLocalChanges: false,
            bindingRequired: false
          }
        }));
        await clearOfflineSnapshotByOwner(guestOwnerKey);
        setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
        setOfflineRuntimeState("user_bootstrapping");
        showNotice("本地与云端数据一致，已自动完成绑定");
        return;
      }
      updateOfflineMeta((current) => ({
        ...current,
        syncState: {
          ...current.syncState,
          bindingRequired: true
        }
      }));
      setOfflineRuntimeState("binding_required");
      setBindingDialog({ cloudPayload: cloud.payload, submitting: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeOwnerKey,
    authReady,
    buildLocalExportPayload,
    fetchCloudExport,
    guestOwnerKey,
    hydrated,
    importLocalPayloadToCloud,
    isOnline,
    lifeStore,
    offlineMeta,
    sessionUser,
    showNotice,
    thinkingStore,
    updateOfflineMeta
  ]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser || !currentUserOwnerKey || !isOnline) return;
    if (offlineRuntimeState !== "user_sync_ready") return;
    const onOnline = () => {
      void syncQueuedMutations(currentUserOwnerKey);
    };
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      void syncQueuedMutations(currentUserOwnerKey);
    }, 15000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [authReady, currentUserOwnerKey, hydrated, isOnline, offlineRuntimeState, sessionUser, syncQueuedMutations]);

  useEffect(() => {
    if (!hydrated) return;
    persistLifeStore(lifeStore);
  }, [hydrated, lifeStore]);

  useEffect(() => {
    if (!hydrated) return;
    persistThinkingStore(thinkingStore);
  }, [hydrated, thinkingStore]);

  useEffect(() => {
    if (!hydrated || !offlineMeta || !activeOwnerKey) return;
    if (thinkingView) {
      thinkingViewCacheRef.current[thinkingView.spaceId] = thinkingView;
    }
    void saveOfflineSnapshotByOwner(activeOwnerKey, {
      lifeStore,
      thinkingStore,
      activeSpaceId,
      thinkingViews: thinkingViewCacheRef.current,
      savedAt: new Date().toISOString(),
      meta: offlineMeta
    });
  }, [activeOwnerKey, activeSpaceId, hydrated, lifeStore, offlineMeta, thinkingStore, thinkingView]);

  useEffect(() => {
    if (!hydrated) return;
    setActiveSpaceId((prev) => {
      if (prev && thinkingStore.spaces.some((space) => space.id === prev)) return prev;
      return pickDefaultSpaceId(thinkingStore.spaces);
    });
  }, [hydrated, thinkingStore.spaces]);

  useEffect(() => {
    if (!hydrated) return;
    const activeIdSet = new Set(thinkingStore.spaces.filter((space) => space.status === "active").map((space) => space.id));
    const nextIds = thinkingStore.fixedTopSpaceIds.filter((id, index, array) => activeIdSet.has(id) && array.indexOf(id) === index).slice(0, 3);
    if (
      nextIds.length === thinkingStore.fixedTopSpaceIds.length &&
      nextIds.every((id, index) => id === thinkingStore.fixedTopSpaceIds[index])
    ) {
      return;
    }
    setThinkingStore((prev) => ({
      ...prev,
      fixedTopSpaceIds: prev.fixedTopSpaceIds.filter((id, index, array) => activeIdSet.has(id) && array.indexOf(id) === index).slice(0, 3)
    }));
  }, [hydrated, thinkingStore.fixedTopSpaceIds, thinkingStore.spaces]);

  useEffect(() => {
    if (!pinEnabled) return;
    if (pinLockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setPinTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pinEnabled, pinLockedUntil]);

  useEffect(() => {
    if (!hydrated) return;
    if (!activeSpaceId) {
      setThinkingView(null);
      return;
    }
    const cached = getLocalSpaceView(activeSpaceId);
    setThinkingView(cached);
    if (!authReady || !cloudSyncReady || !sessionUser) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    void loadThinkingViewFromApi(activeSpaceId, true);
  }, [activeSpaceId, authReady, cloudSyncReady, getLocalSpaceView, hydrated, loadThinkingViewFromApi, sessionUser]);

  useEffect(() => {
    if (!hydrated) return;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setOpeningPhase("stars"), OPENING_MS));
    timers.push(window.setTimeout(() => setOpeningPhase("text"), OPENING_MS * 2));
    timers.push(
      window.setTimeout(() => {
        setOpeningPhase("ready");
        setLifeReady(true);
      }, OPENING_MS * 4)
    );
    return () => timers.forEach((timerId) => window.clearTimeout(timerId));
  }, [hydrated]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const hideLifeDoubtFromTimeline = useCallback(
    async (doubtId: string) => {
      try {
        const response = await apiFetch(`/v1/doubts/${doubtId}/archive`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        void syncLifeFromApi(true);
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, syncLifeFromApi]
  );

  const handleImportToThinking = useCallback(
    (doubt: { id: string; rawText: string }) => {
      void (async () => {
        try {
          const response = await apiFetch(`/v1/doubts/${doubt.id}/to-thinking`, { method: "POST" });
          if (handleUnauthorized(response)) return;
          if (response.status === 409) {
            showNotice(RESTORE_OVER_LIMIT_NOTICE);
            return;
          }
          if (!response.ok) {
            showNotice("创建思考空间失败");
            return;
          }
          const payload = (await response.json()) as { space_id?: string; created?: boolean };
          const spaceId = typeof payload.space_id === "string" ? payload.space_id : null;
          if (!spaceId) {
            showNotice("恢复思考失败");
            return;
          }
          await syncThinkingSpacesFromApi(true);
          setActiveSpaceId(spaceId);
          await loadThinkingViewFromApi(spaceId, true);
          void hideLifeDoubtFromTimeline(doubt.id);
          setTab("thinking");
          setThinkingJumpTarget({ spaceId, mode: "root" });
          showNotice(payload.created ? "已进入思路" : "已恢复原空间");
        } catch {
          showNotice("网络异常，请稍后再试");
        }
      })();
    },
    [handleUnauthorized, hideLifeDoubtFromTimeline, loadThinkingViewFromApi, showNotice, syncThinkingSpacesFromApi]
  );

  const handleCreateThinkingFromInput = useCallback(
    async (rawInput: string) => {
      const result = await createThinkingSpaceApi(rawInput, null);
      if (!result.ok) return result;
      return {
        ok: true as const,
        converted: result.converted,
        createdAsStatement: result.createdAsStatement,
        suggestedQuestions: result.suggestedQuestions,
        questionSuggestion: result.questionSuggestion,
        spaceId: result.spaceId
      };
    },
    [createThinkingSpaceApi]
  );

  const handleCreateThinkingScratch = useCallback(
    async (rawText: string) => {
      const now = new Date().toISOString();
      const localScratchId = createId();
      const payload = {
        raw_text: rawText,
        client_entity_id: localScratchId,
        client_updated_at: now
      };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch("/v1/thinking/scratch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await syncThinkingScratchFromApi(true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation("/v1/thinking/scratch", payload);
      setThinkingStore((prev) => ({
        ...prev,
        scratch: [
          {
            id: localScratchId,
            rawText,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
            derivedSpaceId: null,
            fedTimeDoubtId: null
          },
          ...prev.scratch.filter((item) => item.id !== localScratchId)
        ]
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncThinkingScratchFromApi]
  );

  const handleFeedThinkingScratchToTime = useCallback(
    async (scratchId: string) => {
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/feed-to-time`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await syncLifeFromApi(true);
          await syncThinkingScratchFromApi(true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch {
          return false;
        }
      }
      const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
      if (!scratch) return false;
      const createdAt = new Date().toISOString();
      setLifeStore((prev) => ({
        ...prev,
        doubts: [
          {
            id: scratch.fedTimeDoubtId ?? createId(),
            rawText: scratch.rawText,
            firstNodePreview: null,
            lastNodePreview: null,
            createdAt,
            archivedAt: null,
            deletedAt: null
          },
          ...prev.doubts
        ]
      }));
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, sessionUser?.userId, syncLifeFromApi, syncThinkingScratchFromApi, thinkingStore.scratch]
  );

  const handleDeleteThinkingScratch = useCallback(
    async (scratchId: string) => {
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          await syncThinkingScratchFromApi(true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch {
          return false;
        }
      }
      setThinkingStore((prev) => ({
        ...prev,
        scratch: prev.scratch.filter((item) => item.id !== scratchId)
      }));
      markLocalChange();
      return true;
    },
    [cloudSyncReady, handleUnauthorized, markCloudSynced, markLocalChange, sessionUser?.userId, syncThinkingScratchFromApi]
  );

  const handleScratchToSpace = useCallback(
    async (scratchId: string) => {
      if (!cloudSyncReady) {
        const scratch = thinkingStore.scratch.find((item) => item.id === scratchId);
        if (!scratch) return { ok: false as const, message: "随记不存在" };
        const created = await createThinkingSpaceApi(scratch.rawText, null);
        if (!created.ok) return { ok: false as const, message: created.message };
        setThinkingStore((prev) => ({
          ...prev,
          scratch: prev.scratch.filter((item) => item.id !== scratchId)
        }));
        markLocalChange();
        return { ok: true as const, spaceId: created.spaceId };
      }
      try {
        const response = await apiFetch(`/v1/thinking/scratch/${scratchId}/to-space`, { method: "POST" });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const body = (await response.json().catch(() => ({}))) as { space_id?: string };
        if (response.status === 409) return { ok: false as const, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
        if (!response.ok || typeof body.space_id !== "string") return { ok: false as const, message: "转为空间失败" };

        const spaceId = body.space_id;
        const spaces = await syncThinkingSpacesFromApi(true);
        await syncThinkingScratchFromApi(true);
        setActiveSpaceId(spaceId);
        if (spaces.some((space) => space.id === spaceId)) {
          await loadThinkingViewFromApi(spaceId, true);
        }
        markCloudSynced(sessionUser?.userId ?? null);
        return { ok: true as const, spaceId };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [cloudSyncReady, createThinkingSpaceApi, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, syncThinkingScratchFromApi, syncThinkingSpacesFromApi, thinkingStore.scratch]
  );

  const handleThinkingAddQuestion = useCallback(
    async (
      spaceId: string,
      payload: { rawInput: string; trackId: string | null; fromSuggestion?: boolean }
    ) => {
      const now = new Date().toISOString();
      const localNodeId = createId();
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              raw_text: payload.rawInput,
              track_id: payload.trackId,
              from_suggestion: payload.fromSuggestion === true,
              client_node_id: localNodeId,
              client_created_at: now,
              client_updated_at: now
            })
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          const body = (await response.json().catch(() => ({}))) as {
            node_id?: string;
            converted?: boolean;
            note_text?: string | null;
            track_id?: string;
            error?: string;
            suggested_questions?: string[];
            related_candidate?: { node_id?: string; preview?: string; score?: number } | null;
          };
          if (!response.ok) {
            if (response.status === 409) return { ok: false as const, message: "该空间已只读" };
            if (response.status === 400) return { ok: false as const, message: typeof body.error === "string" ? body.error : "输入过短" };
            return { ok: false as const, message: "放入结构失败" };
          }
          if (typeof body.node_id !== "string" || !body.node_id.trim()) {
            return { ok: false as const, message: "放入结构失败：未返回节点标识" };
          }
          await loadThinkingViewFromApi(spaceId, true);
          markCloudSynced(sessionUser?.userId ?? null);
          return {
            ok: true as const,
            converted: body.converted === true,
            noteText: typeof body.note_text === "string" ? body.note_text : null,
            trackId: typeof body.track_id === "string" ? body.track_id : payload.trackId ?? "",
            nodeId: body.node_id,
            suggestedQuestions: Array.isArray(body.suggested_questions) ? body.suggested_questions : [],
            relatedCandidate:
              body.related_candidate && typeof body.related_candidate.node_id === "string"
                ? {
                    nodeId: body.related_candidate.node_id,
                    preview: typeof body.related_candidate.preview === "string" ? body.related_candidate.preview : "",
                    score: Number.isFinite(body.related_candidate.score) ? Number(body.related_candidate.score) : 0
                  }
                : null
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      let resolvedTrackId = payload.trackId;
      if (!resolvedTrackId || resolvedTrackId.startsWith("track:")) {
        const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
        const currentTrackId = currentView?.currentTrackId ?? null;
        if (currentTrackId && currentTrackId !== currentView?.parkingTrackId) {
          resolvedTrackId = currentTrackId;
        } else {
          resolvedTrackId = createId();
        }
      }
      const normalizedTrackId = resolvedTrackId === "__new__" ? createId() : resolvedTrackId;
      if (!normalizedTrackId) {
        return { ok: false as const, message: "离线添加失败" };
      }

      await queueMutation(`/v1/thinking/spaces/${spaceId}/questions`, {
        raw_text: payload.rawInput,
        track_id: normalizedTrackId,
        from_suggestion: payload.fromSuggestion === true,
        client_node_id: localNodeId,
        client_created_at: now,
        client_updated_at: now
      });

      const patchNode = {
        id: localNodeId,
        questionText: payload.rawInput.trim(),
        noteText: null,
        answerText: null,
        isSuggested: payload.fromSuggestion === true,
        isMilestone: false,
        hasRelatedLink: false,
        createdAt: now,
        echoTrackId: null,
        echoNodeId: null
      };

      const current = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      if (current) {
        const trackExists = current.tracks.some((item) => item.id === normalizedTrackId);
        const nextTracks = trackExists
          ? current.tracks.map((track) => {
              if (track.id !== normalizedTrackId) return track;
              const nextNodes = [...track.nodes, patchNode];
              return {
                ...track,
                titleQuestionText:
                  !track.isParking && (track.titleQuestionText === "新方向" || !track.titleQuestionText.trim())
                    ? patchNode.questionText
                    : track.titleQuestionText,
                nodeCount: nextNodes.length,
                nodes: nextNodes
              };
            })
          : (() => {
              const withoutTarget = current.tracks.filter((track) => track.id !== normalizedTrackId);
              const parkingTrack = withoutTarget.find((track) => track.id === current.parkingTrackId) ?? null;
              const nonParkingTracks = withoutTarget.filter((track) => track.id !== current.parkingTrackId);
              const createdTrack = {
                id: normalizedTrackId,
                titleQuestionText: patchNode.questionText,
                directionHint: null,
                isParking: false,
                isEmpty: false,
                nodeCount: 1,
                nodes: [patchNode]
              };
              return parkingTrack ? [...nonParkingTracks, createdTrack, parkingTrack] : [...nonParkingTracks, createdTrack];
            })();
        const nextView: ThinkingSpaceView = {
          ...current,
          currentTrackId: normalizedTrackId,
          tracks: nextTracks
        };
        thinkingViewCacheRef.current[spaceId] = nextView;
        if (thinkingView?.spaceId === spaceId) setThinkingView(nextView);
      }

      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                lastActivityAt: now
              }
            : space
        ),
        nodes: [
          ...prev.nodes,
          {
            id: localNodeId,
            spaceId,
            parentNodeId: `track:${normalizedTrackId}`,
            rawQuestionText: patchNode.questionText,
            createdAt: now,
            orderIndex: prev.nodes.filter((node) => node.spaceId === spaceId).length,
            isSuggested: patchNode.isSuggested,
            state: "normal",
            dimension: "definition"
          }
        ]
      }));
      markLocalChange();
      return {
        ok: true as const,
        converted: false,
        noteText: null,
        trackId: normalizedTrackId,
        nodeId: localNodeId,
        suggestedQuestions: [],
        relatedCandidate: null
      };
    },
    [cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, thinkingView]
  );

  const handleThinkingOrganizePreview = useCallback(
    async (spaceId: string) => {
      if (!cloudSyncReady) return [];
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/organize-preview`, { method: "POST" });
        if (handleUnauthorized(response)) return [];
        if (!response.ok) return [];
        const body = (await response.json().catch(() => ({}))) as {
          candidates?: Array<{ node_id?: string; preview?: string; from_track_id?: string; suggested_track_id?: string; score?: number }>;
        };
        return (body.candidates ?? [])
          .filter((item) => typeof item.node_id === "string" && typeof item.from_track_id === "string" && typeof item.suggested_track_id === "string")
          .map((item) => ({
            nodeId: item.node_id as string,
            preview: typeof item.preview === "string" ? item.preview : "",
            fromTrackId: item.from_track_id as string,
            suggestedTrackId: item.suggested_track_id as string,
            score: Number.isFinite(item.score) ? Number(item.score) : 0
          }));
      } catch {
        return [];
      }
    },
    [cloudSyncReady, handleUnauthorized]
  );

  const handleThinkingOrganizeApply = useCallback(
    async (spaceId: string, moves: Array<{ nodeId: string; targetTrackId: string }>) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return { ok: false as const, message: "当前空间未加载完成" };
        const movingIds = new Set(moves.map((item) => item.nodeId));
        let resolvedTargetTrackId = moves[0]?.targetTrackId ?? "__new__";
        let nextTracks = currentView.tracks.map((track) => ({
          ...track,
          nodes: track.nodes.filter((node) => !movingIds.has(node.id))
        }));
        const movedNodes = currentView.tracks.flatMap((track) => track.nodes.filter((node) => movingIds.has(node.id)));
        if (!movedNodes.length) return { ok: true as const, movedCount: 0 };
        if (resolvedTargetTrackId === "__new__") {
          resolvedTargetTrackId = createId();
          const createdTrack = {
            id: resolvedTargetTrackId,
            titleQuestionText: movedNodes[0]?.questionText ?? "新方向",
            directionHint: null,
            isParking: false,
            isEmpty: false,
            nodeCount: movedNodes.length,
            nodes: movedNodes
          };
          const parkingTrackId = currentView.parkingTrackId;
          const parkingIndex = parkingTrackId ? nextTracks.findIndex((track) => track.id === parkingTrackId) : -1;
          if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, createdTrack);
          else nextTracks.push(createdTrack);
        } else {
          nextTracks = nextTracks.map((track) =>
            track.id === resolvedTargetTrackId ? { ...track, nodes: [...track.nodes, ...movedNodes], isEmpty: false } : track
          );
        }
        const linkedTracks = normalizeTrackListWithLinks(nextTracks, thinkingStore.nodeLinks, spaceId);
        const nextView: ThinkingSpaceView = {
          ...currentView,
          tracks: linkedTracks
        };
        commitLocalSpaceView(spaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, spaceId, nextView));
        markLocalChange();
        return { ok: true as const, movedCount: movedNodes.length };
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/organize-apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moves: moves.map((item) => ({ node_id: item.nodeId, target_track_id: item.targetTrackId }))
          })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const body = (await response.json().catch(() => ({}))) as { moved_count?: number; error?: string };
        if (!response.ok) return { ok: false as const, message: typeof body.error === "string" ? body.error : "整理失败" };
        await loadThinkingViewFromApi(spaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return { ok: true as const, movedCount: Number.isFinite(body.moved_count) ? Number(body.moved_count) : 0 };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks]
  );

  const handleThinkingLinkNodes = useCallback(
    async (nodeId: string, targetNodeId: string) => {
      if (!cloudSyncReady) {
        const source = thinkingStore.nodes.find((node) => node.id === nodeId);
        const target = thinkingStore.nodes.find((node) => node.id === targetNodeId);
        if (!source || !target || source.spaceId !== target.spaceId || source.id === target.id) return false;
        const sourceNodeId = [source.id, target.id].sort()[0];
        const targetNodeIdSorted = [source.id, target.id].sort()[1];
        const exists = thinkingStore.nodeLinks.some(
          (link) =>
            link.spaceId === source.spaceId &&
            link.sourceNodeId === sourceNodeId &&
            link.targetNodeId === targetNodeIdSorted &&
            link.linkType === "related"
        );
        if (exists) return true;
        const nextLink: ThinkingNodeLink = {
          id: createId(),
          spaceId: source.spaceId,
          sourceNodeId,
          targetNodeId: targetNodeIdSorted,
          linkType: "related",
          score: 1,
          createdAt: new Date().toISOString()
        };
        setThinkingStore((prev) => ({
          ...prev,
          nodeLinks: [...prev.nodeLinks, nextLink]
        }));
        const currentView = getLocalSpaceView(source.spaceId);
        if (currentView) {
          commitLocalSpaceView(source.spaceId, {
            ...currentView,
            tracks: normalizeTrackListWithLinks(currentView.tracks, [...thinkingStore.nodeLinks, nextLink], source.spaceId)
          });
        }
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_node_id: targetNodeId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks, thinkingStore.nodes]
  );

  const handleThinkingMoveNode = useCallback(
    async (nodeId: string, targetTrackId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!movingNode) return false;
        const nextTracks = currentView.tracks.map((track) =>
          track.id === targetTrackId
            ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
            : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
        );
        const nextView = {
          ...currentView,
          tracks: normalizeTrackListWithLinks(nextTracks, thinkingStore.nodeLinks, activeSpaceId)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_track_id: targetTrackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks]
  );

  const handleThinkingDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        const nextLinks = thinkingStore.nodeLinks.filter((link) => link.sourceNodeId !== nodeId && link.targetNodeId !== nodeId);
        const nextTracks = currentView.tracks.map((track) => ({
          ...track,
          nodes: track.nodes.filter((node) => node.id !== nodeId)
        }));
        const nextView = {
          ...currentView,
          tracks: normalizeTrackListWithLinks(nextTracks, nextLinks, activeSpaceId)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => ({
          ...syncStoreNodesFromView(prev, activeSpaceId, nextView),
          nodeLinks: nextLinks,
          spaceMeta: prev.spaceMeta.map((meta) =>
            meta.spaceId === activeSpaceId
              ? { ...meta, milestoneNodeIds: (meta.milestoneNodeIds ?? []).filter((id) => id !== nodeId) }
              : meta
          )
        }));
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/delete`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks]
  );

  const handleThinkingUpdateNode = useCallback(
    async (nodeId: string, rawQuestionText: string) => {
      const now = new Date().toISOString();
      const payload = { raw_question_text: rawQuestionText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation(`/v1/thinking/nodes/${nodeId}/update`, payload);
      const nextQuestion = rawQuestionText.trim();
      if (!nextQuestion) return false;
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, questionText: nextQuestion } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      setThinkingStore((prev) => ({
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, rawQuestionText: nextQuestion } : node))
      }));
      markLocalChange();
      return true;
    },
    [activeSpaceId, cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, thinkingView]
  );

  const handleThinkingCopyNode = useCallback(
    async (nodeId: string, targetTrackId?: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return null;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return null;
        const sourceNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!sourceNode) return null;
        const nextNodeId = createId();
        const nextNode = {
          ...sourceNode,
          id: nextNodeId,
          createdAt: new Date().toISOString(),
          echoNodeId: null,
          echoTrackId: null
        };
        const resolvedTrackId = targetTrackId ?? fromTrackParentId(thinkingStore.nodes.find((node) => node.id === nodeId)?.parentNodeId) ?? currentView.currentTrackId ?? currentView.tracks[0]?.id ?? null;
        if (!resolvedTrackId) return null;
        const nextTracks = currentView.tracks.map((track) =>
          track.id === resolvedTrackId ? { ...track, nodes: [...track.nodes, nextNode], isEmpty: false } : track
        );
        const nextView = {
          ...currentView,
          tracks: normalizeTrackListWithLinks(nextTracks, thinkingStore.nodeLinks, activeSpaceId)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => syncStoreNodesFromView(prev, activeSpaceId, nextView));
        markLocalChange();
        return nextNodeId;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetTrackId ? { target_track_id: targetTrackId } : {})
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { node_id?: string };
        if (!response.ok) return null;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return typeof body.node_id === "string" ? body.node_id : null;
      } catch {
        return null;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks, thinkingStore.nodes]
  );

  const handleThinkingSaveNodeAnswer = useCallback(
    async (nodeId: string, answerText: string | null) => {
      const now = new Date().toISOString();
      const payload = { answer_text: answerText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return false;
          if (!response.ok) return false;
          if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
          markCloudSynced(sessionUser?.userId ?? null);
          return true;
        } catch (error) {
          if (!isOfflineNetworkError(error)) return false;
        }
      }
      await queueMutation(`/v1/thinking/nodes/${nodeId}/answer`, payload);
      if (activeSpaceId) {
        const current = thinkingViewCacheRef.current[activeSpaceId] ?? (thinkingView?.spaceId === activeSpaceId ? thinkingView : null);
        if (current) {
          const nextTracks = current.tracks.map((track) => ({
            ...track,
            nodes: track.nodes.map((node) => (node.id === nodeId ? { ...node, answerText } : node))
          }));
          const nextView: ThinkingSpaceView = { ...current, tracks: nextTracks };
          thinkingViewCacheRef.current[activeSpaceId] = nextView;
          if (thinkingView?.spaceId === activeSpaceId) setThinkingView(nextView);
        }
      }
      markLocalChange();
      return true;
    },
    [activeSpaceId, cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, thinkingView]
  );

  const handleThinkingMisplacedNode = useCallback(
    async (nodeId: string) => {
      if (!cloudSyncReady) {
        if (!activeSpaceId) return false;
        const currentView = getLocalSpaceView(activeSpaceId);
        if (!currentView) return false;
        let parkingTrackId = currentView.parkingTrackId;
        let nextTracks = [...currentView.tracks];
        if (!parkingTrackId) {
          parkingTrackId = createId();
          nextTracks.push({
            id: parkingTrackId,
            titleQuestionText: "先放这里",
            directionHint: null,
            isParking: true,
            isEmpty: false,
            nodeCount: 0,
            nodes: []
          });
        }
        const movingNode = currentView.tracks.flatMap((track) => track.nodes).find((node) => node.id === nodeId);
        if (!movingNode) return false;
        nextTracks = nextTracks.map((track) =>
          track.id === parkingTrackId
            ? { ...track, nodes: [...track.nodes.filter((node) => node.id !== nodeId), movingNode], isEmpty: false }
            : { ...track, nodes: track.nodes.filter((node) => node.id !== nodeId) }
        );
        const nextView = {
          ...currentView,
          parkingTrackId,
          tracks: normalizeTrackListWithLinks(nextTracks, thinkingStore.nodeLinks, activeSpaceId)
        };
        commitLocalSpaceView(activeSpaceId, nextView);
        setThinkingStore((prev) => {
          const next = syncStoreNodesFromView(prev, activeSpaceId, nextView);
          return {
            ...next,
            spaceMeta: prev.spaceMeta.map((meta) =>
              meta.spaceId === activeSpaceId ? { ...meta, parkingTrackId } : meta
            )
          };
        });
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/nodes/${nodeId}/misplaced`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, thinkingStore.nodeLinks]
  );

  const handleThinkingSetActiveTrack = useCallback(
    async (spaceId: string, trackId: string) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView || !currentView.tracks.some((track) => track.id === trackId)) return false;
        commitLocalSpaceView(spaceId, {
          ...currentView,
          currentTrackId: trackId
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? { ...meta, lastTrackId: trackId } : meta))
        }));
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/active-track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: trackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await loadThinkingViewFromApi(spaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, sessionUser?.userId]
  );

  const handleThinkingCreateTrack = useCallback(
    async (spaceId: string) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return null;
        const trackId = createId();
        const nextTrack = {
          id: trackId,
          titleQuestionText: "新方向",
          directionHint: null,
          isParking: false,
          isEmpty: true,
          nodeCount: 0,
          nodes: []
        };
        const parkingIndex = currentView.parkingTrackId ? currentView.tracks.findIndex((track) => track.id === currentView.parkingTrackId) : -1;
        const nextTracks = [...currentView.tracks];
        if (parkingIndex >= 0) nextTracks.splice(parkingIndex, 0, nextTrack);
        else nextTracks.push(nextTrack);
        commitLocalSpaceView(spaceId, {
          ...currentView,
          currentTrackId: trackId,
          tracks: nextTracks
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) => (meta.spaceId === spaceId ? { ...meta, lastTrackId: trackId } : meta))
        }));
        markLocalChange();
        return trackId;
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { track_id?: string };
        if (!response.ok) return null;
        await loadThinkingViewFromApi(spaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return typeof body.track_id === "string" ? body.track_id : null;
      } catch {
        return null;
      }
    },
    [cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId]
  );

  const handleThinkingTrackDirection = useCallback(
    async (spaceId: string, trackId: string, directionHint: TrackDirectionHint | null) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return false;
        commitLocalSpaceView(spaceId, {
          ...currentView,
          tracks: currentView.tracks.map((track) => (track.id === trackId ? { ...track, directionHint } : track))
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) =>
            meta.spaceId === spaceId
              ? {
                  ...meta,
                  trackDirectionHints: {
                    ...(meta.trackDirectionHints ?? {}),
                    [trackId]: directionHint
                  }
                }
              : meta
          )
        }));
        markLocalChange();
        return true;
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/track-direction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: trackId, direction_hint: directionHint })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          await loadThinkingViewFromApi(spaceId, true);
          return false;
        }
        await loadThinkingViewFromApi(spaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return true;
      } catch {
        return false;
      }
    },
    [cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId]
  );

  const handleThinkingSaveBackground = useCallback(
    async (spaceId: string, backgroundText: string | null) => {
      if (!cloudSyncReady) {
        const currentView = getLocalSpaceView(spaceId);
        if (!currentView) return { ok: false as const, message: "当前空间未加载完成" };
        const nextVersion = (currentView.backgroundVersion ?? 0) + 1;
        commitLocalSpaceView(spaceId, {
          ...currentView,
          backgroundText,
          backgroundVersion: nextVersion
        });
        setThinkingStore((prev) => ({
          ...prev,
          spaceMeta: prev.spaceMeta.map((meta) =>
            meta.spaceId === spaceId
              ? {
                  ...meta,
                  backgroundText,
                  backgroundVersion: nextVersion
                }
              : meta
          )
        }));
        markLocalChange();
        return { ok: true as const, version: nextVersion };
      }
      try {
        const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/background`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ background_text: backgroundText })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          background_version?: number;
          error?: string;
        };
        if (!response.ok) {
          return { ok: false as const, message: typeof payload.error === "string" ? payload.error : "背景保存失败" };
        }
        await loadThinkingViewFromApi(spaceId, true);
        markCloudSynced(sessionUser?.userId ?? null);
        return {
          ok: true as const,
          version: Number.isFinite(payload.background_version) ? Number(payload.background_version) : 0
        };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [cloudSyncReady, commitLocalSpaceView, getLocalSpaceView, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId]
  );

  const handleThinkingWriteToTime = useCallback(
    async (spaceId: string, freezeNote?: string) => {
      const now = new Date().toISOString();
      const normalizedNote = typeof freezeNote === "string" ? freezeNote.trim() : "";
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/write-to-time`, {
            method: "POST",
            headers: normalizedNote ? { "Content-Type": "application/json" } : undefined,
            body: normalizedNote ? JSON.stringify({ freeze_note: normalizedNote, client_updated_at: now }) : JSON.stringify({ client_updated_at: now })
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          if (!response.ok) {
            if (response.status === 404) return { ok: false as const, message: "空间不存在" };
            return { ok: false as const, message: "写入时间失败" };
          }
          await syncLifeFromApi(true);
          const spaces = await syncThinkingSpacesFromApi(true);
          const nextActive = pickDefaultSpaceId(spaces);
          setActiveSpaceId(nextActive);
          if (nextActive) await loadThinkingViewFromApi(nextActive, true);
          else setThinkingView(null);
          markCloudSynced(sessionUser?.userId ?? null);
          return { ok: true as const };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      const currentSpace = thinkingStore.spaces.find((item) => item.id === spaceId);
      if (!currentSpace) return { ok: false as const, message: "空间不存在" };
      const currentView = thinkingViewCacheRef.current[spaceId] ?? (thinkingView?.spaceId === spaceId ? thinkingView : null);
      const sortedNodes =
        currentView?.tracks
          .flatMap((track) => track.nodes.map((node) => ({ ...node, trackId: track.id })))
          .sort((a, b) => new Date(a.createdAt ?? "").getTime() - new Date(b.createdAt ?? "").getTime()) ?? [];
      const firstPreview = sortedNodes[0]?.questionText?.trim() || null;
      const lastPreview = sortedNodes[sortedNodes.length - 1]?.questionText?.trim() || firstPreview;
      const doubtId = currentSpace.sourceTimeDoubtId ?? createId();

      await queueMutation(`/v1/thinking/spaces/${spaceId}/write-to-time`, normalizedNote ? { freeze_note: normalizedNote } : null);

      setLifeStore((prev) => {
        const nextDoubt: LifeDoubt = {
          id: doubtId,
          rawText: currentSpace.rootQuestionText,
          firstNodePreview: firstPreview,
          lastNodePreview: lastPreview,
          createdAt: now,
          archivedAt: null,
          deletedAt: null
        };
        const nextDoubts = [nextDoubt, ...prev.doubts.filter((item) => item.id !== doubtId)];
        return { ...prev, doubts: nextDoubts };
      });

      setThinkingStore((prev) => {
        const nextSpaces = prev.spaces.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                status: "hidden" as const,
                frozenAt: now,
                sourceTimeDoubtId: doubtId,
                lastActivityAt: now
              }
            : space
        );
        const existingMeta = prev.spaceMeta.find((meta) => meta.spaceId === spaceId);
        const nextMeta = existingMeta
          ? prev.spaceMeta.map((meta) =>
              meta.spaceId === spaceId
                ? {
                    ...meta,
                    userFreezeNote: normalizedNote || meta.userFreezeNote
                  }
                : meta
            )
          : [
              ...prev.spaceMeta,
              {
                spaceId,
                userFreezeNote: normalizedNote || null,
                exportVersion: 1,
                backgroundText: null,
                backgroundVersion: 0,
                suggestionDecay: 0,
                lastTrackId: null,
                lastOrganizedOrder: -1,
                parkingTrackId: createId(),
                pendingTrackId: null,
                emptyTrackIds: [],
                milestoneNodeIds: [],
                trackDirectionHints: {}
              }
            ];
        return {
          ...prev,
          spaces: nextSpaces,
          spaceMeta: nextMeta
        };
      });
      const nextSpacesForPick = thinkingStore.spaces
        .map((space) =>
          space.id === spaceId
            ? {
                ...space,
                status: "hidden" as const
              }
            : space
        )
        .filter((space) => space.status === "active");
      const nextActive = nextSpacesForPick[0]?.id ?? null;
      setActiveSpaceId(nextActive);
      if (nextActive) setThinkingView(thinkingViewCacheRef.current[nextActive] ?? null);
      else setThinkingView(null);
      markLocalChange();
      return { ok: true as const };
    },
    [cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncLifeFromApi, syncThinkingSpacesFromApi, thinkingStore.spaces, thinkingView]
  );

  const handleThinkingDeleteSpace = useCallback(
    async (spaceId: string) => {
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/delete`, { method: "POST" });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            return { ok: false as const, message: typeof payload.error === "string" ? payload.error : "删除空间失败" };
          }
          const spaces = await syncThinkingSpacesFromApi(true);
          const nextActive = pickDefaultSpaceId(spaces);
          setActiveSpaceId(nextActive);
          if (nextActive) await loadThinkingViewFromApi(nextActive, true);
          else setThinkingView(null);
          markCloudSynced(sessionUser?.userId ?? null);
          return { ok: true as const };
        } catch {
          return { ok: false as const, message: "网络异常，请稍后再试" };
        }
      }
      delete thinkingViewCacheRef.current[spaceId];
      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.filter((space) => space.id !== spaceId),
        nodes: prev.nodes.filter((node) => node.spaceId !== spaceId),
        spaceMeta: prev.spaceMeta.filter((meta) => meta.spaceId !== spaceId),
        inbox: Object.fromEntries(Object.entries(prev.inbox).filter(([key]) => key !== spaceId))
      }));
      const nextActive = pickDefaultSpaceId(thinkingStore.spaces.filter((space) => space.id !== spaceId));
      setActiveSpaceId(nextActive);
      setThinkingView(nextActive ? thinkingViewCacheRef.current[nextActive] ?? null : null);
      markLocalChange();
      return { ok: true as const };
    },
    [cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, sessionUser?.userId, syncThinkingSpacesFromApi, thinkingStore.spaces]
  );

  const handleThinkingExport = useCallback(async (spaceId: string) => {
    try {
      const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/export`, { method: "GET", cache: "no-store" });
      if (handleUnauthorized(response)) return null;
      if (!response.ok) return null;
      const payload = (await response.json()) as { markdown?: string };
      return typeof payload.markdown === "string" ? payload.markdown : null;
    } catch {
      return null;
    }
  }, [handleUnauthorized]);

  const handleThinkingRenameSpace = useCallback(
    async (spaceId: string, rootQuestionText: string) => {
      const now = new Date().toISOString();
      const payload = { root_question_text: rootQuestionText, client_updated_at: now };
      if (cloudSyncReady) {
        try {
          const response = await apiFetch(`/v1/thinking/spaces/${spaceId}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
          const responseBody = (await response.json().catch(() => ({}))) as { error?: string; root_question_text?: string };
          if (!response.ok) {
            return { ok: false as const, message: typeof responseBody.error === "string" ? responseBody.error : "重命名失败" };
          }
          const spaces = await syncThinkingSpacesFromApi(true);
          if (activeSpaceId && spaces.some((space) => space.id === activeSpaceId)) {
            await loadThinkingViewFromApi(activeSpaceId, true);
          }
          markCloudSynced(sessionUser?.userId ?? null);
          return {
            ok: true as const,
            rootQuestionText: typeof responseBody.root_question_text === "string" ? responseBody.root_question_text : rootQuestionText
          };
        } catch (error) {
          if (!isOfflineNetworkError(error)) {
            return { ok: false as const, message: "网络异常，请稍后再试" };
          }
        }
      }
      await queueMutation(`/v1/thinking/spaces/${spaceId}/rename`, payload);
      const nextText = rootQuestionText.trim();
      setThinkingStore((prev) => ({
        ...prev,
        spaces: prev.spaces.map((space) => (space.id === spaceId ? { ...space, rootQuestionText: nextText, lastActivityAt: now } : space))
      }));
      markLocalChange();
      return { ok: true as const, rootQuestionText: nextText };
    },
    [activeSpaceId, cloudSyncReady, handleUnauthorized, loadThinkingViewFromApi, markCloudSynced, markLocalChange, queueMutation, sessionUser?.userId, showNotice, syncThinkingSpacesFromApi]
  );

  const handleSystemExport = useCallback(
    async (options: { includeLife: boolean; includeThinking: boolean }) => {
      if (!sessionUser) return null;
      try {
        const params = new URLSearchParams({
          format: "markdown",
          include_life: String(options.includeLife),
          include_thinking: String(options.includeThinking)
        });
        const response = await apiFetch(`/v1/system/export?${params.toString()}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return null;
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => ({}))) as { markdown?: string };
        return typeof payload.markdown === "string" ? payload.markdown : null;
      } catch {
        return null;
      }
    },
    [handleUnauthorized, sessionUser]
  );

  const keepCloudData = useCallback(async () => {
    if (!sessionUser) return;
    setBindingDialog((current) => (current ? { ...current, submitting: true } : current));
    thinkingViewCacheRef.current = {};
    setOfflineRuntimeState("user_bootstrapping");
    updateOfflineMeta((current) => ({
      ...current,
      ownerMode: "user",
      boundUserId: sessionUser.userId,
      syncState: {
        ...current.syncState,
        bindingRequired: false,
        hasLocalChanges: false
      }
    }));
    await clearOfflineSnapshotByOwner(guestOwnerKey);
    setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
    await refreshFromCloud(null, sessionUser.userId);
    setBindingDialog(null);
    showNotice("已保留云端数据");
  }, [guestOwnerKey, refreshFromCloud, sessionUser, showNotice, updateOfflineMeta]);

  const uploadLocalData = useCallback(async () => {
    if (!sessionUser) return;
    setBindingDialog((current) => (current ? { ...current, submitting: true } : current));
    const imported = await importLocalPayloadToCloud(sessionUser);
    if (!imported) {
      setBindingDialog((current) => (current ? { ...current, submitting: false } : current));
      showNotice("本地数据绑定失败，请稍后再试");
      return;
    }
    await clearOfflineSnapshotByOwner(guestOwnerKey);
    setActiveOwnerKey(getUserOwnerKey(sessionUser.userId));
    setOfflineRuntimeState("user_bootstrapping");
    setBindingDialog(null);
    showNotice("本地数据已上传并覆盖云端");
  }, [guestOwnerKey, importLocalPayloadToCloud, sessionUser, showNotice]);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await apiFetch("/v1/auth/logout", { method: "POST" });
      } finally {
        bindingCheckUserIdRef.current = null;
        userBootstrapRef.current = null;
        setSessionUser(null);
        setBindingDialog(null);
        setAuthDialogOpen(false);
        setActiveOwnerKey(guestOwnerKey);
        await loadOwnerSnapshot(guestOwnerKey, createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId()));
        setOfflineRuntimeState("guest_ready");
        showNotice("已退出登录");
      }
    })();
  }, [guestOwnerKey, loadOwnerSnapshot, showNotice]);

  const clearAllData = useCallback(() => {
    setThinkingStore(EMPTY_THINKING_STORE);
    setActiveSpaceId(null);
    setThinkingView(null);
    setLifeStore((prev) => ({ ...EMPTY_LIFE_STORE, meta: prev.meta }));
    setOfflineSnapshotExists(false);
    setBindingDialog(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LIFE_STORAGE_KEY);
      window.localStorage.removeItem(THINKING_STORAGE_KEY);
    }
    if (activeOwnerKey) {
      void clearOfflineOwnerState(activeOwnerKey);
    }
    updateOfflineMeta((current) => ({
      ...current,
      ownerMode: sessionUser ? "user" : "guest",
      boundUserId: sessionUser?.userId ?? null,
      syncState: {
        lastSyncedAt: current.syncState.lastSyncedAt,
        hasLocalChanges: false,
        bindingRequired: false
      }
    }));
    if (cloudSyncEnabled && sessionUser && isOnline) {
      userBootstrapRef.current = null;
      setOfflineRuntimeState("user_bootstrapping");
    }
    showNotice("本地缓存已清理");
  }, [activeOwnerKey, cloudSyncEnabled, isOnline, sessionUser, showNotice, updateOfflineMeta]);

  const handlePinVerified = useCallback(() => {
    setPinUnlocked(true);
    const status = refreshPinState();
    if (!status.enabled) setPinEnabled(false);
  }, [refreshPinState]);

  const handleEnablePin = useCallback(
    async (pin: string) => {
      const result = await enablePin(pin);
      refreshPinState();
      return result;
    },
    [refreshPinState]
  );

  const handleDisablePin = useCallback(
    async (pin: string) => {
      const result = await disablePin(pin);
      refreshPinState();
      if (result.ok) setPinUnlocked(true);
      return result;
    },
    [refreshPinState]
  );

  const handleChangePin = useCallback(
    async (currentPin: string, nextPin: string) => {
      const result = await changePin(currentPin, nextPin);
      refreshPinState();
      return result;
    },
    [refreshPinState]
  );

  const handleForgotPin = useCallback(async () => {
    await clearOfflineState();
    clearPinStatus();
    setPinUnlocked(true);
    setOfflineSnapshotExists(false);
    setSessionUser(null);
    setThinkingView(null);
    setActiveSpaceId(null);
    setActiveOwnerKey(getGuestOwnerKey(localProfileIdRef.current || getOrCreateLocalProfileId()));
    setOfflineRuntimeState("guest_ready");
    setOfflineMeta(createOfflineSnapshotMeta(localProfileIdRef.current || getOrCreateLocalProfileId()));
    refreshPinState();
  }, [refreshPinState]);

  void pinTick;

  if (!pinReady) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">加载中...</p>
      </div>
    );
  }

  if (pinEnabled && !pinUnlocked) {
    return <PinGate lockedUntil={pinLockedUntil} onVerified={handlePinVerified} />;
  }

  if (!hydrated) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">加载中...</p>
      </div>
    );
  }

  if (!sessionUser && !guestModeEnabled) {
    return <AuthPanel onAuthed={() => void syncAuth()} onClose={() => setAuthDialogOpen(false)} />;
  }

  const thinkingChromeHidden = tab === "thinking" && (thinkingFocusMode || thinkingViewMode === "detail");
  const isLifeTab = tab === "life";
  const isThinkingTab = tab === "thinking";
  const isSettingsTab = tab === "settings";
  const showGlobalHeader = !thinkingChromeHidden;
  const mainFlushTop = thinkingChromeHidden || isLifeTab;
  const showMobileMainBottomNav = (isThinkingTab && !thinkingChromeHidden) || isSettingsTab;

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden text-slate-100",
        tab === "life" ? "life-surface" : tab === "thinking" ? "thinking-surface text-slate-900" : "settings-surface"
      )}
    >
      {showGlobalHeader ? (
      <header
        className={cn(
          "absolute left-0 top-0 z-30 w-full px-4 py-4 md:px-6",
          tab === "thinking"
            ? "border-black/8 bg-[#f5f3f0]/76"
            : isLifeTab
              ? "border-transparent bg-transparent"
              : "border-b border-slate-200/10 bg-black/20 backdrop-blur"
        )}
      >
        {isLifeTab ? (
          <div className="mx-auto flex w-full max-w-[1680px] items-center justify-end">
            <nav className="flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-black/25 px-1.5 py-1 backdrop-blur">
              <TopTab label="时间" active={isLifeTab} onClick={() => setTab("life")} daytime={false} subtle />
              <TopTab label="思路" active={isThinkingTab} onClick={() => setTab("thinking")} daytime subtle />
              <TopTab label="设置" active={isSettingsTab} onClick={() => setTab("settings")} daytime={false} subtle />
            </nav>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
            <div className={cn("inline-flex items-center gap-2 text-sm tracking-[0.24em]", isThinkingTab || isSettingsTab ? "text-slate-700" : "text-slate-300/80")}><img src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></div>
            <nav className="flex items-center gap-2">
              <div className={cn("items-center gap-2", isThinkingTab || isSettingsTab ? "hidden md:flex" : "flex")}>
                <TopTab label="时间" active={isLifeTab} onClick={() => setTab("life")} daytime={false} subtle={false} />
                <TopTab label="思路" active={isThinkingTab} onClick={() => setTab("thinking")} daytime subtle={false} />
                <TopTab label="设置" active={isSettingsTab} onClick={() => setTab("settings")} daytime={!isLifeTab} subtle={false} />
              </div>
            </nav>
          </div>
        )}
      </header>
      ) : null}

      <main className={cn("h-full", mainFlushTop ? "pt-0" : "pt-[62px]")}>
        <AnimatePresence mode="wait">
          {tab === "life" ? (
            <motion.section
              key="life"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.62 }}
            >
              <LifeLayer
                store={lifeStore}
                setStore={setLifeStore}
                timezone={thinkingStore.timezone}
                freezeNoteByDoubtId={freezeNoteByDoubtId}
                ready={lifeReady}
                openingPhase={openingPhase}
                stars={stars}
                editable={!editingLocked}
                onImportToThinking={handleImportToThinking}
                onCreateDoubt={createLifeDoubt}
                onSaveDoubtNote={saveLifeDoubtNote}
                onDeleteDoubt={deleteLifeDoubtWithDerived}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
          {tab === "thinking" ? (
            <motion.section
              key="thinking"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.52 }}
            >
              <ThinkingLayer
                store={thinkingStore}
                setStore={setThinkingStore}
                timezone={thinkingStore.timezone}
                activeSpaceId={activeSpaceId}
                setActiveSpaceId={setActiveSpaceId}
                spaceView={thinkingView}
                writeEnabled={!editingLocked}
                onCreateSpace={handleCreateThinkingFromInput}
                onAddQuestion={handleThinkingAddQuestion}
                onOrganizePreview={handleThinkingOrganizePreview}
                onOrganizeApply={handleThinkingOrganizeApply}
                onLinkNodes={handleThinkingLinkNodes}
                onMoveNode={handleThinkingMoveNode}
                onMarkMisplaced={handleThinkingMisplacedNode}
                onDeleteNode={handleThinkingDeleteNode}
                onUpdateNodeQuestion={handleThinkingUpdateNode}
                onCopyNode={handleThinkingCopyNode}
                onSaveNodeAnswer={handleThinkingSaveNodeAnswer}
                onSetActiveTrack={handleThinkingSetActiveTrack}
                onCreateTrack={handleThinkingCreateTrack}
                onSaveBackground={handleThinkingSaveBackground}
                onWriteSpaceToTime={handleThinkingWriteToTime}
                onDeleteSpace={handleThinkingDeleteSpace}
                onRenameSpace={handleThinkingRenameSpace}
                onExportSpace={handleThinkingExport}
                onUpdateTrackDirection={handleThinkingTrackDirection}
                scratchItems={thinkingStore.scratch}
                onCreateScratch={handleCreateThinkingScratch}
                onFeedScratchToTime={handleFeedThinkingScratchToTime}
                onDeleteScratch={handleDeleteThinkingScratch}
                onScratchToSpace={handleScratchToSpace}
                focusMode={thinkingFocusMode}
                onFocusModeChange={setThinkingFocusMode}
                onViewModeChange={setThinkingViewMode}
                reentryTarget={thinkingJumpTarget}
                onReentryHandled={() => setThinkingJumpTarget(null)}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
          {tab === "settings" ? (
            <motion.section
              key="settings"
              className="h-full"
              initial={{ opacity: 0.24 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.2 }}
              transition={{ duration: 0.52 }}
            >
              <SettingsLayer
                timezone={thinkingStore.timezone}
                setTimezone={(timezone) => setThinkingStore((prev) => ({ ...prev, timezone: sanitizeTimeZone(timezone) }))}
                activeThinkingSpaces={activeThinkingSpaceOptions}
                fixedTopSpacesEnabled={thinkingStore.fixedTopSpacesEnabled}
                fixedTopSpaceIds={thinkingStore.fixedTopSpaceIds}
                sessionEmail={sessionUser?.email ?? null}
                cloudSyncEnabled={cloudSyncEnabled}
                pinEnabled={pinEnabled}
                pinLockedUntil={pinLockedUntil}
                onEnablePin={handleEnablePin}
                onDisablePin={handleDisablePin}
                onChangePin={handleChangePin}
                onForgotPin={handleForgotPin}
                onOpenAuth={() => setAuthDialogOpen(true)}
                setFixedTopSpacesEnabled={(enabled) =>
                  setThinkingStore((prev) => {
                    const activeSpaces = [...prev.spaces].filter((space) => space.status === "active").sort(sortSpacesByLatestActivity);
                    const existingIds = prev.fixedTopSpaceIds.filter(
                      (id, index, array) => array.indexOf(id) === index && activeSpaces.some((space) => space.id === id)
                    );
                    const nextIds = enabled && existingIds.length === 0 ? activeSpaces.slice(0, 3).map((space) => space.id) : existingIds;
                    return {
                      ...prev,
                      fixedTopSpacesEnabled: enabled,
                      fixedTopSpaceIds: nextIds.slice(0, 3)
                    };
                  })
                }
                setFixedTopSpaceIds={(ids) =>
                  setThinkingStore((prev) => {
                    const activeIdSet = new Set(prev.spaces.filter((space) => space.status === "active").map((space) => space.id));
                    const nextIds = Array.from(new Set(ids.filter((id) => activeIdSet.has(id)))).slice(0, 3);
                    return { ...prev, fixedTopSpaceIds: nextIds };
                  })
                }
                onSystemExport={handleSystemExport}
                onClearAll={clearAllData}
                onLogout={logout}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>

      {showMobileMainBottomNav ? (
        <div className="mobile-main-nav absolute inset-x-0 bottom-0 z-30 md:hidden">
          <nav className="mx-auto grid h-14 w-full max-w-md grid-cols-3 px-3">
            <MobileBottomTab label="时间" icon="life" active={isLifeTab} onClick={() => setTab("life")} />
            <MobileBottomTab label="思路" icon="thinking" active={isThinkingTab} onClick={() => setTab("thinking")} />
            <MobileBottomTab label="设置" icon="settings" active={isSettingsTab} onClick={() => setTab("settings")} />
          </nav>
          <div className="h-[calc(var(--safe-bottom)+4px)]" />
        </div>
      ) : null}

      <p
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-400/20 bg-black/45 px-4 py-1.5 text-xs text-slate-200/80 backdrop-blur transition-all duration-300",
          showMobileMainBottomNav ? "bottom-[calc(var(--safe-bottom)+64px)] md:bottom-4" : "bottom-4",
          notice ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {notice}
      </p>

      {authDialogOpen ? <AuthDialog onClose={() => setAuthDialogOpen(false)} onAuthed={() => void syncAuth()} /> : null}
      {bindingDialog ? (
        <BindingDialog
          submitting={bindingDialog.submitting}
          onKeepCloud={() => void keepCloudData()}
          onUploadLocal={() => void uploadLocalData()}
        />
      ) : null}
    </div>
  );
}

function TopTab(props: { label: string; active: boolean; onClick: () => void; daytime: boolean; subtle?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "rounded-full border px-3 text-xs tracking-[0.12em] transition-colors",
        props.subtle
          ? props.active
            ? "border-white/[0.06] bg-white/[0.03] text-[rgba(236,233,226,0.8)]"
            : "border-white/[0.03] bg-transparent text-[rgba(224,219,211,0.38)] hover:bg-white/[0.025] hover:text-[rgba(236,233,226,0.68)]"
          :
        props.active
          ? props.daytime
            ? "border-slate-600/35 bg-slate-100/75 text-slate-900"
            : "border-slate-300/40 bg-slate-800/70 text-slate-100"
          : props.daytime
            ? "border-slate-500/15 bg-slate-100/20 text-slate-700 hover:bg-slate-100/65"
            : "border-slate-300/15 bg-slate-900/20 text-slate-300/80 hover:bg-slate-900/50"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

function MobileBottomTab(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: "life" | "thinking" | "settings";
}) {
  return (
    <button
      type="button"
      data-active={props.active ? "true" : "false"}
      className="mobile-main-nav-item relative flex h-full w-full flex-col items-center justify-center gap-[2px]"
      onClick={props.onClick}
    >
      <span className="mobile-main-nav-icon" aria-hidden="true">
        <MobileBottomTabIcon icon={props.icon} />
      </span>
      <span className="text-[11px] tracking-[0.08em]">{props.label}</span>
      <span className="mobile-main-nav-indicator absolute bottom-0 h-[2px] w-8 rounded-full" />
    </button>
  );
}

function MobileBottomTabIcon(props: { icon: "life" | "thinking" | "settings" }) {
  if (props.icon === "life") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.3" />
        <path d="M9 5.6V9.2L11.2 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (props.icon === "thinking") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4.25 4.8H11.6M4.25 9H13.75M4.25 13.2H10.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="13.8" cy="4.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2.8L9.55 4.42C9.66 4.74 9.96 4.96 10.3 4.99L12.02 5.13C12.76 5.19 13.06 6.12 12.48 6.58L11.14 7.63C10.87 7.84 10.75 8.19 10.84 8.51L11.25 10.18C11.42 10.89 10.63 11.45 10.02 11L8.58 9.95C8.3 9.75 7.93 9.75 7.65 9.95L6.21 11C5.6 11.45 4.81 10.89 4.98 10.18L5.39 8.51C5.48 8.19 5.36 7.84 5.09 7.63L3.75 6.58C3.17 6.12 3.47 5.19 4.21 5.13L5.93 4.99C6.27 4.96 6.57 4.74 6.68 4.42L7.23 2.8C7.47 2.1 8.53 2.1 8.77 2.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.1" opacity="0.32" />
    </svg>
  );
}

function PinGate(props: { lockedUntil: number; onVerified: () => void }) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (props.lockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [props.lockedUntil]);

  void tick;

  const lockedSeconds = Math.max(0, Math.ceil((props.lockedUntil - Date.now()) / 1000));

  const submit = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    void (async () => {
      try {
        const result = await verifyPin(pin);
        if (!result.ok) {
          setError(result.error ?? "PIN 校验失败");
          return;
        }
        setPin("");
        props.onVerified();
      } finally {
        setSubmitting(false);
      }
    })();
  }, [pin, props, submitting]);

  return (
    <div className="grid h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-300/15 bg-slate-900/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="text-sm tracking-[0.22em] text-slate-300/85">本地锁屏</p>
        <p className="mt-2 text-xs text-slate-400/75">请输入 PIN 以解锁离线内容。</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D+/g, "").slice(0, 12))}
          placeholder="PIN"
          className="mt-4 h-10 w-full rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
          onKeyDown={(event) => event.key === "Enter" && submit()}
          disabled={lockedSeconds > 0}
        />
        <Button
          type="button"
          disabled={submitting || lockedSeconds > 0}
          className="mt-4 w-full rounded-full border border-slate-300/30 bg-slate-900/70 text-slate-100 hover:bg-slate-800/90"
          onClick={submit}
        >
          {lockedSeconds > 0 ? `请等待 ${lockedSeconds}s` : submitting ? "解锁中..." : "解锁"}
        </Button>
        <p className={cn("mt-3 min-h-[1.2em] text-xs text-red-300/85", error ? "opacity-100" : "opacity-0")}>{error}</p>
      </div>
    </div>
  );
}

function AuthDialog(props: { onClose: () => void; onAuthed: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <AuthPanel onAuthed={props.onAuthed} onClose={props.onClose} />
      </div>
    </div>
  );
}

function BindingDialog(props: { submitting: boolean; onUploadLocal: () => void; onKeepCloud: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/15 bg-slate-950/95 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <p className="text-sm tracking-[0.18em] text-slate-300/85">首次绑定账号</p>
        <h2 className="mt-3 text-xl font-medium">云端已存在数据</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300/80">
          当前设备里也有本地离线数据。为了避免误合并，这次需要明确选择保留哪一边。
        </p>
        <div className="mt-6 grid gap-3">
          <Button
            type="button"
            disabled={props.submitting}
            className="rounded-full border border-slate-200/25 bg-slate-100 text-slate-950 hover:bg-white"
            onClick={props.onUploadLocal}
          >
            {props.submitting ? "处理中..." : "上传本地覆盖云端"}
          </Button>
          <Button
            type="button"
            disabled={props.submitting}
            variant="ghost"
            className="rounded-full border border-slate-300/20 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80"
            onClick={props.onKeepCloud}
          >
            保留云端丢弃本地
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthPanel(props: { onAuthed: () => void; onClose?: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(0);
        setCooldownTick(0);
        window.clearInterval(timer);
        return;
      }
      setCooldownTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const switchMode = useCallback((nextMode: "login" | "register" | "forgot") => {
    setMode(nextMode);
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setCooldownUntil(0);
    setCooldownTick(0);
  }, []);

  void cooldownTick;
  const resendSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const submit = useCallback(() => {
    if (mode === "login") {
      if (!email.trim() || !password) {
        setError("请输入邮箱和密码");
        return;
      }
    } else {
      if (!email.trim() || !password || !confirmPassword || !code.trim()) {
        setError(mode === "register" ? "请输入邮箱、密码、重复密码和验证码" : "请输入邮箱、新密码、重复密码和验证码");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    void (async () => {
      try {
        const endpoint =
          mode === "login" ? "/v1/auth/login" : mode === "register" ? "/v1/auth/register" : "/v1/auth/password/reset";
        const body =
          mode === "login"
            ? { email, password }
            : mode === "register"
              ? { email, password, code }
              : { email, code, newPassword: password };
        const response = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || "认证失败");
          return;
        }
        if (mode === "forgot") {
          setError("");
          setCode("");
          setPassword("");
          setConfirmPassword("");
          setCooldownUntil(0);
          setCooldownTick(0);
          setMode("login");
          return;
        }
        props.onAuthed();
        props.onClose?.();
      } catch {
        setError("网络异常，请稍后再试");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [code, confirmPassword, email, mode, password, props]);

  const sendCode = useCallback(() => {
    if (!email.trim()) {
      setError("请先输入邮箱");
      return;
    }
    setSendingCode(true);
    setError("");
    void (async () => {
      try {
        const endpoint = mode === "forgot" ? "/v1/auth/password/send-reset-code" : "/v1/auth/register/send-code";
        const response = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || "验证码发送失败");
          return;
        }
        setCooldownUntil(Date.now() + 60_000);
      } catch {
        setError("网络异常，请稍后再试");
      } finally {
        setSendingCode(false);
      }
    })();
  }, [email, mode]);

  return (
    <div className={cn("px-4", props.onClose ? "" : "grid h-screen place-items-center bg-slate-950")}>
      <div className="w-full max-w-md rounded-2xl border border-slate-300/15 bg-slate-900/65 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm tracking-[0.22em] text-slate-300/85"><img src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></p>
          {props.onClose ? (
            <button
              type="button"
              className="rounded-full border border-slate-300/20 px-2.5 py-1 text-xs text-slate-300/75 transition-colors hover:bg-slate-800/70"
              onClick={props.onClose}
            >
              关闭
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs tracking-[0.12em] text-slate-400/75">
          {mode === "login" ? "请先登录你的时间档案馆" : mode === "register" ? "用邮箱验证码完成注册" : "用邮箱验证码重置密码"}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "login" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "register" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "forgot" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => switchMode("forgot")}
          >
            忘记密码
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="邮箱"
            className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "forgot" ? "新密码（至少8位）" : "密码（至少8位）"}
            className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          {mode !== "login" ? (
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={mode === "register" ? "重复输入密码" : "重复输入新密码"}
              className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
          ) : null}
          {mode !== "login" ? (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                placeholder="邮箱验证码"
                className="h-10 flex-1 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
                onKeyDown={(event) => event.key === "Enter" && submit()}
              />
              <Button
                type="button"
                disabled={sendingCode || resendSeconds > 0}
                className="rounded-full border border-slate-300/20 bg-slate-950/40 px-4 text-xs text-slate-200 hover:bg-slate-900/70 disabled:text-slate-500"
                onClick={sendCode}
              >
                {sendingCode ? "发送中..." : resendSeconds > 0 ? `${resendSeconds}s` : "发送验证码"}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={submitting}
            className="rounded-full border border-slate-300/30 bg-slate-900/70 text-slate-100 hover:bg-slate-800/90"
            onClick={submit}
          >
            {submitting ? "处理中..." : mode === "login" ? "登录" : mode === "register" ? "注册并登录" : "重置密码"}
          </Button>
          {mode === "login" ? (
            <button
              type="button"
              className="justify-self-start text-xs text-slate-400/75 transition-colors hover:text-slate-200/85"
              onClick={() => switchMode("forgot")}
            >
              忘记密码？
            </button>
          ) : null}
          <p className={cn("min-h-[1.2em] text-xs text-red-300/85", error ? "opacity-100" : "opacity-0")}>{error}</p>
        </div>
      </div>
    </div>
  );
}









