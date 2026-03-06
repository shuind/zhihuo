"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type ThinkingSpaceStatus, type ThinkingStore, type TrackDirectionHint } from "@/components/zhihuo-model";

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

export type ThinkingTrackNodeView = {
  id: string;
  questionText: string;
  noteText: string | null;
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
  nodeCount: number;
  nodes: ThinkingTrackNodeView[];
};

export type ThinkingSpaceView = {
  spaceId: string;
  currentTrackId: string | null;
  parkingTrackId: string | null;
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
  onSetActiveTrack: (spaceId: string, trackId: string) => Promise<boolean>;
  onUpdateTrackDirection: (spaceId: string, trackId: string, directionHint: TrackDirectionHint | null) => Promise<boolean>;
  onSaveBackground: (spaceId: string, backgroundText: string | null) => Promise<{ ok: true; version: number } | { ok: false; message: string }>;
  onFreezeSpace: (
    spaceId: string,
    userFreezeNote: string | null,
    milestoneNodeIds: string[]
  ) => Promise<{ ok: true; frozenAt: string; freezeNote: string | null } | { ok: false; message: string }>;
  onToggleArchiveSpace: (spaceId: string, targetStatus: "active" | "archived") => Promise<{ ok: true } | { ok: false; message: string }>;
  onDeleteSpace: (spaceId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onExportSpace: (spaceId: string) => Promise<string | null>;
  onFreezeToLife: (payload: { rootQuestionText: string; createdAt: string; frozenAt: string; freezeNote: string | null }) => void;
  focusMode: boolean;
  onFocusModeChange: (enabled: boolean) => void;
  reentryTarget: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null } | null;
  onReentryHandled: () => void;
  showNotice: (message: string) => void;
}) {
  const [newSpaceInput, setNewSpaceInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [inputHint, setInputHint] = useState("");
  const [inputSuggestions, setInputSuggestions] = useState<string[]>([]);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [freezePanelOpen, setFreezePanelOpen] = useState(false);
  const [freezeNoteInput, setFreezeNoteInput] = useState("");
  const [writeToLifeOnFreeze, setWriteToLifeOnFreeze] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [createSpaceHint, setCreateSpaceHint] = useState("");
  const [createSpaceSuggestions, setCreateSpaceSuggestions] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [backgroundDraft, setBackgroundDraft] = useState("");
  const [backgroundHint, setBackgroundHint] = useState("");
  const [justAddedNodeId, setJustAddedNodeId] = useState<string | null>(null);
  const [relatedCandidate, setRelatedCandidate] = useState<{ sourceNodeId: string; targetNodeId: string; preview: string } | null>(null);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [pausedTrackIds, setPausedTrackIds] = useState<Record<string, boolean>>({});
  const [organizingSpaceId, setOrganizingSpaceId] = useState<string | null>(null);
  const [organizeCandidates, setOrganizeCandidates] = useState<Array<OrganizeCandidate & { targetTrackId: string; selected: boolean }>>([]);
  const [organizePanelOpen, setOrganizePanelOpen] = useState(false);
  const [organizeHintCount, setOrganizeHintCount] = useState(0);
  const [milestoneNodeIds, setMilestoneNodeIds] = useState<string[]>([]);
  const [focusMenuNodeId, setFocusMenuNodeId] = useState<string | null>(null);
  const [deleteSpaceOpen, setDeleteSpaceOpen] = useState(false);

  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const questionInputRef = useRef<HTMLInputElement | null>(null);
  const organizeTimerRef = useRef<number | null>(null);
  const clearAddedTimerRef = useRef<number | null>(null);
  const trackPositionsRef = useRef<Record<string, TrackPosition>>({});
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

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
    () => [...props.store.spaces].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [props.store.spaces]
  );
  const tabs = useMemo(() => spaces.filter((space) => space.status !== "archived"), [spaces]);
  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === props.activeSpaceId) ?? null,
    [props.activeSpaceId, spaces]
  );
  const tracks = useMemo(() => props.spaceView?.tracks ?? [], [props.spaceView]);
  const fallbackTrackId = useMemo(() => tracks[0]?.id ?? null, [tracks]);
  const activeTrackId = useMemo(() => {
    if (pendingTrackId && tracks.some((track) => track.id === pendingTrackId)) return pendingTrackId;
    if (props.spaceView?.currentTrackId && tracks.some((track) => track.id === props.spaceView?.currentTrackId)) return props.spaceView.currentTrackId;
    return fallbackTrackId;
  }, [fallbackTrackId, pendingTrackId, props.spaceView, tracks]);
  const activeTrack = useMemo(() => tracks.find((track) => track.id === activeTrackId) ?? null, [activeTrackId, tracks]);
  const otherTracks = useMemo(() => tracks.filter((track) => track.id !== activeTrackId).slice(0, 5), [activeTrackId, tracks]);
  const milestoneCandidates = useMemo(
    () =>
      tracks
        .flatMap((track) => track.nodes.map((node) => ({ trackId: track.id, node })))
        .slice()
        .sort((a, b) => (a.node.createdAt && b.node.createdAt ? new Date(b.node.createdAt).getTime() - new Date(a.node.createdAt).getTime() : 0))
        .slice(0, 20),
    [tracks]
  );

  useEffect(() => {
    setPendingTrackId(null);
    setQuestionInput("");
    setInputHint("");
    setInputSuggestions([]);
    setMoreOpen(false);
    setBackgroundOpen(false);
    setFreezePanelOpen(false);
    setPausedTrackIds({});
    setBackgroundDraft(props.spaceView?.backgroundText ?? "");
    setMilestoneNodeIds([]);
    setOrganizeCandidates([]);
    setOrganizeHintCount(0);
    setOrganizePanelOpen(false);
    setRelatedCandidate(null);
    setFocusMenuNodeId(null);
    setDeleteSpaceOpen(false);
  }, [props.activeSpaceId, props.spaceView?.backgroundText]);

  useEffect(() => {
    return () => {
      if (organizeTimerRef.current) window.clearTimeout(organizeTimerRef.current);
      if (clearAddedTimerRef.current) window.clearTimeout(clearAddedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!freezePanelOpen) return;
    setMilestoneNodeIds(props.spaceView?.milestoneNodeIds?.slice(0, 3) ?? []);
  }, [freezePanelOpen, props.spaceView?.milestoneNodeIds]);

  useEffect(() => {
    if (!props.focusMode) {
      setFocusMenuNodeId(null);
    }
  }, [props.focusMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFocusMenuNodeId(null);
      setOrganizePanelOpen(false);
      setMoreOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current) return;
      if (event.target instanceof Node && !moreMenuRef.current.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!activeSpace || !activeTrack) return;
    const key = `${activeSpace.id}:${activeTrack.id}`;
    const saved = trackPositionsRef.current[key];
    const frame = window.requestAnimationFrame(() => {
      const container = trackScrollRef.current;
      if (!container) return;
      container.scrollTop = saved ? saved.scrollTop : container.scrollHeight;
      if (saved?.focusNodeId) {
        const target = document.getElementById(`thinking-node-${saved.focusNodeId}`);
        target?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSpace, activeTrack]);

  const clearAddedFlagLater = useCallback(() => {
    if (clearAddedTimerRef.current) window.clearTimeout(clearAddedTimerRef.current);
    clearAddedTimerRef.current = window.setTimeout(() => {
      setJustAddedNodeId(null);
      clearAddedTimerRef.current = null;
    }, 420);
  }, []);

  const centerNodeInTrack = useCallback((nodeId: string, behavior: ScrollBehavior = "auto") => {
    const container = trackScrollRef.current;
    if (!container) return false;
    const target = document.getElementById(`thinking-node-${nodeId}`);
    if (!target) return false;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + container.scrollTop;
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
      setPendingTrackId(targetTrackId);
      void props.onSetActiveTrack(activeSpace.id, targetTrackId);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const container = trackScrollRef.current;
        if (!container) return;

        if (target.mode === "root" || !target.nodeId) {
          container.scrollTo({ top: 0, behavior: "smooth" });
          questionInputRef.current?.focus();
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

      const run = () => {
        if (cancelled) return;
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

  const scheduleOrganize = useCallback(
    (spaceId: string) => {
      if (organizeTimerRef.current) window.clearTimeout(organizeTimerRef.current);
      organizeTimerRef.current = window.setTimeout(() => {
        setOrganizingSpaceId(spaceId);
        void (async () => {
          const candidates = await props.onOrganizePreview(spaceId);
          setOrganizeHintCount(candidates.length);
          setOrganizeCandidates(
            candidates.map((item) => ({
              ...item,
              targetTrackId: item.suggestedTrackId,
              selected: true
            }))
          );
          setOrganizingSpaceId((prev) => (prev === spaceId ? null : prev));
        })();
      }, ORGANIZE_IDLE_MS);
    },
    [props]
  );

  const applyOrganize = useCallback(() => {
    if (!activeSpace) return;
    const moves = organizeCandidates.filter((item) => item.selected).map((item) => ({ nodeId: item.nodeId, targetTrackId: item.targetTrackId }));
    if (!moves.length) {
      setOrganizePanelOpen(false);
      return;
    }
    void (async () => {
      const result = await props.onOrganizeApply(activeSpace.id, moves);
      if (!result.ok) {
        props.showNotice(result.message);
        return;
      }
      setOrganizePanelOpen(false);
      setOrganizeHintCount(0);
      props.showNotice(`已安放 ${result.movedCount} 条念头`);
    })();
  }, [activeSpace, organizeCandidates, props]);

  const openOrganizePanel = useCallback(() => {
    if (!activeSpace) return;
    setOrganizePanelOpen(true);
    void (async () => {
      const candidates = await props.onOrganizePreview(activeSpace.id);
      setOrganizeHintCount(candidates.length);
      setOrganizeCandidates(
        candidates.map((item) => ({
          ...item,
          targetTrackId: item.suggestedTrackId,
          selected: true
        }))
      );
    })();
  }, [activeSpace, props]);

  const createSpace = useCallback(() => {
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
        if (result.createdAsStatement && result.questionSuggestion) {
          props.showNotice(`也可以这样继续追问：${result.questionSuggestion}`);
        }
      } finally {
        setIsCreatingSpace(false);
      }
    })();
  }, [isCreatingSpace, newSpaceInput, props]);

  const addQuestion = useCallback(
    (rawInput: string, fromSuggestion = false) => {
      if (!activeSpace) return;
      if (activeSpace.status !== "active") {
        setInputHint("这段思考现在停在这里");
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
            trackId: activeTrackId,
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
          if (result.relatedCandidate?.nodeId) {
            setRelatedCandidate({
              sourceNodeId: result.nodeId,
              targetNodeId: result.relatedCandidate.nodeId,
              preview: result.relatedCandidate.preview
            });
          } else {
            setRelatedCandidate(null);
          }
          if (result.trackId !== activeTrackId) setPendingTrackId(result.trackId);
          centerAddedNodeWithRetry(result.nodeId, activeSpace.id, result.trackId);
          scheduleOrganize(activeSpace.id);
        } finally {
          setIsAddingQuestion(false);
        }
      })();
    },
    [activeSpace, activeTrackId, centerAddedNodeWithRetry, clearAddedFlagLater, isAddingQuestion, props, scheduleOrganize]
  );

  const confirmRelatedLink = useCallback(() => {
    if (!relatedCandidate) return;
    void (async () => {
      const ok = await props.onLinkNodes(relatedCandidate.sourceNodeId, relatedCandidate.targetNodeId);
      if (!ok) {
        props.showNotice("关联失败，请稍后再试");
        return;
      }
      setRelatedCandidate(null);
      props.showNotice("已添加关联");
    })();
  }, [props, relatedCandidate]);

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

  const toggleMilestoneNode = useCallback((nodeId: string) => {
    setMilestoneNodeIds((prev) => {
      if (prev.includes(nodeId)) return prev.filter((item) => item !== nodeId);
      if (prev.length >= 3) return prev;
      return [...prev, nodeId];
    });
  }, []);

  const freezeSpace = useCallback(() => {
    if (!activeSpace || activeSpace.status !== "active") return;
    const freezeNote = freezeNoteInput.trim().slice(0, 48);
    void (async () => {
      const result = await props.onFreezeSpace(activeSpace.id, freezeNote || null, milestoneNodeIds);
      if (!result.ok) {
        props.showNotice(result.message);
        return;
      }
      if (writeToLifeOnFreeze) {
        props.onFreezeToLife({
          rootQuestionText: activeSpace.rootQuestionText,
          createdAt: activeSpace.createdAt,
          frozenAt: result.frozenAt,
          freezeNote: result.freezeNote
        });
      }
      setFreezePanelOpen(false);
      setFreezeNoteInput("");
      setMilestoneNodeIds([]);
      setWriteToLifeOnFreeze(false);
      props.showNotice("先停在这里了");
    })();
  }, [activeSpace, freezeNoteInput, milestoneNodeIds, props, writeToLifeOnFreeze]);

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

  const toggleArchive = useCallback(() => {
    if (!activeSpace) return;
    const targetStatus: "active" | "archived" = activeSpace.status === "archived" ? "active" : "archived";
    void (async () => {
      const result = await props.onToggleArchiveSpace(activeSpace.id, targetStatus);
      if (!result.ok) props.showNotice(result.message);
      setMoreOpen(false);
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
      props.showNotice("空间已删除");
    })();
  }, [activeSpace, props]);

  const switchTrack = useCallback(
    (trackId: string) => {
      if (!activeSpace || !activeTrack) return;
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
      setPendingTrackId(trackId);
      void (async () => {
        const ok = await props.onSetActiveTrack(activeSpace.id, trackId);
        if (!ok) setPendingTrackId(null);
      })();
    },
    [activeSpace, activeTrack, props, rememberTrackPosition]
  );

  const updateDirectionHint = useCallback(
    (trackId: string, nextHint: TrackDirectionHint | null) => {
      if (!activeSpace) return;
      void (async () => {
        const ok = await props.onUpdateTrackDirection(activeSpace.id, trackId, nextHint);
        if (!ok) props.showNotice("方向提示保存失败");
      })();
    },
    [activeSpace, props]
  );

  const statusLabel = activeSpace ? (activeSpace.status === "active" ? "进行中" : activeSpace.status === "frozen" ? "停在这里" : "归档") : "";

  return (
    <div className="h-full overflow-hidden px-3 pb-4 pt-3 md:px-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-black/10 bg-[#f7f4ef]/95 shadow-[0_14px_36px_rgba(43,38,33,0.10)]">
        <header className="border-b border-black/10 px-3 py-3 md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex w-max min-w-full items-center gap-2 pr-3">
                {tabs.length ? (
                  tabs.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => props.setActiveSpaceId(space.id)}
                      className={cn(
                        "max-w-[240px] rounded-full border px-3 py-1.5 text-left text-xs leading-[1.35] transition-colors",
                        props.activeSpaceId === space.id
                          ? "border-black/20 bg-white text-slate-900"
                          : "border-black/10 bg-white/60 text-slate-600 hover:bg-white"
                      )}
                    >
                      <span className="line-clamp-1">{space.rootQuestionText}</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">先创建一个思考空间</span>
                )}
                <button
                  type="button"
                  className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-white"
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-black/10 bg-white/80 text-slate-700 hover:bg-white"
                disabled={!activeSpace || activeSpace.status !== "active"}
                onClick={() => setFreezePanelOpen(true)}
              >
                先停在这里
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-black/10 bg-white/80 text-slate-700 hover:bg-white"
                disabled={!activeSpace}
                onClick={openExport}
              >
                导出
              </Button>
              <div className="relative" ref={moreMenuRef}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-black/10 bg-white/80 text-slate-700 hover:bg-white"
                  onClick={() => setMoreOpen((prev) => !prev)}
                >
                  更多
                </Button>
                {moreOpen ? (
                  <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_14px_30px_rgba(16,20,24,0.16)]">
                    <MenuItem
                      label="背景说明"
                      disabled={!activeSpace || activeSpace.status !== "active"}
                      onClick={() => {
                        setMoreOpen(false);
                        setBackgroundOpen(true);
                      }}
                    />
                    <MenuItem
                      label="整理一下"
                      disabled={!activeSpace || activeSpace.status !== "active"}
                      onClick={() => {
                        setMoreOpen(false);
                        openOrganizePanel();
                      }}
                    />
                    <MenuItem
                      label={activeSpace?.status === "archived" ? "恢复空间" : "归档空间"}
                      disabled={!activeSpace}
                      onClick={toggleArchive}
                    />
                    <MenuItem
                      label="删除空间"
                      disabled={!activeSpace}
                      onClick={() => {
                        setMoreOpen(false);
                        setDeleteSpaceOpen(true);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "rounded-full border border-black/10 bg-white/80 text-slate-700 hover:bg-white",
                  props.focusMode ? "bg-slate-900 text-slate-50 hover:bg-slate-800" : ""
                )}
                onClick={() => props.onFocusModeChange(!props.focusMode)}
              >
                专注
              </Button>
            </div>
          </div>
        </header>
        {!activeSpace ? (
          <div className="grid flex-1 place-items-center p-8">
            <div className="text-center">
              <p className="text-sm text-slate-600">还没有思考空间</p>
              <Button
                type="button"
                size="sm"
                className="mt-4 rounded-full bg-slate-900 px-4 text-slate-50 hover:bg-slate-800"
                onClick={() => setCreateSpaceOpen(true)}
              >
                创建空间
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto]">
            <section className="border-b border-black/8 px-4 py-5 md:px-8 md:py-7">
              <div className="text-center">
                <p className="text-[11px] text-slate-500">{statusLabel}</p>
                <h2 className="mx-auto mt-2 max-w-4xl text-[30px] font-medium leading-[1.5] text-slate-900">{activeSpace.rootQuestionText}</h2>
                <div className="mx-auto mt-4 flex max-w-3xl items-center gap-2">
                  <input
                    ref={questionInputRef}
                    value={questionInput}
                    maxLength={220}
                    disabled={activeSpace.status !== "active"}
                    placeholder={activeSpace.status === "active" ? "继续输入一个疑问…" : "这段思考现在停在这里"}
                    className="h-11 flex-1 rounded-full border border-black/12 bg-white/92 px-4 text-sm text-slate-900 outline-none transition focus-visible:ring-1 focus-visible:ring-black/20 disabled:bg-black/5 disabled:text-slate-500"
                    onChange={(event) => setQuestionInput(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addQuestion(questionInput, false))}
                  />
                  <Button
                    type="button"
                    className="h-11 rounded-full bg-slate-900 px-4 text-slate-50 hover:bg-slate-800"
                    disabled={activeSpace.status !== "active" || isAddingQuestion}
                    onClick={() => addQuestion(questionInput, false)}
                  >
                    {isAddingQuestion ? "放入中..." : "放入结构"}
                  </Button>
                </div>
                {organizingSpaceId === activeSpace.id ? <p className="mt-2 text-xs text-slate-500">正在形成结构…</p> : null}
                {organizeHintCount > 0 ? (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs text-slate-600">
                    <span>这几条像是另一条线上的内容</span>
                    <button type="button" className="text-slate-800 hover:underline" onClick={openOrganizePanel}>
                      整理一下
                    </button>
                  </div>
                ) : null}
                <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-500", inputHint ? "opacity-100" : "opacity-0")}>{inputHint}</p>
                {relatedCandidate ? (
                  <div className="mx-auto mt-2 flex max-w-3xl items-center justify-center gap-2 text-xs text-slate-600">
                    <span>发现相关节点：{relatedCandidate.preview}</span>
                    <button type="button" className="text-slate-800 hover:underline" onClick={confirmRelatedLink}>
                      关联
                    </button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => setRelatedCandidate(null)}>
                      忽略
                    </button>
                  </div>
                ) : null}
                {inputSuggestions.length ? (
                  <div className="mx-auto mt-2 flex max-w-3xl flex-wrap justify-center gap-2">
                    {inputSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="rounded-full border border-black/10 bg-white/85 px-3 py-1 text-xs text-slate-700 transition-colors hover:bg-white"
                        onClick={() => addQuestion(suggestion, true)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section
              className={cn(
                "grid min-h-0 overflow-hidden gap-4 px-4 py-4 md:px-8 md:py-6",
                props.focusMode ? "md:grid-cols-[minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_260px]"
              )}
            >
              <div className="min-h-0 h-full min-w-0 rounded-2xl border border-black/10 bg-white/62 p-3 md:p-4 flex flex-col overflow-hidden">
                {!activeTrack ? (
                  <div className="grid h-full min-h-0 place-items-center text-sm text-slate-500">继续输入疑问，轨道会在这里展开</div>
                ) : (
                  <div
                    data-track-panel="true"
                    className={cn("h-full min-h-0 min-w-0 flex flex-col", pausedTrackIds[activeTrack.id] ? "opacity-45" : "opacity-100")}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-700">{activeTrack.isParking ? "先放这里" : "当前这条线"}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <select
                            aria-label="方向提示"
                            value={activeTrack.directionHint ?? ""}
                            disabled={activeSpace.status !== "active"}
                            className="h-7 rounded-full border border-black/10 bg-white/85 px-2 text-[11px] text-slate-600 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                            onChange={(event) =>
                              updateDirectionHint(
                                activeTrack.id,
                                event.target.value ? (event.target.value as TrackDirectionHint) : null
                              )
                            }
                          >
                            <option value="">不强调方向</option>
                            {DIRECTION_HINT_OPTIONS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">{activeTrack.nodeCount} 个疑问</p>
                    </div>
                    <div
                      ref={trackScrollRef}
                      data-track-scroll="true"
                      className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain"
                      onScroll={(event) => {
                        if (!activeSpace || !activeTrack) return;
                        const container = event.currentTarget;
                        const prev = trackPositionsRef.current[`${activeSpace.id}:${activeTrack.id}`];
                        rememberTrackPosition(activeSpace.id, activeTrack.id, {
                          scrollTop: container.scrollTop,
                          focusNodeId: prev?.focusNodeId ?? null
                        });
                      }}
                    >
                      <div className="absolute bottom-0 left-3 top-0 w-px bg-black/7" />
                      <ul className="min-w-0 space-y-2 pl-6 pb-40">
                        {activeTrack.nodes.map((node) => (
                          <li
                            key={node.id}
                            id={`thinking-node-${node.id}`}
                            data-track-node="true"
                            tabIndex={-1}
                            className={cn(
                              "min-w-0 rounded-xl border border-black/8 bg-white/90 px-3 py-2.5 outline-none transition-[opacity,transform,box-shadow] duration-300",
                              justAddedNodeId === node.id ? "shadow-[0_10px_20px_rgba(30,35,40,0.12)]" : ""
                            )}
                            style={justAddedNodeId === node.id ? { animation: "zhTrackNodeIn 360ms ease-out 1" } : undefined}
                            onDoubleClick={() => props.focusMode && setFocusMenuNodeId(node.id)}
                            onFocus={() => {
                              if (!activeSpace || !activeTrack) return;
                              const container = trackScrollRef.current;
                              rememberTrackPosition(activeSpace.id, activeTrack.id, {
                                scrollTop: container?.scrollTop ?? 0,
                                focusNodeId: node.id
                              });
                            }}
                          >
                            <p className="text-[15px] leading-[1.65] text-slate-900 [overflow-wrap:anywhere]">
                              {node.isMilestone ? <span className="mr-1">⭐</span> : null}
                              {node.questionText}
                            </p>
                            {node.noteText ? <p className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">附注：{node.noteText}</p> : null}
                            <div className="mt-2 flex items-center justify-between">
                              {!props.focusMode || focusMenuNodeId === node.id ? (
                                <NodeMenu
                                  disabled={activeSpace.status !== "active"}
                                  tracks={tracks}
                                  currentTrackId={activeTrack.id}
                                  paused={Boolean(pausedTrackIds[activeTrack.id])}
                                  onMove={(trackId) =>
                                    void (async () => {
                                      const ok = await props.onMoveNode(node.id, trackId);
                                      if (!ok) props.showNotice("移动失败，请稍后再试");
                                    })()
                                  }
                                  onMisplaced={() =>
                                    void (async () => {
                                      const ok = await props.onMarkMisplaced(node.id);
                                      if (!ok) {
                                        props.showNotice("暂时没能安放过去");
                                        return;
                                      }
                                      props.showNotice("先放这里了");
                                    })()
                                  }
                                  onDelete={() =>
                                    void (async () => {
                                      const ok = await props.onDeleteNode(node.id);
                                      if (!ok) props.showNotice("删除失败，请稍后再试");
                                    })()
                                  }
                                  onTogglePause={() =>
                                    setPausedTrackIds((prev) => ({ ...prev, [activeTrack.id]: !prev[activeTrack.id] }))
                                  }
                                />
                              ) : (
                                <span className="text-[11px] text-slate-400">双击显示菜单</span>
                              )}
                              {node.echoTrackId ? (
                                <button
                                  type="button"
                                  className="text-[11px] text-slate-500 transition-colors hover:text-slate-700"
                                  onClick={() => switchTrack(node.echoTrackId as string)}
                                >
                                  在其他方向也出现过
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  {node.hasRelatedLink ? "有关联" : node.createdAt ? node.createdAt.slice(11, 16) : ""}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {!props.focusMode ? (
              <aside data-other-tracks="true" className="min-h-0 rounded-2xl border border-black/10 bg-white/55 p-3">
                <p className="mb-2 text-xs text-slate-500">其他方向</p>
                <div className="grid gap-2">
                  {otherTracks.length ? (
                    otherTracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        data-other-track-button="true"
                        onClick={() => switchTrack(track.id)}
                        className={cn(
                          "rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-left transition-colors hover:bg-white",
                          pausedTrackIds[track.id] ? "opacity-45" : "opacity-100"
                        )}
                      >
                        <p className="line-clamp-2 text-xs leading-[1.55] text-slate-700">{track.titleQuestionText}</p>
                        {track.directionHint ? (
                          <p className="mt-1 text-[11px] text-slate-500">{directionHintLabel(track.directionHint)}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-slate-500">{track.nodeCount}个疑问</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">暂无其他方向</p>
                  )}
                </div>
              </aside>
              ) : null}
            </section>

            <footer className="border-t border-black/10 px-4 py-2 text-xs text-slate-500 md:px-8">
              {props.spaceView?.backgroundText ? `背景 v${props.spaceView.backgroundVersion}` : "未设置背景说明"}
            </footer>
          </div>
        )}
      </div>

      {createSpaceOpen ? (
        <div className="absolute inset-0 z-40 bg-black/15 backdrop-blur-[1px]">
          <div className="absolute right-4 top-16 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-4 shadow-[0_20px_48px_rgba(15,23,42,0.22)] md:right-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-800">从一个困惑、判断或冲突开始</p>
                <p className="mt-1 text-xs text-slate-500">它会成为这段思考的中心</p>
              </div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setCreateSpaceOpen(false)}>
                关闭
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <input
                value={newSpaceInput}
                maxLength={160}
                className="h-10 rounded-full border border-black/12 bg-white px-4 text-sm text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                placeholder="写下这段思考现在围着什么转"
                onChange={(event) => setNewSpaceInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), createSpace())}
              />
              <Button
                type="button"
                disabled={isCreatingSpace}
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

      {organizePanelOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[760px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-800">安放这些散开的念头</p>
                <p className="mt-1 text-xs text-slate-500">看看它们更像放在哪条线里</p>
              </div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setOrganizePanelOpen(false)}>
                关闭
              </button>
            </div>
            <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {organizeCandidates.length ? (
                organizeCandidates.map((candidate) => (
                  <div key={candidate.nodeId} className="rounded-xl border border-black/10 bg-[#f8f6f2] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={candidate.selected}
                          onChange={(event) =>
                            setOrganizeCandidates((prev) =>
                              prev.map((item) => (item.nodeId === candidate.nodeId ? { ...item, selected: event.target.checked } : item))
                            )
                          }
                        />
                        {candidate.preview || `节点 ${candidate.nodeId.slice(0, 8)}`}
                      </label>
                      <span className="text-[11px] text-slate-500">{candidate.score.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <span>更像属于：</span>
                      <select
                        value={candidate.targetTrackId}
                        className="rounded-full border border-black/12 bg-white px-2 py-1 text-xs"
                        onChange={(event) =>
                          setOrganizeCandidates((prev) =>
                            prev.map((item) => (item.nodeId === candidate.nodeId ? { ...item, targetTrackId: event.target.value } : item))
                          )
                        }
                      >
                        {tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.titleQuestionText.slice(0, 24)}
                          </option>
                        ))}
                        <option value="__new__">从另一个方向展开</option>
                      </select>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">暂时没有需要安放的内容</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/12 text-slate-700" onClick={() => setOrganizePanelOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={applyOrganize}>
                安放这些念头
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {backgroundOpen && activeSpace ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[620px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">背景说明（100-300字）</p>
            <textarea
              value={backgroundDraft}
              maxLength={320}
              className="mt-3 h-40 w-full resize-none rounded-xl border border-black/12 bg-white px-3 py-2 text-sm leading-[1.6] text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
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

      {freezePanelOpen && activeSpace?.status === "active" ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
          <div className="w-[620px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <div className="mb-4">
              <p className="text-sm text-slate-800">先停在这里</p>
              <p className="mt-1 text-xs text-slate-500">今天先想到这里，或先留一个能回来的踏板</p>
            </div>
            <p className="text-sm text-slate-800">当前状态（可选，一句话）</p>
            <input
              value={freezeNoteInput}
              maxLength={48}
              className="mt-3 h-10 w-full rounded-full border border-black/12 bg-white px-4 text-sm text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              onChange={(event) => setFreezeNoteInput(event.target.value)}
            />
            <div className="mt-3 rounded-xl border border-black/10 bg-[#f8f6f2] px-3 py-2 text-xs leading-[1.7] text-slate-500">
              <p>今天先想到这里</p>
              <p>这段暂时卡住了</p>
              <p>先留一个能回来的踏板</p>
            </div>
            <div className="mt-4 rounded-xl border border-black/10 bg-[#f8f6f2] p-3">
              <p className="text-xs text-slate-600">关键节点（最多 3 个）</p>
              <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto pr-1">
                {milestoneCandidates.map((entry) => (
                  <label key={entry.node.id} className="flex items-start gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-white/80">
                    <input
                      type="checkbox"
                      checked={milestoneNodeIds.includes(entry.node.id)}
                      onChange={() => toggleMilestoneNode(entry.node.id)}
                      disabled={!milestoneNodeIds.includes(entry.node.id) && milestoneNodeIds.length >= 3}
                    />
                    <span className="line-clamp-2">{entry.node.questionText}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={writeToLifeOnFreeze} onChange={(event) => setWriteToLifeOnFreeze(event.target.checked)} />
              写入时间档案馆
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/12 text-slate-700" onClick={() => setFreezePanelOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={freezeSpace}>
                停在这里
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
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setExportOpen(false)}>
                关闭
              </button>
            </div>
            <textarea
              value={exportLoading ? "导出生成中..." : exportMarkdown}
              readOnly
              className="h-[52vh] w-full resize-none rounded-xl border border-black/12 bg-[#f7f4ef] px-3 py-3 text-xs leading-[1.65] text-slate-700 outline-none"
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
  tracks: ThinkingTrackView[];
  currentTrackId: string;
  paused: boolean;
  onMove: (trackId: string) => void;
  onMisplaced: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const moveTargets = props.tracks.filter((track) => track.id !== props.currentTrackId).slice(0, 5);

  const runAction = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
          props.disabled ? "border-black/8 text-slate-400" : "border-black/10 text-slate-600 hover:bg-slate-100"
        )}
        disabled={props.disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        节点菜单
      </button>
      <div
        role="menu"
        aria-hidden={!open}
        className={cn(
          "absolute left-0 top-7 z-20 w-48 rounded-xl border border-black/12 bg-white p-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.16)]",
          open ? "block" : "hidden"
        )}
      >
        <p className="px-2 py-1 text-[11px] text-slate-500">移动到…</p>
        {moveTargets.map((track) => (
          <button
            key={track.id}
            type="button"
            role="menuitem"
            disabled={props.disabled}
            className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
            onClick={() => runAction(() => props.onMove(track.id))}
          >
            {track.titleQuestionText}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          disabled={props.disabled}
          className="mt-1 block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
          onClick={() => runAction(() => props.onMove("__new__"))}
        >
          换条线想
        </button>
        <div className="my-1 h-px bg-black/8" />
        <button
          type="button"
          role="menuitem"
          disabled={props.disabled}
          className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
          onClick={() => runAction(props.onMisplaced)}
        >
          不属于这里
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={props.disabled}
          className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
          onClick={() => runAction(props.onDelete)}
        >
          删除
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={props.disabled}
          className="block w-full rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400"
          onClick={() => runAction(props.onTogglePause)}
        >
          {props.paused ? "恢复轨道" : "暂停轨道"}
        </button>
      </div>
    </div>
  );
}

function _StatusPill({ status }: { status: ThinkingSpaceStatus }) {
  const label = status === "active" ? "进行中" : status === "frozen" ? "停在这里" : "归档";
  return (
    <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-slate-700">{label}</span>
  );
}
