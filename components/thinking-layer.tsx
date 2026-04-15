"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  formatTimeInTimeZone,
  type ThinkingScratchItem,
  type ThinkingSpaceStatus,
  type ThinkingStore,
  type TrackDirectionHint
} from "@/components/zhihuo-model";

const ORGANIZE_IDLE_MS = 5000;
const TRACK_POSITION_STORAGE_KEY = "zhihuo_track_positions_v1";
const DIRECTION_HINT_OPTIONS: Array<{ value: TrackDirectionHint; label: string }> = [
  { value: "hypothesis", label: "假设" },
  { value: "memory", label: "回忆" },
  { value: "counterpoint", label: "反驳" },
  { value: "worry", label: "担忧" },
  { value: "constraint", label: "现实限制" },
  { value: "aside", label: "旁支念头" }
];

function directionHintLabel(value: TrackDirectionHint | null) {
  return DIRECTION_HINT_OPTIONS.find((item) => item.value === value)?.label ?? null;
}

function formatRelativeNodeTime(createdAt?: string) {
  if (!createdAt) return "";
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return "";
  const deltaMs = Date.now() - time;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (deltaMinutes < 60) return `${Math.max(1, deltaMinutes)} 分钟前`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours} 小时前`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} 天前`;
}

function formatNodeClockTime(createdAt: string | undefined, timeZone: string) {
  if (!createdAt) return "";
  return formatTimeInTimeZone(createdAt, timeZone);
}

function trackCardTitle(track: ThinkingTrackView) {
  if (track.isParking) return track.nodes[0]?.questionText ?? "新方向";
  return track.titleQuestionText;
}

function trackCardPreview(track: ThinkingTrackView) {
  const content = track.nodes.slice(1, 3).map((node) => node.questionText).join(" ");
  return content.length > 92 ? `${content.slice(0, 92)}…` : content;
}

function spaceStatusLabel(status: ThinkingSpaceStatus) {
  return status === "hidden" ? "已写入时间" : "进行中";
}

export type ThinkingTrackNodeView = {
  id: string;
  questionText: string;
  noteText: string | null;
  answerText: string | null;
  createdAt?: string;
  isSuggested: boolean;
  isMilestone?: boolean;
  hasRelatedLink?: boolean;
  echoTrackId: string | null;
  echoNodeId: string | null;
};

export type ThinkingTrackView = {
  id: string;
  titleQuestionText: string;
  directionHint: TrackDirectionHint | null;
  isParking: boolean;
  isEmpty?: boolean;
  nodeCount: number;
  nodes: ThinkingTrackNodeView[];
};

export type ThinkingSpaceView = {
  spaceId: string;
  currentTrackId: string | null;
  parkingTrackId: string | null;
  pendingTrackId?: string | null;
  milestoneNodeIds: string[];
  tracks: ThinkingTrackView[];
  suggestedQuestions: string[];
  freezeNote: string | null;
  backgroundText: string | null;
  backgroundVersion: number;
};

type OrganizeCandidate = {
  nodeId: string;
  preview: string;
  fromTrackId: string;
  suggestedTrackId: string;
  score: number;
};

type OrganizeScope = "current" | "all";

type OrganizeNodeEntry = {
  nodeId: string;
  questionText: string;
  fromTrackId: string;
  fromTrackTitle: string;
  createdAt?: string;
  fallbackOrder: number;
};

type TrackPosition = {
  scrollTop: number;
  focusNodeId: string | null;
};

type AddQuestionPayload = {
  rawInput: string;
  trackId: string | null;
  fromSuggestion?: boolean;
};

