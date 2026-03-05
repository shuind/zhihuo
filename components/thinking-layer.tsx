"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type ThinkingSpaceStatus, type ThinkingStore } from "@/components/zhihuo-model";

const ORGANIZE_IDLE_MS = 5000;
const TRACK_POSITION_STORAGE_KEY = "zhihuo_track_positions_v1";

export type ThinkingTrackNodeView = {
  id: string;
  questionText: string;
  noteText: string | null;
  createdAt?: string;
  isSuggested: boolean;
  echoTrackId: string | null;
  echoNodeId: string | null;
};

export type ThinkingTrackView = {
  id: string;
  titleQuestionText: string;
  nodeCount: number;
  nodes: ThinkingTrackNodeView[];
};

export type ThinkingSpaceView = {
  spaceId: string;
  currentTrackId: string | null;
  tracks: ThinkingTrackView[];
  suggestedQuestions: string[];
  freezeNote: string | null;
  backgroundText: string | null;
  backgroundVersion: number;
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
    | { ok: true; converted?: boolean; spaceId: string; createdAsStatement?: boolean; suggestedQuestions?: string[] }
    | { ok: false; message: string; suggestedQuestions?: string[] }
  >;
  onAddQuestion: (
    spaceId: string,
    payload: AddQuestionPayload
  ) => Promise<
    | { ok: true; converted: boolean; noteText: string | null; trackId: string; nodeId: string; suggestedQuestions?: string[] }
    | { ok: false; message: string; suggestedQuestions?: string[] }
  >;
  onOrganizeSpace: (spaceId: string) => Promise<boolean>;
  onMoveNode: (nodeId: string, targetTrackId: string) => Promise<boolean>;
  onMarkMisplaced: (nodeId: string) => Promise<boolean>;
  onDeleteNode: (nodeId: string) => Promise<boolean>;
  onSetActiveTrack: (spaceId: string, trackId: string) => Promise<boolean>;
  onSaveBackground: (spaceId: string, backgroundText: string | null) => Promise<{ ok: true; version: number } | { ok: false; message: string }>;
  onFreezeSpace: (
    spaceId: string,
    userFreezeNote: string | null
  ) => Promise<{ ok: true; frozenAt: string; freezeNote: string | null } | { ok: false; message: string }>;
  onToggleArchiveSpace: (spaceId: string, targetStatus: "active" | "archived") => Promise<{ ok: true } | { ok: false; message: string }>;
  onExportSpace: (spaceId: string) => Promise<string | null>;
  onFreezeToLife: (payload: { rootQuestionText: string; createdAt: string; frozenAt: string; freezeNote: string | null }) => void;
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
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [pausedTrackIds, setPausedTrackIds] = useState<Record<string, boolean>>({});
  const [organizingSpaceId, setOrganizingSpaceId] = useState<string | null>(null);

  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  const organizeTimerRef = useRef<number | null>(null);
  const clearAddedTimerRef = useRef<number | null>(null);
  const trackPositionsRef = useRef<Record<string, TrackPosition>>({});

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
  }, [props.activeSpaceId, props.spaceView?.backgroundText]);

  useEffect(() => {
    return () => {
      if (organizeTimerRef.current) window.clearTimeout(organizeTimerRef.current);
      if (clearAddedTimerRef.current) window.clearTimeout(clearAddedTimerRef.current);
    };
  }, []);

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
          await props.onOrganizeSpace(spaceId);
          setOrganizingSpaceId((prev) => (prev === spaceId ? null : prev));
        })();
      }, ORGANIZE_IDLE_MS);
    },
    [props]
  );

  const createSpace = useCallback(() => {
    const rawInput = newSpaceInput.trim();
    if (!rawInput) {
      setCreateSpaceHint("请输入空间标题");
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
      } finally {
        setIsCreatingSpace(false);
      }
    })();
  }, [isCreatingSpace, newSpaceInput, props]);

  const addQuestion = useCallback(
    (rawInput: string, fromSuggestion = false) => {
      if (!activeSpace) return;
      if (activeSpace.status !== "active") {
        setInputHint("该空间已只读");
        return;
      }
      const cleanedInput = rawInput.trim();
      if (!cleanedInput) {
        setInputHint("请输入内容");
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

  const freezeSpace = useCallback(() => {
    if (!activeSpace || activeSpace.status !== "active") return;
    const freezeNote = freezeNoteInput.trim().slice(0, 48);
    void (async () => {
      const result = await props.onFreezeSpace(activeSpace.id, freezeNote || null);
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
      setWriteToLifeOnFreeze(false);
      props.showNotice("空间已冻结");
    })();
  }, [activeSpace, freezeNoteInput, props, writeToLifeOnFreeze]);

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
      setPendingTrackId(trackId);
      void (async () => {
        const ok = await props.onSetActiveTrack(activeSpace.id, trackId);
        if (!ok) setPendingTrackId(null);
      })();
    },
    [activeSpace, activeTrack, props, rememberTrackPosition]
  );

  const statusLabel = activeSpace ? (activeSpace.status === "active" ? "进行中" : activeSpace.status === "frozen" ? "冻结" : "归档") : "";

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
                冻结
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
              <details className="relative" open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
                <summary className="list-none">
                  <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/10 bg-white/80 text-slate-700 hover:bg-white">
                    更多
                  </Button>
                </summary>
                <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_14px_30px_rgba(16,20,24,0.16)]">
                  <MenuItem label="背景说明" disabled={!activeSpace || activeSpace.status !== "active"} onClick={() => setBackgroundOpen(true)} />
                  <MenuItem
                    label="整理一次"
                    disabled={!activeSpace || activeSpace.status !== "active"}
                    onClick={() => activeSpace && void props.onOrganizeSpace(activeSpace.id)}
                  />
                  <MenuItem
                    label={activeSpace?.status === "archived" ? "恢复空间" : "归档空间"}
                    disabled={!activeSpace}
                    onClick={toggleArchive}
                  />
                </div>
              </details>
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
                    value={questionInput}
                    maxLength={220}
                    disabled={activeSpace.status !== "active"}
                    placeholder={activeSpace.status === "active" ? "继续输入一个疑问…" : "该空间已只读"}
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
                <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-500", inputHint ? "opacity-100" : "opacity-0")}>{inputHint}</p>
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

            <section className="grid min-h-0 overflow-hidden gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_260px] md:px-8 md:py-6">
              <div className="min-h-0 h-full min-w-0 rounded-2xl border border-black/10 bg-white/62 p-3 md:p-4 flex flex-col overflow-hidden">
                {!activeTrack ? (
                  <div className="grid h-full min-h-0 place-items-center text-sm text-slate-500">继续输入疑问，轨道会在这里展开</div>
                ) : (
                  <div
                    data-track-panel="true"
                    className={cn("h-full min-h-0 min-w-0 flex flex-col", pausedTrackIds[activeTrack.id] ? "opacity-45" : "opacity-100")}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm text-slate-700">当前轨道</p>
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
                            onFocus={() => {
                              if (!activeSpace || !activeTrack) return;
                              const container = trackScrollRef.current;
                              rememberTrackPosition(activeSpace.id, activeTrack.id, {
                                scrollTop: container?.scrollTop ?? 0,
                                focusNodeId: node.id
                              });
                            }}
                          >
                            <p className="text-[15px] leading-[1.65] text-slate-900 [overflow-wrap:anywhere]">{node.questionText}</p>
                            {node.noteText ? <p className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">附注：{node.noteText}</p> : null}
                            <div className="mt-2 flex items-center justify-between">
                              <NodeMenu
                                disabled={activeSpace.status !== "active"}
                                tracks={tracks}
                                currentTrackId={activeTrack.id}
                                paused={Boolean(pausedTrackIds[activeTrack.id])}
                                onMove={(trackId) => void props.onMoveNode(node.id, trackId)}
                                onMisplaced={() => void props.onMarkMisplaced(node.id)}
                                onDelete={() => void props.onDeleteNode(node.id)}
                                onTogglePause={() =>
                                  setPausedTrackIds((prev) => ({ ...prev, [activeTrack.id]: !prev[activeTrack.id] }))
                                }
                              />
                              {node.echoTrackId ? (
                                <button
                                  type="button"
                                  className="text-[11px] text-slate-500 transition-colors hover:text-slate-700"
                                  onClick={() => switchTrack(node.echoTrackId as string)}
                                >
                                  在其他方向也出现过
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">{node.createdAt ? node.createdAt.slice(11, 16) : ""}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

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
                        <p className="mt-1 text-[11px] text-slate-500">{track.nodeCount}个疑问</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">暂无其他方向</p>
                  )}
                </div>
              </aside>
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
              <p className="text-sm text-slate-800">创建空间</p>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setCreateSpaceOpen(false)}>
                关闭
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <input
                value={newSpaceInput}
                maxLength={160}
                className="h-10 rounded-full border border-black/12 bg-white px-4 text-sm text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
                placeholder="输入一个根问题"
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
          <div className="w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
            <p className="text-sm text-slate-800">当前状态（可选，一句话）</p>
            <input
              value={freezeNoteInput}
              maxLength={48}
              className="mt-3 h-10 w-full rounded-full border border-black/12 bg-white px-4 text-sm text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              onChange={(event) => setFreezeNoteInput(event.target.value)}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={writeToLifeOnFreeze} onChange={(event) => setWriteToLifeOnFreeze(event.target.checked)} />
              写入时间档案馆
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-black/12 text-slate-700" onClick={() => setFreezePanelOpen(false)}>
                取消
              </Button>
              <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={freezeSpace}>
                确认冻结
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
          新方向
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
  const label = status === "active" ? "进行中" : status === "frozen" ? "冻结" : "归档";
  return (
    <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-slate-700">{label}</span>
  );
}