export function ThinkingLayer(props: {
  store: ThinkingStore;
  setStore: Dispatch<SetStateAction<ThinkingStore>>;
  timezone: string;
  activeSpaceId: string | null;
  setActiveSpaceId: Dispatch<SetStateAction<string | null>>;
  spaceView: ThinkingSpaceView | null;
  onCreateSpace: (rawInput: string) => Promise<
    | {
        ok: true;
        converted?: boolean;
        spaceId: string;
        createdAsStatement?: boolean;
        suggestedQuestions?: string[];
        questionSuggestion?: string | null;
      }
    | { ok: false; message: string; suggestedQuestions?: string[] }
  >;
  onAddQuestion: (
    spaceId: string,
    payload: AddQuestionPayload
  ) => Promise<
    | {
        ok: true;
        converted: boolean;
        noteText: string | null;
        trackId: string;
        nodeId: string;
        suggestedQuestions?: string[];
        relatedCandidate?: { nodeId: string; preview: string; score: number } | null;
      }
    | { ok: false; message: string; suggestedQuestions?: string[] }
  >;
  onOrganizePreview: (spaceId: string) => Promise<OrganizeCandidate[]>;
  onOrganizeApply: (
    spaceId: string,
    moves: Array<{ nodeId: string; targetTrackId: string }>
  ) => Promise<{ ok: true; movedCount: number } | { ok: false; message: string }>;
  onLinkNodes: (nodeId: string, targetNodeId: string) => Promise<boolean>;
  onMoveNode: (nodeId: string, targetTrackId: string) => Promise<boolean>;
  onMarkMisplaced: (nodeId: string) => Promise<boolean>;
  onDeleteNode: (nodeId: string) => Promise<boolean>;
  onUpdateNodeQuestion: (nodeId: string, rawQuestionText: string) => Promise<boolean>;
  onCopyNode: (nodeId: string, targetTrackId?: string) => Promise<string | null>;
  onSaveNodeAnswer: (nodeId: string, answerText: string | null) => Promise<boolean>;
  onSetActiveTrack: (spaceId: string, trackId: string) => Promise<boolean>;
  onCreateTrack: (spaceId: string) => Promise<string | null>;
  onUpdateTrackDirection: (spaceId: string, trackId: string, directionHint: TrackDirectionHint | null) => Promise<boolean>;
  onSaveBackground: (spaceId: string, backgroundText: string | null) => Promise<{ ok: true; version: number } | { ok: false; message: string }>;
  onWriteSpaceToTime: (
    spaceId: string,
    freezeNote?: string,
    options?: { preserveOriginalTime?: boolean }
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onDeleteSpace: (spaceId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onRenameSpace: (spaceId: string, rootQuestionText: string) => Promise<{ ok: true; rootQuestionText: string } | { ok: false; message: string }>;
  onExportSpace: (spaceId: string) => Promise<string | null>;
  scratchItems: ThinkingScratchItem[];
  onCreateScratch: (rawText: string) => Promise<boolean>;
  onFeedScratchToTime: (scratchId: string) => Promise<boolean>;
  onDeleteScratch: (scratchId: string) => Promise<boolean>;
  onScratchToSpace: (scratchId: string) => Promise<{ ok: true; spaceId: string } | { ok: false; message: string }>;
  focusMode: boolean;
  onFocusModeChange: (enabled: boolean) => void;
  onViewModeChange?: (mode: "spaces" | "detail") => void;
  reentryTarget: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null } | null;
  onReentryHandled: () => void;
  writeEnabled?: boolean;
  showNotice: (message: string) => void;
}) {
  const [newSpaceInput, setNewSpaceInput] = useState("");
  const [scratchInput, setScratchInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [inputHint, setInputHint] = useState("");
  const [inputSuggestions, setInputSuggestions] = useState<string[]>([]);
  const [localPendingTrackId, setLocalPendingTrackId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [spaceFinderOpen, setSpaceFinderOpen] = useState(false);
  const [spaceFinderQuery, setSpaceFinderQuery] = useState("");
  const [createSpaceHint, setCreateSpaceHint] = useState("");
  const [createSpaceSuggestions, setCreateSpaceSuggestions] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [backgroundDraft, setBackgroundDraft] = useState("");
  const [backgroundHint, setBackgroundHint] = useState("");
  const [renameSpaceOpen, setRenameSpaceOpen] = useState(false);
  const [renameSpaceDraft, setRenameSpaceDraft] = useState("");
  const [renameSpaceHint, setRenameSpaceHint] = useState("");
  const [isRenamingSpace, setIsRenamingSpace] = useState(false);
  const [justAddedNodeId, setJustAddedNodeId] = useState<string | null>(null);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [isCreatingScratch, setIsCreatingScratch] = useState(false);
  const [pausedTrackIds, setPausedTrackIds] = useState<Record<string, boolean>>({});
  const [organizeScope, setOrganizeScope] = useState<OrganizeScope>("all");
  const [organizeQuery, setOrganizeQuery] = useState("");
  const [organizeSelectedNodeIds, setOrganizeSelectedNodeIds] = useState<string[]>([]);
  const [organizeTargetTrackId, setOrganizeTargetTrackId] = useState<string>("__new__");
  const [isApplyingOrganize, setIsApplyingOrganize] = useState(false);
  const [organizePanelOpen, setOrganizePanelOpen] = useState(false);
  const [focusMenuNodeId, setFocusMenuNodeId] = useState<string | null>(null);
  const [deleteSpaceOpen, setDeleteSpaceOpen] = useState(false);
  const [thinkingViewMode, setThinkingViewMode] = useState<"spaces" | "detail">("spaces");
  const [detailSpaceId, setDetailSpaceId] = useState<string | null>(null);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [answerDraftByNodeId, setAnswerDraftByNodeId] = useState<Record<string, string>>({});
  const [savingAnswerNodeId, setSavingAnswerNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingQuestionDraft, setEditingQuestionDraft] = useState("");
  const [clipboardMode, setClipboardMode] = useState<"cut" | "copy" | null>(null);
  const [clipboardNodeId, setClipboardNodeId] = useState<string | null>(null);
  const [clipboardSourceTrackId, setClipboardSourceTrackId] = useState<string | null>(null);
  const [scratchDrawerOpen, setScratchDrawerOpen] = useState(false);
  const [writeToTimeOpen, setWriteToTimeOpen] = useState(false);
  const [writeToTimeDraft, setWriteToTimeDraft] = useState("");
  const [writeToTimeHint, setWriteToTimeHint] = useState("");
  const [writeToTimePreserveOriginal, setWriteToTimePreserveOriginal] = useState(true);
  const [isWritingToTime, setIsWritingToTime] = useState(false);

  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const scratchInputRef = useRef<HTMLTextAreaElement | null>(null);
  const clearAddedTimerRef = useRef<number | null>(null);
  const trackPositionsRef = useRef<Record<string, TrackPosition>>({});
  const lastRestoredSpaceIdRef = useRef<string | null>(null);
  const lastRestoredTrackKeyRef = useRef<string | null>(null);
  const suppressTrackPersistUntilRef = useRef(0);
  const suppressQuestionFocusUntilRef = useRef(0);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const spaceFinderInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [moreMenuStyle, setMoreMenuStyle] = useState<{ top: number; left: number } | null>(null);
  const [mobileDetailViewportHeight, setMobileDetailViewportHeight] = useState<number | null>(null);
  const writeEnabled = props.writeEnabled !== false;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(TRACK_POSITION_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, TrackPosition>;
      trackPositionsRef.current = parsed;
    } catch {
      trackPositionsRef.current = {};
    }
  }, []);

  const persistTrackPositions = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TRACK_POSITION_STORAGE_KEY, JSON.stringify(trackPositionsRef.current));
  }, []);

  const rememberTrackPosition = useCallback(
    (spaceId: string, trackId: string, position: TrackPosition) => {
      trackPositionsRef.current[`${spaceId}:${trackId}`] = position;
      persistTrackPositions();
    },
    [persistTrackPositions]
  );

  const spaces = useMemo(
    () =>
      [...props.store.spaces].sort(
        (a, b) =>
          new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime()
      ),
    [props.store.spaces]
  );
  const activeSpaces = useMemo(() => spaces.filter((space) => space.status === "active"), [spaces]);
  const tabs = useMemo(() => {
    if (!props.store.fixedTopSpacesEnabled) return activeSpaces.slice(0, 3);
    const activeById = new Map(activeSpaces.map((space) => [space.id, space]));
    const pinned = props.store.fixedTopSpaceIds.map((id) => activeById.get(id)).filter((space): space is (typeof activeSpaces)[number] => Boolean(space));
    const pinnedIdSet = new Set(pinned.map((space) => space.id));
    const fillers = activeSpaces.filter((space) => !pinnedIdSet.has(space.id)).slice(0, Math.max(0, 3 - pinned.length));
    return [...pinned, ...fillers].slice(0, 3);
  }, [activeSpaces, props.store.fixedTopSpaceIds, props.store.fixedTopSpacesEnabled]);
  const overflowSpaces = useMemo(() => {
    const tabIdSet = new Set(tabs.map((space) => space.id));
    return activeSpaces.filter((space) => !tabIdSet.has(space.id));
  }, [activeSpaces, tabs]);
  const searchableSpaces = useMemo(() => activeSpaces.filter((space) => space.rootQuestionText.trim().length > 0), [activeSpaces]);
  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === props.activeSpaceId) ?? null,
    [props.activeSpaceId, spaces]
  );
  const tracks = useMemo(() => props.spaceView?.tracks ?? [], [props.spaceView]);
  const fallbackTrackId = useMemo(() => tracks[0]?.id ?? null, [tracks]);
  const activeTrackId = useMemo(() => {
    if (localPendingTrackId && tracks.some((track) => track.id === localPendingTrackId)) return localPendingTrackId;
    if (props.spaceView?.currentTrackId && tracks.some((track) => track.id === props.spaceView?.currentTrackId)) return props.spaceView.currentTrackId;
    return fallbackTrackId;
  }, [fallbackTrackId, localPendingTrackId, props.spaceView, tracks]);
  const activeTrack = useMemo(() => tracks.find((track) => track.id === activeTrackId) ?? null, [activeTrackId, tracks]);
  const activeSpaceFreezeNote = useMemo(() => {
    if (!activeSpace) return "";
    if (props.spaceView?.spaceId === activeSpace.id) {
      return (props.spaceView.freezeNote ?? "").trim();
    }
    const meta = props.store.spaceMeta.find((item) => item.spaceId === activeSpace.id);
    return (meta?.userFreezeNote ?? "").trim();
  }, [activeSpace, props.spaceView, props.store.spaceMeta]);
  const pendingTrackId = props.spaceView?.pendingTrackId ?? null;
  const otherTracks = useMemo(
    () => tracks.filter((track) => track.id !== activeTrackId && track.id !== pendingTrackId && !track.isParking).slice(0, 5),
    [activeTrackId, pendingTrackId, tracks]
  );
  const organizeAllNodes = useMemo<OrganizeNodeEntry[]>(() => {
    const flattened: OrganizeNodeEntry[] = [];
    let fallbackOrder = 0;
    for (const track of tracks) {
      const fromTrackTitle = trackCardTitle(track);
      for (const node of track.nodes) {
        flattened.push({
          nodeId: node.id,
          questionText: node.questionText,
          fromTrackId: track.id,
          fromTrackTitle,
          createdAt: node.createdAt,
          fallbackOrder
        });
        fallbackOrder += 1;
      }
    }
    return flattened.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.NaN;
      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);
      if (aValid && bValid && aTime !== bTime) return bTime - aTime;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return b.fallbackOrder - a.fallbackOrder;
    });
  }, [tracks]);
  const organizeCurrentCount = useMemo(
    () => (activeTrackId ? organizeAllNodes.filter((node) => node.fromTrackId === activeTrackId).length : 0),
    [activeTrackId, organizeAllNodes]
  );
  const organizeTargetTracks = useMemo(() => tracks.filter((track) => !track.isParking), [tracks]);
  const organizeScopeNodes = useMemo(() => {
    if (organizeScope === "current") {
      if (!activeTrackId) return [] as OrganizeNodeEntry[];
      return organizeAllNodes.filter((node) => node.fromTrackId === activeTrackId);
    }
    return organizeAllNodes;
  }, [activeTrackId, organizeAllNodes, organizeScope]);
  const normalizedOrganizeQuery = organizeQuery.trim().toLowerCase();
  const organizeVisibleNodes = useMemo(() => {
    if (!normalizedOrganizeQuery) return organizeScopeNodes;
    return organizeScopeNodes.filter((node) => {
      return (
        node.questionText.toLowerCase().includes(normalizedOrganizeQuery) ||
        node.fromTrackTitle.toLowerCase().includes(normalizedOrganizeQuery)
      );
    });
  }, [normalizedOrganizeQuery, organizeScopeNodes]);
  const organizeSelectedSet = useMemo(() => new Set(organizeSelectedNodeIds), [organizeSelectedNodeIds]);
  const organizeNodeMap = useMemo(() => new Map(organizeAllNodes.map((node) => [node.nodeId, node])), [organizeAllNodes]);
  const organizeAllVisibleSelected =
    organizeVisibleNodes.length > 0 && organizeVisibleNodes.every((node) => organizeSelectedSet.has(node.nodeId));
  const normalizedSpaceFinderQuery = spaceFinderQuery.trim().toLowerCase();
  const filteredSearchableSpaces = useMemo(() => {
    if (!normalizedSpaceFinderQuery) return searchableSpaces;
    return searchableSpaces.filter((space) => space.rootQuestionText.toLowerCase().includes(normalizedSpaceFinderQuery));
  }, [normalizedSpaceFinderQuery, searchableSpaces]);
  const detailOpen = Boolean(activeSpace && thinkingViewMode === "detail" && detailSpaceId === activeSpace.id);

  useEffect(() => {
    setLocalPendingTrackId(null);
    setQuestionInput("");
    setInputHint("");
    setInputSuggestions([]);
    setMoreOpen(false);
    setBackgroundOpen(false);
    setRenameSpaceOpen(false);
    setRenameSpaceDraft("");
    setRenameSpaceHint("");
    setIsRenamingSpace(false);
    setPausedTrackIds({});
    setBackgroundDraft(props.spaceView?.backgroundText ?? "");
    setOrganizeScope("all");
    setOrganizeQuery("");
    setOrganizeSelectedNodeIds([]);
    setOrganizeTargetTrackId("__new__");
    setIsApplyingOrganize(false);
    setOrganizePanelOpen(false);
    setFocusMenuNodeId(null);
    setDeleteSpaceOpen(false);
    setExpandedNodeId(null);
    setAnswerDraftByNodeId({});
    setSavingAnswerNodeId(null);
    setEditingNodeId(null);
    setEditingQuestionDraft("");
    setClipboardMode(null);
    setClipboardNodeId(null);
    setClipboardSourceTrackId(null);
    setScratchDrawerOpen(false);
    setWriteToTimeOpen(false);
    setWriteToTimeDraft("");
    setWriteToTimeHint("");
    setWriteToTimePreserveOriginal(true);
    setIsWritingToTime(false);
  }, [props.activeSpaceId, props.spaceView?.backgroundText]);

  useEffect(() => {
    if (!props.activeSpaceId) {
      setThinkingViewMode("spaces");
      setDetailSpaceId(null);
      return;
    }
    if (thinkingViewMode === "detail" && detailSpaceId !== props.activeSpaceId) {
      setDetailSpaceId(props.activeSpaceId);
    }
  }, [detailSpaceId, props.activeSpaceId, thinkingViewMode]);

  useEffect(() => {
    const target = props.reentryTarget;
    if (!target) return;
    const targetExists = spaces.some((space) => space.id === target.spaceId);
    if (!targetExists) {
      props.onReentryHandled();
      return;
    }
    setThinkingViewMode("detail");
    setDetailSpaceId(target.spaceId);
  }, [props, spaces]);

  useEffect(() => {
    props.onViewModeChange?.(detailOpen ? "detail" : "spaces");
  }, [detailOpen, props]);

  useEffect(() => {
    if (!spaceFinderOpen) return;
    const frame = window.requestAnimationFrame(() => spaceFinderInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [spaceFinderOpen]);

  useEffect(() => {
    return () => {
      if (clearAddedTimerRef.current) window.clearTimeout(clearAddedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!props.focusMode) {
      setFocusMenuNodeId(null);
    }
  }, [props.focusMode]);

  useEffect(() => {
    if (!clipboardNodeId) return;
    const exists = tracks.some((track) => track.nodes.some((node) => node.id === clipboardNodeId));
    if (!exists) {
      setClipboardMode(null);
      setClipboardNodeId(null);
      setClipboardSourceTrackId(null);
    }
  }, [clipboardNodeId, tracks]);

  useEffect(() => {
    if (!localPendingTrackId) return;
    if (tracks.some((track) => track.id === localPendingTrackId)) return;
    setLocalPendingTrackId(null);
  }, [localPendingTrackId, tracks]);

  useEffect(() => {
    setOrganizeSelectedNodeIds((prev) => {
      const next = prev.filter((id) => organizeNodeMap.has(id));
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [organizeNodeMap]);

  useEffect(() => {
    if (organizeTargetTrackId === "__new__") return;
    if (organizeTargetTracks.some((track) => track.id === organizeTargetTrackId)) return;
    const fallbackTarget = organizeTargetTracks[0]?.id ?? "__new__";
    setOrganizeTargetTrackId(fallbackTarget);
  }, [organizeTargetTrackId, organizeTargetTracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFocusMenuNodeId(null);
      setOrganizePanelOpen(false);
      setMoreOpen(false);
      setSpaceFinderOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const updatePosition = () => {
      const rect = moreMenuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 176;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 320);
      setMoreMenuStyle({
        top: Math.max(12, top),
        left: Math.max(12, left)
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !moreMenuRef.current?.contains(event.target) &&
        !moreMenuPanelRef.current?.contains(event.target)
      ) {
        setMoreOpen(false);
      }
    };
    const onScroll = () => setMoreOpen(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (props.activeSpaceId) return;
    lastRestoredSpaceIdRef.current = null;
    lastRestoredTrackKeyRef.current = null;
  }, [props.activeSpaceId]);

  useEffect(() => {
    if (!activeSpace || !activeTrack) return;
    const key = `${activeSpace.id}:${activeTrack.id}`;
    const saved = trackPositionsRef.current[key];
    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    const isEnteringSpace = lastRestoredSpaceIdRef.current !== activeSpace.id;
    const isSwitchingTrack = lastRestoredTrackKeyRef.current !== key;
    lastRestoredSpaceIdRef.current = activeSpace.id;
    lastRestoredTrackKeyRef.current = key;
    if (!isEnteringSpace && !isSwitchingTrack) return;
    const frame = window.requestAnimationFrame(() => {
      const container = trackScrollRef.current;
      if (!container) return;
      suppressTrackPersistUntilRef.current = Date.now() + 240;
      if (isMobileViewport && isEnteringSpace) {
        container.scrollTop = 0;
        return;
      }

      container.scrollTop = saved ? saved.scrollTop : container.scrollHeight;
      if (saved?.focusNodeId) {
        const target = document.getElementById(`thinking-node-${saved.focusNodeId}`);
        target?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSpace, activeTrack]);

  useEffect(() => {
    if (!detailOpen) {
      setMobileDetailViewportHeight(null);
      return;
    }
    if (typeof window === "undefined") return;
    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobileViewport) {
      setMobileDetailViewportHeight(null);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      setMobileDetailViewportHeight(window.innerHeight);
      return;
    }

    const updateViewport = () => {
      suppressTrackPersistUntilRef.current = Date.now() + 320;
      setMobileDetailViewportHeight(Math.round(viewport.height));
    };

    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [detailOpen]);

  const clearAddedFlagLater = useCallback(() => {
    if (clearAddedTimerRef.current) window.clearTimeout(clearAddedTimerRef.current);
    clearAddedTimerRef.current = window.setTimeout(() => {
      setJustAddedNodeId(null);
      clearAddedTimerRef.current = null;
    }, 420);
  }, []);

  const openSpaceDetail = useCallback(
    (spaceId: string) => {
      props.setActiveSpaceId(spaceId);
      setDetailSpaceId(spaceId);
      setThinkingViewMode("detail");
      setSpaceFinderOpen(false);
      setSpaceFinderQuery("");
    },
    [props]
  );

  const backToSpaces = useCallback(() => {
    setThinkingViewMode("spaces");
    setDetailSpaceId(null);
    setMoreOpen(false);
    setSpaceFinderOpen(false);
    setSpaceFinderQuery("");
    setFocusMenuNodeId(null);
  }, []);

  const centerNodeInTrack = useCallback((nodeId: string, behavior: ScrollBehavior = "auto") => {
    const container = trackScrollRef.current;
    if (!container) return false;
    const target = document.getElementById(`thinking-node-${nodeId}`);
    if (!target) return false;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + container.scrollTop;
    const visibleMidTop = container.scrollTop + container.clientHeight / 2;
    const targetMidTop = targetTop + targetRect.height / 2;
    if (targetMidTop <= visibleMidTop) return true;
    const centeredTop = targetTop - (container.clientHeight - targetRect.height) / 2;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextTop = Math.max(0, Math.min(centeredTop, maxTop));

    container.scrollTo({ top: nextTop, behavior });
    return true;
  }, []);

  useEffect(() => {
    const target = props.reentryTarget;
    if (!target || !activeSpace || activeSpace.id !== target.spaceId) return;

    const targetTrackId =
      typeof target.trackId === "string" && tracks.some((track) => track.id === target.trackId) ? target.trackId : activeTrackId;

    if (targetTrackId && activeTrackId !== targetTrackId) {
      setLocalPendingTrackId(targetTrackId);
      void props.onSetActiveTrack(activeSpace.id, targetTrackId);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const container = trackScrollRef.current;
        if (!container) {
          props.onReentryHandled();
          if (Date.now() >= suppressQuestionFocusUntilRef.current) {
            questionInputRef.current?.focus();
          }
          return;
        }

        if (target.mode === "root" || !target.nodeId) {
          container.scrollTo({ top: 0, behavior: "smooth" });
          if (Date.now() >= suppressQuestionFocusUntilRef.current) {
            questionInputRef.current?.focus();
          }
          if (targetTrackId) {
            rememberTrackPosition(activeSpace.id, targetTrackId, {
              scrollTop: 0,
              focusNodeId: null
            });
          }
        } else {
          centerNodeInTrack(target.nodeId, "smooth");
          const node = document.getElementById(`thinking-node-${target.nodeId}`);
          if (node instanceof HTMLElement) node.focus();
          if (targetTrackId) {
            rememberTrackPosition(activeSpace.id, targetTrackId, {
              scrollTop: container.scrollTop,
              focusNodeId: target.nodeId
            });
          }
        }
        props.onReentryHandled();
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSpace, activeTrackId, centerNodeInTrack, props, rememberTrackPosition, tracks]);

  const centerAddedNodeWithRetry = useCallback(
    (nodeId: string, spaceId: string, trackId: string | null) => {
      let tries = 0;
      let timerId = 0;
      let settleId = 0;
      let cancelled = false;
      const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;

      const run = () => {
        if (cancelled) return;
        if (isMobileViewport) {
          const container = trackScrollRef.current;
          const target = document.getElementById(`thinking-node-${nodeId}`);
          if (!container || !target) {
            if (tries >= 20) return;
            tries += 1;
            timerId = window.setTimeout(run, 40);
            return;
          }
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const targetTop = targetRect.top - containerRect.top + container.scrollTop;
          const targetBottom = targetTop + targetRect.height;
          const visibleTop = container.scrollTop;
          const visibleBottom = container.scrollTop + container.clientHeight;
          const edgePadding = 12;
          let nextTop = container.scrollTop;

          if (targetBottom > visibleBottom - edgePadding) {
            nextTop = targetBottom - container.clientHeight + edgePadding;
          } else if (targetTop < visibleTop + edgePadding) {
            nextTop = targetTop - edgePadding;
          }

          const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
          nextTop = Math.max(0, Math.min(nextTop, maxTop));
          suppressTrackPersistUntilRef.current = Date.now() + 320;
          if (Math.abs(nextTop - container.scrollTop) > 1) {
            container.scrollTo({ top: nextTop, behavior: tries > 0 ? "smooth" : "auto" });
          }
          settleId = window.setTimeout(() => {
            if (cancelled) return;
            const latestContainer = trackScrollRef.current;
            if (!latestContainer) return;
            const targetTrackId = trackId ?? activeTrackId;
            if (!targetTrackId) return;
            suppressTrackPersistUntilRef.current = Date.now() + 120;
            rememberTrackPosition(spaceId, targetTrackId, {
              scrollTop: latestContainer.scrollTop,
              focusNodeId: null
            });
          }, 220);
          return;
        }

        const centered = centerNodeInTrack(nodeId, tries > 0 ? "smooth" : "auto");
        if (!centered) {
          if (tries >= 20) return;
          tries += 1;
          timerId = window.setTimeout(run, 40);
          return;
        }
        settleId = window.setTimeout(() => {
          if (cancelled) return;
          const container = trackScrollRef.current;
          if (!container) return;
          const targetTrackId = trackId ?? activeTrackId;
          if (!targetTrackId) return;
          suppressTrackPersistUntilRef.current = Date.now() + 120;
          rememberTrackPosition(spaceId, targetTrackId, {
            scrollTop: container.scrollTop,
            focusNodeId: nodeId
          });
        }, 220);
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(run);
      });

      return () => {
        cancelled = true;
        if (timerId) window.clearTimeout(timerId);
        if (settleId) window.clearTimeout(settleId);
      };
    },
    [activeTrackId, centerNodeInTrack, rememberTrackPosition]
  );

  useEffect(() => {
    if (!activeSpace || !activeTrack || !justAddedNodeId) return;
    if (!activeTrack.nodes.some((node) => node.id === justAddedNodeId)) return;
    const cleanup = centerAddedNodeWithRetry(justAddedNodeId, activeSpace.id, activeTrack.id);
    return cleanup;
  }, [activeSpace, activeTrack, centerAddedNodeWithRetry, justAddedNodeId]);

  const applyOrganize = useCallback(() => {
    if (!activeSpace || isApplyingOrganize) return;
    if (!organizeSelectedNodeIds.length) {
      props.showNotice("先选择要整理的内容");
      return;
    }
    const moves = organizeSelectedNodeIds
      .map((nodeId) => organizeNodeMap.get(nodeId))
      .filter((node): node is OrganizeNodeEntry => Boolean(node))
      .filter((node) => node.fromTrackId !== organizeTargetTrackId)
      .map((node) => ({ nodeId: node.nodeId, targetTrackId: organizeTargetTrackId }));
    if (!moves.length) {
      props.showNotice("所选内容已经在目标思路线");
      return;
    }
    setIsApplyingOrganize(true);
    void (async () => {
      const result = await props.onOrganizeApply(activeSpace.id, moves);
      setIsApplyingOrganize(false);
      if (!result.ok) {
        props.showNotice(result.message);
        return;
      }
      setOrganizeSelectedNodeIds([]);
      props.showNotice(`已移动 ${result.movedCount} 条内容`);
    })();
  }, [activeSpace, isApplyingOrganize, organizeNodeMap, organizeSelectedNodeIds, organizeTargetTrackId, props]);

  const createSpace = useCallback(() => {
    if (!writeEnabled) {
      props.showNotice("当前正在同步，稍后再写");
      return;
    }
    const rawInput = newSpaceInput.trim();
    if (!rawInput) {
      setCreateSpaceHint("请先写下这段思考现在围着什么转");
      return;
    }
    if (isCreatingSpace) return;
    setIsCreatingSpace(true);
    void (async () => {
      try {
        const result = await props.onCreateSpace(rawInput);
        if (!result.ok) {
          setCreateSpaceHint(result.message);
          setCreateSpaceSuggestions(result.suggestedQuestions ?? []);
          return;
        }
        setNewSpaceInput("");
        setCreateSpaceHint("");
        setCreateSpaceSuggestions([]);
        setInputHint("");
        setInputSuggestions(result.suggestedQuestions ?? []);
        setCreateSpaceOpen(false);
        props.setActiveSpaceId(result.spaceId);
        setDetailSpaceId(result.spaceId);
        setThinkingViewMode("detail");
      setSpaceFinderOpen(false);
      setSpaceFinderQuery("");
        if (result.createdAsStatement && result.questionSuggestion) {
          props.showNotice(`也可以这样继续追问：${result.questionSuggestion}`);
        }
      } finally {
        setIsCreatingSpace(false);
      }
    })();
  }, [isCreatingSpace, newSpaceInput, props, writeEnabled]);

  const createScratch = useCallback(async () => {
    if (!writeEnabled) {
      props.showNotice("当前正在同步，稍后再写");
      return;
    }
    const rawInput = scratchInput.trim();
    if (!rawInput || isCreatingScratch) return;
    setIsCreatingScratch(true);
    try {
      const ok = await props.onCreateScratch(rawInput);
      if (!ok) {
        props.showNotice("随记保存失败，请稍后再试");
        return;
      }
      setScratchInput("");
      props.showNotice("已记下");
    } finally {
      setIsCreatingScratch(false);
    }
  }, [isCreatingScratch, props, scratchInput, writeEnabled]);

  const turnScratchIntoSpace = useCallback(
    async (scratchId: string) => {
      const result = await props.onScratchToSpace(scratchId);
      if (!result.ok) {
        props.showNotice(result.message);
        return;
      }
      props.setActiveSpaceId(result.spaceId);
      setDetailSpaceId(result.spaceId);
      setThinkingViewMode("detail");
      setSpaceFinderOpen(false);
      setSpaceFinderQuery("");
    },
    [props]
  );

  const addQuestion = useCallback(
    (rawInput: string, fromSuggestion = false, targetTrackId?: string | null) => {
      if (!writeEnabled) {
        props.showNotice("当前正在同步，稍后再写");
        return;
      }
      if (!activeSpace) return;
      if (activeSpace.status !== "active") {
        setInputHint("这个空间已写入时间");
        return;
      }
      const cleanedInput = rawInput.trim();
      if (!cleanedInput) {
        setInputHint("先写下一点现在冒出来的东西");
        return;
      }
      if (isAddingQuestion) return;
      setIsAddingQuestion(true);
      void (async () => {
        try {
          const result = await props.onAddQuestion(activeSpace.id, {
            rawInput: cleanedInput,
            trackId: targetTrackId === undefined ? activeTrackId : targetTrackId,
            fromSuggestion
          });
          if (!result.ok) {
            setInputHint(result.message);
            setInputSuggestions(result.suggestedQuestions ?? []);
            return;
          }
          setQuestionInput("");
          setInputHint("");
          setInputSuggestions(result.suggestedQuestions ?? []);
          setJustAddedNodeId(result.nodeId);
          clearAddedFlagLater();
          setFocusMenuNodeId(null);
          if (result.trackId !== activeTrackId) setLocalPendingTrackId(result.trackId);
          centerAddedNodeWithRetry(result.nodeId, activeSpace.id, result.trackId);
          window.requestAnimationFrame(() => {
            if (Date.now() >= suppressQuestionFocusUntilRef.current) {
              questionInputRef.current?.focus();
            }
          });
        } finally {
          setIsAddingQuestion(false);
        }
      })();
    },
    [activeSpace, activeTrackId, centerAddedNodeWithRetry, clearAddedFlagLater, isAddingQuestion, props, writeEnabled]
  );

  const saveBackground = useCallback(() => {
    if (!activeSpace) return;
    void (async () => {
      const result = await props.onSaveBackground(activeSpace.id, backgroundDraft.trim() ? backgroundDraft : null);
      if (!result.ok) {
        setBackgroundHint(result.message);
        return;
      }
      setBackgroundHint(`已保存 v${result.version}`);
      setTimeout(() => setBackgroundHint(""), 1200);
    })();
  }, [activeSpace, backgroundDraft, props]);

  const openOrganizePanel = useCallback(() => {
    if (!activeSpace || activeSpace.status !== "active") return;
    setMoreOpen(false);
    const defaultScope: OrganizeScope = activeTrackId ? "current" : "all";
    const defaultTargetTrackId = organizeTargetTracks[0]?.id ?? "__new__";
    setOrganizeScope(defaultScope);
    setOrganizeQuery("");
    setOrganizeSelectedNodeIds([]);
    setOrganizeTargetTrackId(defaultTargetTrackId);
    setIsApplyingOrganize(false);
    setOrganizePanelOpen(true);
  }, [activeSpace, activeTrackId, organizeTargetTracks]);

  const openWriteToTimeDialog = useCallback(() => {
    if (!activeSpace || activeSpace.status !== "active") return;
    setMoreOpen(false);
    setWriteToTimeDraft(activeSpaceFreezeNote.slice(0, 48));
    setWriteToTimeHint("");
    setWriteToTimePreserveOriginal(true);
    setWriteToTimeOpen(true);
  }, [activeSpace, activeSpaceFreezeNote]);

  const submitWriteToTime = useCallback(() => {
    if (!activeSpace || activeSpace.status !== "active" || isWritingToTime) return;
    const normalizedNote = writeToTimeDraft.trim();
    if (normalizedNote.length > 48) {
      setWriteToTimeHint("批注最多 48 字");
      return;
    }
    setIsWritingToTime(true);
    void (async () => {
      const result = await props.onWriteSpaceToTime(activeSpace.id, normalizedNote || undefined, {
        preserveOriginalTime: writeToTimePreserveOriginal
      });
      setIsWritingToTime(false);
      if (!result.ok) {
        setWriteToTimeHint(result.message);
        return;
      }
      setWriteToTimeOpen(false);
      setWriteToTimeDraft("");
      setWriteToTimeHint("");
      setMoreOpen(false);
      setThinkingViewMode("spaces");
      setDetailSpaceId(null);
      props.showNotice("已写入时间");
    })();
  }, [activeSpace, isWritingToTime, props, writeToTimeDraft, writeToTimePreserveOriginal]);

  const openExport = useCallback(() => {
    if (!activeSpace) return;
    setExportOpen(true);
    setExportLoading(true);
    void (async () => {
      const markdown = await props.onExportSpace(activeSpace.id);
      setExportMarkdown(markdown ?? "");
      setExportLoading(false);
    })();
  }, [activeSpace, props]);

  const deleteSpace = useCallback(() => {
    if (!activeSpace) return;
    void (async () => {
      const result = await props.onDeleteSpace(activeSpace.id);
      if (!result.ok) {
        props.showNotice(result.message);
        return;
      }
      setDeleteSpaceOpen(false);
      setMoreOpen(false);
      setThinkingViewMode("spaces");
      setDetailSpaceId(null);
      props.showNotice("空间已删除");
    })();
  }, [activeSpace, props]);

  const renameSpace = useCallback(() => {
    if (!activeSpace || isRenamingSpace) return;
    const nextName = renameSpaceDraft.trim();
    if (!nextName) {
      setRenameSpaceHint("空间名不能为空");
      return;
    }
    setIsRenamingSpace(true);
    setRenameSpaceHint("");
    void (async () => {
      const result = await props.onRenameSpace(activeSpace.id, nextName);
      if (!result.ok) {
        setRenameSpaceHint(result.message);
        setIsRenamingSpace(false);
        return;
      }
      setRenameSpaceOpen(false);
      setMoreOpen(false);
      setIsRenamingSpace(false);
      props.showNotice("空间名已更新");
    })();
  }, [activeSpace, isRenamingSpace, props, renameSpaceDraft]);

  const copyExportMarkdown = useCallback(() => {
    if (exportLoading) return;
    const text = exportMarkdown.trim();
    if (!text) {
      props.showNotice("暂无可复制的导出内容");
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(exportMarkdown);
        props.showNotice("已复制导出内容");
      } catch {
        props.showNotice("复制失败，请稍后再试");
      }
    })();
  }, [exportLoading, exportMarkdown, props]);

  const switchTrack = useCallback(
    (trackId: string) => {
      if (!activeSpace || !activeTrack) return;
      if (!tracks.some((track) => track.id === trackId)) {
        setLocalPendingTrackId(null);
        return;
      }
      if (trackId === activeTrack.id) return;
      const container = trackScrollRef.current;
      if (container) {
        const activeElementId = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
        const focusedNodeId = activeElementId.startsWith("thinking-node-")
          ? activeElementId.replace("thinking-node-", "")
          : trackPositionsRef.current[`${activeSpace.id}:${activeTrack.id}`]?.focusNodeId ?? null;
        rememberTrackPosition(activeSpace.id, activeTrack.id, {
          scrollTop: container.scrollTop,
          focusNodeId: focusedNodeId
        });
      }
      setFocusMenuNodeId(null);
      setLocalPendingTrackId(trackId);
      void (async () => {
        const ok = await props.onSetActiveTrack(activeSpace.id, trackId);
        if (!ok) setLocalPendingTrackId(null);
      })();
    },
    [activeSpace, activeTrack, props, rememberTrackPosition, tracks]
  );

  const persistNodeAnswer = useCallback(
    async (node: ThinkingTrackNodeView, nextValue: string, collapseAfterSave = false) => {
      if (savingAnswerNodeId === node.id) return;
      const normalized = nextValue.trim();
      const persisted = (node.answerText ?? "").trim();
      if (normalized === persisted) {
        if (collapseAfterSave) setExpandedNodeId((current) => (current === node.id ? null : current));
        return;
      }

      setSavingAnswerNodeId(node.id);
      const ok = await props.onSaveNodeAnswer(node.id, normalized || null);
      setSavingAnswerNodeId((current) => (current === node.id ? null : current));
      if (!ok) {
        setAnswerDraftByNodeId((prev) => ({ ...prev, [node.id]: node.answerText ?? "" }));
        props.showNotice("保存失败，请稍后再试");
        return;
      }
      setAnswerDraftByNodeId((prev) => ({ ...prev, [node.id]: normalized }));
      if (collapseAfterSave) setExpandedNodeId((current) => (current === node.id ? null : current));
    },
    [props, savingAnswerNodeId]
  );

  const saveNodeQuestion = useCallback(
    async (node: ThinkingTrackNodeView, nextValue: string, collapse = true) => {
      const normalized = nextValue.trim();
      if (!normalized) {
        setEditingQuestionDraft(node.questionText);
        if (collapse) setEditingNodeId(null);
        return;
      }
      if (normalized === node.questionText.trim()) {
        if (collapse) setEditingNodeId(null);
        return;
      }
      const ok = await props.onUpdateNodeQuestion(node.id, normalized);
      if (!ok) {
        props.showNotice("修改失败，请稍后再试");
        setEditingQuestionDraft(node.questionText);
        if (collapse) setEditingNodeId(null);
        return;
      }
      if (collapse) setEditingNodeId(null);
    },
    [props]
  );

  const startEditingNode = useCallback((node: ThinkingTrackNodeView) => {
    suppressQuestionFocusUntilRef.current = Date.now() + 600;
    setFocusMenuNodeId(null);
    setExpandedNodeId((current) => (current === node.id ? null : current));
    setEditingNodeId(node.id);
    setEditingQuestionDraft(node.questionText);
  }, []);

  const cutNode = useCallback((nodeId: string, trackId: string) => {
    setClipboardMode("cut");
    setClipboardNodeId(nodeId);
    setClipboardSourceTrackId(trackId);
    setFocusMenuNodeId(null);
  }, []);

  const copyNodeToClipboard = useCallback((nodeId: string, trackId: string) => {
    setClipboardMode("copy");
    setClipboardNodeId(nodeId);
    setClipboardSourceTrackId(trackId);
    setFocusMenuNodeId(null);
  }, []);

  const pasteClipboardNode = useCallback(async () => {
    if (!clipboardNodeId || !activeTrack || !clipboardMode) return;
    if (clipboardMode === "cut") {
      const ok = await props.onMoveNode(clipboardNodeId, activeTrack.id);
      if (!ok) {
        props.showNotice("粘贴失败，请稍后再试");
        return;
      }
    } else {
      const copiedNodeId = await props.onCopyNode(clipboardNodeId, activeTrack.id);
      if (!copiedNodeId) {
        props.showNotice("粘贴失败，请稍后再试");
        return;
      }
    }
    setClipboardMode(null);
    setClipboardNodeId(null);
    setClipboardSourceTrackId(null);
  }, [activeTrack, clipboardMode, clipboardNodeId, props]);

  const createNewDirection = useCallback(() => {
    if (!activeSpace) return;
    if (activeSpace.status !== "active") {
      setInputHint("这个空间已写入时间");
      return;
    }
    const normalizedInput = questionInput.trim();
    if (normalizedInput) {
      addQuestion(normalizedInput, false, "__new__");
      return;
    }
    void (async () => {
      const trackId = await props.onCreateTrack(activeSpace.id);
      if (!trackId) {
        props.showNotice("新方向创建失败，请稍后再试");
        return;
      }
      setLocalPendingTrackId(trackId);
      questionInputRef.current?.focus();
    })();
  }, [activeSpace, addQuestion, props, questionInput]);

  const toggleNodeAnswer = useCallback((node: ThinkingTrackNodeView) => {
    if (editingNodeId === node.id) return;
    setFocusMenuNodeId(null);
    setExpandedNodeId((current) => {
      if (current === node.id) return null;
      setAnswerDraftByNodeId((prev) => ({ ...prev, [node.id]: prev[node.id] ?? node.answerText ?? "" }));
      return node.id;
    });
  }, [editingNodeId]);

  const currentTrackHeading = activeTrack ? trackCardTitle(activeTrack) : "";
  const composerCanSubmit = questionInput.trim().length > 0;
  const latestScratch = props.scratchItems[0] ?? null;
  const canPasteClipboardNode =
    Boolean(
      activeSpace &&
        activeTrack &&
        clipboardMode &&
        clipboardNodeId &&
        clipboardSourceTrackId &&
        activeSpace.status === "active" &&
        (clipboardMode === "cut" || activeTrack.id !== clipboardSourceTrackId)
    );
  const showNewDirectionCard =
    (activeTrack?.nodes.length ?? 0) > 0 &&
    activeSpace?.status === "active" &&
    !(pendingTrackId && activeTrackId === pendingTrackId);
  const mobileSpacesCardHeightClass = !detailOpen ? "h-[72dvh] md:h-full" : "h-full";
  const detailViewportStyle =
    detailOpen && mobileDetailViewportHeight ? { height: `${mobileDetailViewportHeight}px` } : undefined;

  return (
    <div className={cn("h-full overflow-hidden", detailOpen ? "px-0 pb-0 pt-0" : "px-3 pb-4 pt-3 md:px-6")}>
      <div
        style={detailViewportStyle}
        className={cn(
          "mx-auto flex w-full flex-col overflow-hidden bg-[#f7f4ef]/95",
          mobileSpacesCardHeightClass,
          detailOpen
            ? "max-w-none border-0 shadow-none"
            : "max-w-6xl rounded-[24px] border border-black/10 shadow-[0_14px_36px_rgba(43,38,33,0.10)]"
        )}
      >
        <header
          className={cn(
            detailOpen
              ? "border-b border-black/[0.05] bg-[#f5f2ee]/88 px-4 backdrop-blur-sm md:px-8"
              : "border-b border-black/10 px-3 py-3 md:px-5"
          )}
        >
          {detailOpen && activeSpace ? (
            <div
              data-thinking-detail-header="true"
              className="ml-auto mr-0 flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 md:mr-6 lg:mr-10 xl:mr-14"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="返回空间列表"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white/65 hover:text-slate-700"
                  onClick={backToSpaces}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    ←
                  </span>
                </button>
                <h2 className="line-clamp-1 text-[14px] font-medium text-slate-800 md:text-[15px]">{activeSpace.rootQuestionText}</h2>
              </div>
              <div className="relative shrink-0" ref={moreMenuRef}>
                <button
                  type="button"
                  aria-label="更多"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white/65 hover:text-slate-700"
                  onClick={() => setMoreOpen((prev) => !prev)}
                >
                  <span aria-hidden="true" className="text-xl leading-none">
                    ⋯
                  </span>
                </button>
                {moreOpen && typeof document !== "undefined" ? createPortal(
                  <div
                    ref={moreMenuPanelRef}
                    style={moreMenuStyle ?? undefined}
                    className="fixed z-[90] w-44 rounded-xl border border-black/10 bg-white/98 p-1.5 shadow-[0_14px_30px_rgba(16,20,24,0.16)] backdrop-blur-sm"
                  >
                    <MenuItem label="写入时间" disabled={!writeEnabled || !activeSpace || activeSpace.status !== "active"} onClick={openWriteToTimeDialog} />
                    <MenuItem label="导出" disabled={!activeSpace} onClick={() => (setMoreOpen(false), openExport())} />
                    <MenuItem label="整理一下" disabled={!writeEnabled || !activeSpace || activeSpace.status !== "active"} onClick={openOrganizePanel} />
                    <MenuItem
                      label="重命名空间"
                      disabled={!writeEnabled || !activeSpace}
                      onClick={() => {
                        if (!activeSpace) return;
                        setRenameSpaceDraft(activeSpace.rootQuestionText);
                        setRenameSpaceHint("");
                        setMoreOpen(false);
                        setRenameSpaceOpen(true);
                      }}
                    />
                    <MenuItem
                      label="背景说明"
                      disabled={!writeEnabled || !activeSpace || activeSpace.status !== "active"}
                      onClick={() => {
                        setMoreOpen(false);
                        setBackgroundOpen(true);
                      }}
                    />
                    <MenuItem
                      label="删除空间"
                      disabled={!writeEnabled || !activeSpace}
                      onClick={() => {
                        setMoreOpen(false);
                        setDeleteSpaceOpen(true);
                      }}
                    />
                  </div>,
                  document.body
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="flex w-max min-w-full items-center gap-2 pr-3">
                  {tabs.length ? (
                    tabs.map((space) => (
                      <button
                        key={space.id}
                        type="button"
                        onClick={() => openSpaceDetail(space.id)}
                        className={cn(
                          "max-w-[240px] rounded-full border px-3 py-1.5 text-left text-xs leading-[1.35] transition-colors",
                          props.activeSpaceId === space.id
                            ? "border-black/18 bg-white text-slate-900"
                            : "border-black/8 bg-white/52 text-slate-600 hover:bg-white/82"
                        )}
                      >
                        <span className="line-clamp-1">{space.rootQuestionText}</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">先创建一个思考空间</span>
                  )}
                  {overflowSpaces.length ? (
                    <button
                      type="button"
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        spaceFinderOpen
                          ? "border-black/18 bg-white text-slate-900"
                          : "border-black/10 bg-white/58 text-slate-600 hover:bg-white"
                      )}
                      onClick={() => {
                        setSpaceFinderOpen(true);
                        setSpaceFinderQuery("");
                      }}
                    >
                      更多空间
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white/68 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-white"
                    onClick={() => {
                      setCreateSpaceHint("");
                      setCreateSpaceSuggestions([]);
                      setCreateSpaceOpen(true);
                    }}
                  >
                    + 新空间
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>
        {spaceFinderOpen && !detailOpen && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-[80]">
                <button
                  type="button"
                  aria-label="关闭查找空间"
                  className="absolute inset-0 bg-[rgba(27,24,21,0.14)] backdrop-blur-[2px]"
                  onClick={() => {
                    setSpaceFinderOpen(false);
                    setSpaceFinderQuery("");
                  }}
                />
                <div className="absolute left-1/2 top-[92px] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-[24px] border border-black/10 bg-[#fbf8f3]/98 p-3 shadow-[0_20px_44px_rgba(43,38,33,0.14)] backdrop-blur-sm">
                  <div className="rounded-[18px] border border-black/[0.07] bg-white/78 px-4 py-3">
                    <input
                      ref={spaceFinderInputRef}
                      value={spaceFinderQuery}
                      onChange={(event) => setSpaceFinderQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSpaceFinderOpen(false);
                          setSpaceFinderQuery("");
                        }
                      }}
                      placeholder="??????"
                      className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
                    {filteredSearchableSpaces.length ? (
                      <div className="space-y-1.5">
                        {filteredSearchableSpaces.map((space) => (
                          <button
                            key={space.id}
                            type="button"
                            className="w-full rounded-[18px] border border-transparent px-3 py-3 text-left transition-colors hover:border-black/[0.05] hover:bg-white/72"
                            onClick={() => openSpaceDetail(space.id)}
                          >
                            <p className="line-clamp-1 text-sm text-slate-800">{space.rootQuestionText}</p>
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                              <span>{spaceStatusLabel(space.status)}</span>
                              <span>{formatRelativeNodeTime(space.lastActivityAt ?? space.createdAt)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid h-28 place-items-center text-sm text-slate-500">?????????</div>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {detailOpen && activeSpace ? (
          <div data-thinking-detail="true" className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <section className="min-h-0 overflow-hidden px-4 py-5 md:px-8 md:pb-5 md:pt-8">
              <div
                className={cn(
                  "ml-auto mr-0 grid h-full max-w-[1180px] min-h-0 gap-6 md:mr-6 md:gap-11 lg:mr-10 xl:mr-14",
                  props.focusMode ? "md:grid-cols-[minmax(0,760px)]" : "md:grid-cols-[minmax(0,760px)_minmax(0,1fr)]"
                )}
              >
                <div className="min-h-0 min-w-0">
                  <div
                    data-track-panel="true"
                    className={cn("flex h-full min-h-0 min-w-0 flex-col", activeTrack && pausedTrackIds[activeTrack.id] ? "opacity-45" : "opacity-100")}
                  >
                    {activeTrack ? (
                      <div className="w-full max-w-[760px]">
                        <div className="flex items-center gap-4">
                          <span className="h-px flex-1 bg-black/[0.04]" />
                          <p className="shrink-0 text-[11px] text-slate-400/90">{currentTrackHeading}</p>
                          <span className="h-px flex-1 bg-black/[0.04]" />
                        </div>
                      </div>
                    ) : null}

                    {!activeTrack ? (
                      <div className="mt-8 grid min-h-0 flex-1 place-items-center rounded-[24px] border border-black/[0.05] bg-white/26 p-8 text-sm text-slate-500">
                        继续输入疑问，主线会在这里展开
                      </div>
                    ) : (
                      <div
                        ref={trackScrollRef}
                        data-track-scroll="true"
                        className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-3 overscroll-contain"
                        onScroll={(event) => {
                          if (!activeSpace || !activeTrack) return;
                          if (Date.now() < suppressTrackPersistUntilRef.current) return;
                          const container = event.currentTarget;
                          const prev = trackPositionsRef.current[`${activeSpace.id}:${activeTrack.id}`];
                          rememberTrackPosition(activeSpace.id, activeTrack.id, {
                            scrollTop: container.scrollTop,
                            focusNodeId: prev?.focusNodeId ?? null
                          });
                        }}
                      >
                        <ul className="w-full max-w-[760px] min-w-0 space-y-6 pb-32 pt-2">
                          {activeTrack.nodes.map((node) => {
                            const isExpanded = expandedNodeId === node.id;
                            const draftValue = answerDraftByNodeId[node.id] ?? node.answerText ?? "";
                            const isEditing = editingNodeId === node.id;
                            const isCut = clipboardMode === "cut" && clipboardNodeId === node.id;
                            return (
                              <li
                                key={node.id}
                                id={`thinking-node-${node.id}`}
                                data-track-node="true"
                                tabIndex={-1}
                                className={cn(
                                  "group relative min-w-0 rounded-[22px] bg-[rgba(255,255,255,0.18)] px-6 py-5 outline-none transition-[background-color,opacity,transform] duration-300",
                                  "hover:bg-[rgba(255,255,255,0.28)]",
                                  isExpanded ? "bg-[rgba(255,255,255,0.26)]" : "",
                                  isCut ? "border border-dashed border-black/[0.12] bg-[rgba(255,255,255,0.12)] opacity-75" : "",
                                  justAddedNodeId === node.id ? "bg-[rgba(255,255,255,0.42)] shadow-[0_8px_18px_rgba(43,38,33,0.04)]" : ""
                                )}
                                style={justAddedNodeId === node.id ? { animation: "zhTrackNodeIn 360ms ease-out 1" } : undefined}
                                onDoubleClick={() => {
                                  if (activeSpace.status !== "active") return;
                                  startEditingNode(node);
                                }}
                                onFocus={() => {
                                  if (!activeSpace || !activeTrack) return;
                                  if (isEditing) return;
                                  if (Date.now() < suppressQuestionFocusUntilRef.current) return;
                                  const container = trackScrollRef.current;
                                  rememberTrackPosition(activeSpace.id, activeTrack.id, {
                                    scrollTop: container?.scrollTop ?? 0,
                                    focusNodeId: node.id
                                  });
                                }}
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="block w-full cursor-pointer text-left"
                                  onClick={() => {
                                    if (isEditing) return;
                                    toggleNodeAnswer(node);
                                  }}
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (activeSpace.status !== "active") return;
                                    startEditingNode(node);
                                  }}
                                  onKeyDown={(event) => {
                                    if (isEditing) return;
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      toggleNodeAnswer(node);
                                    }
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-300/90" />
                                      <span>{formatRelativeNodeTime(node.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {node.isMilestone ? <span className="text-[13px] text-[#a96f55]">★</span> : null}
                                      {!props.focusMode || focusMenuNodeId === node.id ? (
                                        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                                          <button
                                            type="button"
                                            aria-label="剪切节点"
                                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 text-[11px] text-slate-400 hover:text-slate-700"
                                            disabled={activeSpace.status !== "active"}
                                            onClick={() => cutNode(node.id, activeTrack.id)}
                                          >
                                            ✂
                                          </button>
                                          <NodeMenu
                                            disabled={activeSpace.status !== "active"}
                                            triggerClassName="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                                            onEdit={() => startEditingNode(node)}
                                            onCopy={() => copyNodeToClipboard(node.id, activeTrack.id)}
                                            onDelete={() =>
                                              void (async () => {
                                                const ok = await props.onDeleteNode(node.id);
                                                if (!ok) props.showNotice("删除失败，请稍后再试");
                                              })()
                                            }
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-4 max-w-[88%]">
                                    {isEditing ? (
                                      <Textarea
                                        autoFocus
                                        value={editingQuestionDraft}
                                        maxLength={220}
                                        autoResize
                                        maxAutoHeight={180}
                                        data-zh-input="multiline"
                                        rows={1}
                                        className="min-h-[1.8rem] w-full border-0 bg-transparent px-0 py-0 text-left text-[15px] leading-[1.82] text-slate-900 outline-none shadow-none ring-0 [overflow-wrap:anywhere] focus-visible:ring-0"
                                        onClick={(event) => event.stopPropagation()}
                                        onFocus={() => {
                                          suppressQuestionFocusUntilRef.current = Date.now() + 600;
                                        }}
                                        onChange={(event) => setEditingQuestionDraft(event.target.value)}
                                        onBlur={() => void saveNodeQuestion(node, editingQuestionDraft)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            void saveNodeQuestion(node, editingQuestionDraft);
                                          }
                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            setEditingQuestionDraft(node.questionText);
                                            setEditingNodeId(null);
                                          }
                                        }}
                                      />
                                    ) : (
                                      <p className="text-left text-[15px] leading-[1.82] text-slate-900 [overflow-wrap:anywhere]">{node.questionText}</p>
                                    )}
                                    {node.noteText ? (
                                      <p className="mt-3 text-left text-xs leading-[1.75] text-slate-500/90 [overflow-wrap:anywhere]">附注：{node.noteText}</p>
                                    ) : null}
                                  </div>
                                  <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400/90">
                                    <span>{node.hasRelatedLink ? "有关联" : ""}</span>
                                    {node.echoTrackId ? (
                                      <button
                                        type="button"
                                        className="text-[11px] text-slate-500/90 transition-colors hover:text-slate-700"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          switchTrack(node.echoTrackId as string);
                                        }}
                                      >
                                        在其他思路也出现过
                                      </button>
                                    ) : (
                                      <span>{formatNodeClockTime(node.createdAt, props.timezone)}</span>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className={cn(
                                    "overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out",
                                    isExpanded ? "mt-4 max-h-44 opacity-100" : "max-h-0 opacity-0"
                                  )}
                                >
                                  <div
                                    className="rounded-[18px] border border-black/[0.04] bg-[rgba(255,255,255,0.14)] px-4 py-2.5"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <Textarea
                                      data-node-answer-input="true"
                                      value={draftValue}
                                      autoResize
                                      maxAutoHeight={120}
                                      data-zh-input="multiline"
                                      rows={1}
                                      disabled={activeSpace.status !== "active" || savingAnswerNodeId === node.id}
                                      className="min-h-[1.9rem] w-full border-0 bg-transparent px-0 py-0 text-[14px] leading-[1.7] text-slate-700 outline-none shadow-none ring-0 placeholder:text-slate-400/65 disabled:text-slate-400 focus-visible:ring-0"
                                      onChange={(event) =>
                                        setAnswerDraftByNodeId((prev) => ({
                                          ...prev,
                                          [node.id]: event.target.value
                                        }))
                                      }
                                      onBlur={() => void persistNodeAnswer(node, draftValue)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                          event.preventDefault();
                                          void persistNodeAnswer(node, draftValue);
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          setAnswerDraftByNodeId((prev) => ({
                                            ...prev,
                                            [node.id]: node.answerText ?? ""
                                          }));
                                          setExpandedNodeId((current) => (current === node.id ? null : current));
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {!props.focusMode ? (
                  <aside data-other-tracks="true" className="min-h-0 w-[220px] justify-self-end border-l border-black/[0.04] pl-5 md:pt-1">
                    <div className="flex h-full min-h-0 flex-col">
                      <p className="mb-4 text-[12px] tracking-[0.04em] text-slate-400">其他思路</p>
                      <div className="grid max-h-full gap-4 overflow-y-auto pr-1">
                        {otherTracks.map((track) => (
                            <button
                              key={track.id}
                              type="button"
                              data-other-track-button="true"
                              onClick={() => switchTrack(track.id)}
                              className={cn(
                                "rounded-[18px] border border-black/[0.04] bg-[rgba(255,255,255,0.24)] px-5 py-5 text-left transition-colors hover:bg-[rgba(255,255,255,0.38)]",
                                pausedTrackIds[track.id] ? "opacity-35" : "opacity-[0.78] hover:opacity-[0.94]"
                              )}
                            >
                              <p className="line-clamp-1 text-[14px] font-medium text-slate-700">{trackCardTitle(track)}</p>
                              <p className="mt-2.5 line-clamp-2 text-[12px] leading-[1.7] text-slate-500/92">{trackCardPreview(track)}</p>
                              <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-400/90">
                                <span>{track.nodeCount} 条想法</span>
                                <span>{formatRelativeNodeTime(track.nodes[track.nodes.length - 1]?.createdAt)}</span>
                              </div>
                            </button>
                          ))}
                        {showNewDirectionCard ? (
                          <button
                            type="button"
                            data-new-track-button="true"
                            onClick={createNewDirection}
                            className="rounded-[18px] border border-black/[0.04] bg-[rgba(255,255,255,0.18)] px-5 py-5 text-left text-[14px] text-slate-500/90 transition-colors hover:bg-[rgba(255,255,255,0.3)] hover:text-slate-700"
                          >
                            新方向
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </aside>
                ) : null}
              </div>
            </section>

            <footer
              data-composer="true"
              className="border-t border-black/[0.05] bg-[#f5f2ee]/78 px-4 pb-[14px] pt-3 backdrop-blur-[2px] md:px-8 md:pb-5 md:pt-3"
            >
              <div className="ml-auto mr-0 max-w-[1180px] md:mr-6 lg:mr-10 xl:mr-14">
                <div className="w-full max-w-[760px] rounded-[20px] border border-black/[0.05] bg-[rgba(255,255,255,0.36)] px-4 py-2.5">
                  <div className="flex items-end gap-3">
                    {canPasteClipboardNode ? (
                      <button
                        type="button"
                        className="rounded-full border border-black/[0.06] bg-white/62 px-3 py-1.5 text-[11px] text-slate-600 transition-colors hover:bg-white/78 hover:text-slate-800"
                        onClick={() => void pasteClipboardNode()}
                      >
                        粘贴
                      </button>
                    ) : null}
                    <Textarea
                      ref={questionInputRef}
                      value={questionInput}
                      maxLength={220}
                      autoResize
                      maxAutoHeight={180}
                      data-zh-input="multiline"
                      rows={1}
                      disabled={!writeEnabled || activeSpace.status !== "active"}
                      placeholder={activeSpace.status === "active" ? "继续这条思路…" : "这个空间已写入时间"}
                      className="min-h-[2.45rem] max-h-[180px] flex-1 border-0 bg-transparent px-0 py-2 text-sm leading-[1.75] text-slate-800 outline-none shadow-none ring-0 placeholder:text-slate-400/80 disabled:text-slate-500 focus-visible:ring-0"
                      onChange={(event) => setQuestionInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey) return;
                        event.preventDefault();
                        if (!composerCanSubmit) {
                          setInputHint("先写下一点现在冒出来的东西");
                          return;
                        }
                        addQuestion(questionInput, false);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="继续"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/[0.06] bg-white/58 text-slate-500 transition-colors hover:bg-white/72 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!writeEnabled || activeSpace.status !== "active" || isAddingQuestion || !composerCanSubmit}
                      onClick={() => addQuestion(questionInput, false)}
                    >
                      <span aria-hidden="true" className="text-base leading-none">↗</span>
                    </button>
                  </div>

                  <p className={cn("mt-2 min-h-[1.1em] text-[11px] text-slate-500/85", inputHint ? "opacity-100" : "opacity-0")}>{inputHint}</p>
                  {inputSuggestions.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {inputSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="rounded-full border border-black/[0.06] bg-white/62 px-3 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white/78"
                          disabled={!writeEnabled}
                          onClick={() => addQuestion(suggestion, true)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </footer>
          </div>
        ) : (
          <div data-thinking-spaces="true" className="flex flex-1 justify-center overflow-y-auto px-6 py-10 md:py-12">
            <div className="w-full max-w-[920px] min-h-full pt-[min(8.4vh,70px)] md:pt-[min(10.4vh,90px)]">
              <div className="rounded-[28px] border border-black/[0.06] bg-[rgba(255,255,255,0.28)] px-6 py-5 shadow-[0_12px_30px_rgba(43,38,33,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] text-slate-800">随记</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {props.scratchItems.length ? (
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 transition-colors hover:text-slate-700"
                        onClick={() => setScratchDrawerOpen(true)}
                      >
                        查看全部
                      </button>
                    ) : null}
                    <span className="text-[11px] text-slate-400">{props.scratchItems.length} 条</span>
                  </div>
                </div>
                <div className="mt-4 flex items-end gap-3 rounded-[22px] border border-black/[0.05] bg-white/40 px-4 py-3">
                  <Textarea
                    ref={scratchInputRef}
                    value={scratchInput}
                    maxLength={220}
                    autoResize
                    maxAutoHeight={160}
                    data-zh-input="multiline"
                    rows={1}
                    disabled={!writeEnabled}
                    className="min-h-[2.45rem] max-h-[160px] flex-1 border-0 bg-transparent px-0 py-2 text-sm leading-[1.75] text-slate-800 outline-none shadow-none ring-0 placeholder:text-slate-400/85 focus-visible:ring-0"
                    placeholder="随手记下一句…"
                    onChange={(event) => setScratchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      void createScratch();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="保存随记"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/[0.06] bg-white/70 text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!writeEnabled || !scratchInput.trim() || isCreatingScratch}
                    onClick={() => void createScratch()}
                  >
                    <span aria-hidden="true" className="text-base leading-none">↗</span>
                  </button>
                </div>

                {latestScratch ? (
                  <button
                    type="button"
                    className="mt-5 block w-full rounded-[22px] border border-black/[0.05] bg-white/22 px-5 py-4 text-left transition-colors hover:bg-white/34"
                    onClick={() => setScratchDrawerOpen(true)}
                  >
                    <p className="text-[15px] leading-[1.75] text-slate-800 [overflow-wrap:anywhere]">{latestScratch.rawText}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{formatRelativeNodeTime(latestScratch.updatedAt)}</span>
                      {latestScratch.derivedSpaceId ? <span>已进入思路</span> : null}
                    </div>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {writeToTimeOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">写入时间</p>
            <p className="mt-1 text-xs text-slate-500">留一句批注，之后会在时间层右栏出现。（可选）</p>
            <Textarea
              value={writeToTimeDraft}
              maxLength={48}
              autoResize
              maxAutoHeight={120}
              data-zh-input="multiline"
              rows={1}
              className="mt-3 min-h-[2.75rem] max-h-[120px] w-full rounded-xl border border-black/12 bg-white px-3 py-2 text-sm leading-[1.65] text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              placeholder=""
              onChange={(event) => {
                setWriteToTimeDraft(event.target.value);
                if (writeToTimeHint) setWriteToTimeHint("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitWriteToTime();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>留空将保留原批注</span>
              <span>{writeToTimeDraft.trim().length}/48</span>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-black/20 accent-slate-900"
                checked={writeToTimePreserveOriginal}
                onChange={(event) => setWriteToTimePreserveOriginal(event.target.checked)}
              />
              <span>按原时间写入</span>
            </label>
            <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-500", writeToTimeHint ? "opacity-100" : "opacity-0")}>{writeToTimeHint}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-black/12 text-slate-700"
                onClick={() => {
                  if (isWritingToTime) return;
                  setWriteToTimeOpen(false);
                  setWriteToTimeDraft("");
                  setWriteToTimeHint("");
                  setWriteToTimePreserveOriginal(true);
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800"
                onClick={submitWriteToTime}
                disabled={isWritingToTime}
              >
                {isWritingToTime ? "写入中..." : "写入时间"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createSpaceOpen ? (
        <div className="absolute inset-0 z-40 bg-black/15 backdrop-blur-[1px]">
          <div className="absolute right-4 top-16 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-4 shadow-[0_20px_48px_rgba(15,23,42,0.22)] md:right-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-800">从任意念头开始</p>
                <p className="mt-1 text-xs text-slate-500">它会成为这段思考的中心</p>
              </div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setCreateSpaceOpen(false)}>
                关闭
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <Textarea
                value={newSpaceInput}
                maxLength={160}
                autoResize
                maxAutoHeight={120}
                data-zh-input="multiline"
                rows={1}
                disabled={!writeEnabled}
                className="min-h-[2.55rem] max-h-[120px] rounded-2xl border border-black/12 bg-white px-4 py-2 text-sm leading-[1.65] text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                onChange={(event) => setNewSpaceInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    createSpace();
                  }
                }}
              />
              <Button
                type="button"
                disabled={!writeEnabled || isCreatingSpace}
                className="h-10 rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={createSpace}
              >
                {isCreatingSpace ? "创建中..." : "创建"}
              </Button>
              <p className={cn("min-h-[1.2em] text-xs text-slate-500", createSpaceHint ? "opacity-100" : "opacity-0")}>{createSpaceHint}</p>
              {createSpaceSuggestions.length ? (
                <div className="flex flex-wrap gap-2">
                  {createSpaceSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-black/10 bg-white/85 px-3 py-1 text-xs text-slate-700 transition-colors hover:bg-white"
                      disabled={!writeEnabled}
                      onClick={() => {
                        setNewSpaceInput(suggestion);
                        void (async () => {
                          const result = await props.onCreateSpace(suggestion);
                          if (!result.ok) {
                            setCreateSpaceHint(result.message);
                            setCreateSpaceSuggestions(result.suggestedQuestions ?? []);
                            return;
                          }
                          setNewSpaceInput("");
                          setCreateSpaceHint("");
                          setCreateSpaceSuggestions([]);
                          setInputHint("");
                          setInputSuggestions(result.suggestedQuestions ?? []);
                          setCreateSpaceOpen(false);
                          props.setActiveSpaceId(result.spaceId);
                          setDetailSpaceId(result.spaceId);
                          setThinkingViewMode("detail");
      setSpaceFinderOpen(false);
      setSpaceFinderQuery("");
                          if (result.createdAsStatement && result.questionSuggestion) {
                            props.showNotice(`也可以这样继续追问：${result.questionSuggestion}`);
                          }
                        })();
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {scratchDrawerOpen ? (
        <div className="absolute inset-0 z-40 bg-black/15 backdrop-blur-[1px]">
          <button
            type="button"
            aria-label="关闭随记列表"
            className="absolute inset-0"
            onClick={() => setScratchDrawerOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-black/[0.08] bg-[#faf7f2] px-6 pb-6 pt-5 shadow-[0_-18px_40px_rgba(43,38,33,0.12)]">
            <div className="mx-auto w-full max-w-[920px]">
              <div className="mx-auto h-1.5 w-14 rounded-full bg-black/[0.08]" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[15px] text-slate-800">随记</p>
                <span className="text-[11px] text-slate-400">{props.scratchItems.length} 条</span>
              </div>
              <div className="mt-4 max-h-[62vh] overflow-y-auto pr-1">
                <div className="space-y-3 pb-1">
                  {props.scratchItems.map((item) => {
                    const linkedSpace = item.derivedSpaceId ? spaces.find((space) => space.id === item.derivedSpaceId) ?? null : null;
                    return (
                      <div
                        key={item.id}
                        className="rounded-[20px] border border-black/[0.05] bg-white/34 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] leading-[1.7] text-slate-800 [overflow-wrap:anywhere]">{item.rawText}</p>
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                              <span>{formatRelativeNodeTime(item.updatedAt)}</span>
                              {linkedSpace ? <span>已进入思路</span> : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {linkedSpace ? (
                              <button
                                type="button"
                                className="rounded-full border border-black/[0.06] bg-white/72 px-3 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white hover:text-slate-800"
                                onClick={() => {
                                  setScratchDrawerOpen(false);
                                  openSpaceDetail(linkedSpace.id);
                                }}
                              >
                                进入
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="rounded-full border border-black/[0.06] bg-white/72 px-3 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white hover:text-slate-800"
                                onClick={() => void turnScratchIntoSpace(item.id)}
                              >
                                转为空间
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-700"
                              onClick={() =>
                                void (async () => {
                                  const ok = await props.onFeedScratchToTime(item.id);
                                  if (!ok) {
                                    props.showNotice("放入时间失败，请稍后再试");
                                    return;
                                  }
                                  props.showNotice("已放入时间层");
                                })()
                              }
                            >
                              放入时间
                            </button>
                            <button
                              type="button"
                              className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-700"
                              onClick={() =>
                                void (async () => {
                                  const ok = await props.onDeleteScratch(item.id);
                                  if (!ok) props.showNotice("随记删除失败，请稍后再试");
                                })()
                              }
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {organizePanelOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[860px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-black/12 bg-white p-4 shadow-[0_20px_48px_rgba(15,23,42,0.22)] sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-800">整理一下</p>
                <p className="mt-1 text-xs text-slate-500">选择内容并移动到目标思路线</p>
              </div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setOrganizePanelOpen(false)}>
                关闭
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-black/8 bg-[#f8f6f2] px-3 py-2">
              <div className="flex items-center gap-1 text-xs">
                {[
                  { value: "current" as OrganizeScope, label: "当前线", count: organizeCurrentCount, disabled: !activeTrackId },
                  { value: "all" as OrganizeScope, label: "全部", count: organizeAllNodes.length, disabled: false }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={item.disabled}
                    className={cn(
                      "rounded-full border px-2.5 py-1 transition-colors",
                      organizeScope === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-black/12 bg-white text-slate-600 hover:text-slate-800",
                      item.disabled ? "cursor-not-allowed opacity-45 hover:text-slate-600" : ""
                    )}
                    onClick={() => setOrganizeScope(item.value)}
                  >
                    {item.label} {item.count}
                  </button>
                ))}
              </div>
              <input
                value={organizeQuery}
                placeholder="搜索内容或来源思路线"
                className="h-8 min-w-0 flex-1 rounded-full border border-black/12 bg-white px-3 text-xs text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                onChange={(event) => setOrganizeQuery(event.target.value)}
              />
              <button
                type="button"
                className="rounded-full border border-black/12 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:text-slate-800"
                onClick={() =>
                  setOrganizeSelectedNodeIds((prev) => {
                    const visibleIds = organizeVisibleNodes.map((node) => node.nodeId);
                    const visibleSet = new Set(visibleIds);
                    if (organizeAllVisibleSelected) {
                      return prev.filter((id) => !visibleSet.has(id));
                    }
                    const nextSet = new Set(prev);
                    for (const id of visibleIds) nextSet.add(id);
                    return [...nextSet];
                  })
                }
              >
                {organizeAllVisibleSelected ? "取消全选" : "全选当前结果"}
              </button>
            </div>
            <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {organizeVisibleNodes.length ? (
                organizeVisibleNodes.map((node) => (
                  <label
                    key={node.nodeId}
                    className={cn(
                      "block rounded-xl border px-3 py-2 transition-colors",
                      organizeSelectedSet.has(node.nodeId) ? "border-slate-900/35 bg-slate-50" : "border-black/10 bg-[#fcfaf6] hover:border-black/15"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={organizeSelectedSet.has(node.nodeId)}
                        onChange={(event) =>
                          setOrganizeSelectedNodeIds((prev) => {
                            if (event.target.checked) {
                              if (prev.includes(node.nodeId)) return prev;
                              return [...prev, node.nodeId];
                            }
                            return prev.filter((id) => id !== node.nodeId);
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] leading-[1.55] text-slate-700">
                          {node.questionText || `节点 ${node.nodeId.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          来自：{node.fromTrackTitle || "未命名思路线"}
                          {node.createdAt ? ` · ${formatRelativeNodeTime(node.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <p className="rounded-xl border border-black/8 bg-[#fcfaf6] px-3 py-6 text-center text-sm text-slate-500">
                  当前范围没有待整理内容
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">已选 {organizeSelectedNodeIds.length} 条</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-slate-600">移动到</span>
                <select
                  value={organizeTargetTrackId}
                  className="h-8 max-w-[220px] rounded-full border border-black/12 bg-white px-3 text-xs text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                  onChange={(event) => setOrganizeTargetTrackId(event.target.value)}
                >
                  {organizeTargetTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {trackCardTitle(track).slice(0, 24)}
                    </option>
                  ))}
                  <option value="__new__">创建新方向</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-black/12 text-slate-700"
                  onClick={() => setOrganizePanelOpen(false)}
                >
                取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800 disabled:opacity-50"
                  disabled={!organizeSelectedNodeIds.length || isApplyingOrganize}
                  onClick={applyOrganize}
                >
                  {isApplyingOrganize ? "移动中..." : "移动"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {backgroundOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[620px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">背景说明（100-300字）</p>
            <textarea
              data-zh-input="multiline"
              value={backgroundDraft}
              maxLength={320}
              className="mt-3 h-40 w-full resize-none rounded-xl border border-black/12 bg-white px-3 py-2 text-sm leading-[1.6] text-slate-800 outline-none [overflow-wrap:anywhere] focus-visible:ring-1 focus-visible:ring-black/20"
              onChange={(event) => setBackgroundDraft(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">仅影响之后的推荐，不回溯旧节点</p>
            <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-500", backgroundHint ? "opacity-100" : "opacity-0")}>{backgroundHint}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/12 text-slate-700" onClick={() => setBackgroundOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={saveBackground}>
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {renameSpaceOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">重命名空间</p>
            <input
              value={renameSpaceDraft}
              maxLength={220}
              className="mt-3 h-11 w-full rounded-xl border border-black/12 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              onChange={(event) => setRenameSpaceDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && renameSpace()}
            />
            <p className="mt-1 text-xs text-slate-500">修改后会同步到空间列表与详情。</p>
            <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-500", renameSpaceHint ? "opacity-100" : "opacity-0")}>{renameSpaceHint}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-black/12 text-slate-700"
                onClick={() => setRenameSpaceOpen(false)}
              >
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={renameSpace}>
                {isRenamingSpace ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {exportOpen ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[760px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-800">Markdown 导出</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={exportLoading || !exportMarkdown.trim()}
                  className="rounded-full text-slate-700 hover:bg-black/[0.05] disabled:opacity-50"
                  onClick={copyExportMarkdown}
                >
                  复制
                </Button>
                <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setExportOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
            <textarea
              data-zh-input="multiline"
              value={exportLoading ? "导出生成中..." : exportMarkdown}
              readOnly
              className="h-[52vh] w-full resize-none rounded-xl border border-black/12 bg-[#f7f4ef] px-3 py-3 text-xs leading-[1.65] text-slate-700 outline-none [overflow-wrap:anywhere]"
            />
          </div>
        </div>
      ) : null}

      {deleteSpaceOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">删除这个空间？</p>
            <p className="mt-2 line-clamp-2 text-xs text-slate-500">{activeSpace.rootQuestionText}</p>
            <p className="mt-1 text-xs text-slate-500">删除后不可恢复，轨道、节点与关联会一并清理。</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/12 text-slate-700" onClick={() => setDeleteSpaceOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-red-600 text-slate-50 hover:bg-red-500" onClick={deleteSpace}>
                确认删除
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes zhTrackNodeIn {
          0% {
            opacity: 0;
            transform: translateY(7px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function MenuItem(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={cn(
        "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
        props.disabled ? "cursor-not-allowed text-slate-400" : "text-slate-700 hover:bg-slate-100"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function NodeMenu(props: {
  disabled: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 192;
      const left = Math.min(rect.left - 12, window.innerWidth - menuWidth - 12);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 260);
      setMenuStyle({
        top: Math.max(12, top),
        left: Math.max(12, left)
      });
    };
    updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (
        event.target instanceof Node &&
        !menuRef.current.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const runAction = (event: ReactMouseEvent<HTMLButtonElement>, fn: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    fn();
    setOpen(false);
  };

  const menuContent = (
    <div
      ref={menuRef}
      role="menu"
      aria-hidden={!open}
      style={menuStyle ?? undefined}
      className={cn(
        "fixed z-[80] w-48 rounded-xl border border-black/12 bg-white p-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.16)]",
        open ? "block" : "hidden"
      )}
    >
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
        onClick={(event) => runAction(event, props.onEdit)}
      >
        修改
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
        onClick={(event) => runAction(event, props.onCopy)}
      >
        复制
      </button>
      <div className="my-1 h-px bg-black/8" />
      <button
        type="button"
        role="menuitem"
        disabled={props.disabled}
        className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
        onClick={(event) => runAction(event, props.onDelete)}
      >
        删除
      </button>
    </div>
  );

  return (
    <div className={cn("relative inline-block", props.triggerClassName)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="节点菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700",
          props.disabled ? "cursor-not-allowed" : open ? "cursor-pointer" : "cursor-pointer hover:bg-black/[0.025]"
        )}
        disabled={props.disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ⋯
        </span>
      </button>
      {typeof document !== "undefined" ? createPortal(menuContent, document.body) : null}
    </div>
  );
}

