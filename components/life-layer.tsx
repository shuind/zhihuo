"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type WheelEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  type LifeDoubt,
  type LifeRange,
  type LifeStore,
  type OpeningPhase,
  type StarDot,
  collapseWhitespace,
  formatDateTime,
  isOlderThanOneYear,
  pickPlaybackRoute,
  sleep
} from "@/components/zhihuo-model";

type DateGroup = {
  dateKey: string;
  items: LifeDoubt[];
};

const LIFE_TOKENS = {
  axisX: "42%",
  axisWidthPx: 1.5,
  nodeSizePx: 8,
  sameDayGapPx: 12,
  groupGapMinPx: 36,
  groupGapMaxPx: 56,
  readableCount: 2
} as const;

const LIFE_MOTION = {
  beat: 600,
  fade: 360,
  expand: 860,
  dim: 400,
  settle: 600,
  archiveSink: 840,
  wheelDampingMin: 420
} as const;

const LIFE_EASE: [number, number, number, number] = [0.24, 0.61, 0.35, 1];

export function LifeLayer(props: {
  store: LifeStore;
  setStore: Dispatch<SetStateAction<LifeStore>>;
  ready: boolean;
  openingPhase: OpeningPhase;
  stars: StarDot[];
  thinkingProgressByDoubt: Record<
    string,
    {
      spaceId: string;
      status: "active" | "frozen" | "archived";
      freezeNote: string | null;
      milestonePreviews: string[];
      reentry: {
        questionEntry: { spaceId: string; rootQuestionText: string } | null;
        freezeEntry: {
          spaceId: string;
          trackId: string | null;
          nodeId: string | null;
          preview: string | null;
          freezeNote: string | null;
          frozenAt: string | null;
        } | null;
        milestoneEntries: Array<{ spaceId: string; trackId: string | null; nodeId: string | null; preview: string | null }>;
      };
    }
  >;
  onJumpToThinking: (target: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null }) => void;
  onImportToThinking: (doubt: LifeDoubt) => void;
  onCreateDoubt: (rawText: string) => Promise<boolean>;
  onArchiveDoubt: (doubtId: string) => Promise<boolean>;
  onSaveDoubtNote: (doubtId: string, noteText: string) => Promise<boolean>;
  onDeleteDoubt: (doubtId: string) => Promise<boolean>;
  showNotice: (message: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [range, setRange] = useState<LifeRange>("month");
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ritualVisible, setRitualVisible] = useState(false);
  const [playbackRunning, setPlaybackRunning] = useState(false);
  const [playbackHighlightId, setPlaybackHighlightId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dangerMenuId, setDangerMenuId] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const ritualTimerRef = useRef<number | null>(null);
  const archiveTimerRef = useRef<number | null>(null);
  const playbackStartedRef = useRef(false);
  const wheelMotionRef = useRef<{ rafId: number | null; target: number; current: number; startedAt: number }>({
    rafId: null,
    target: 0,
    current: 0,
    startedAt: 0
  });

  const allDoubts = useMemo(
    () =>
      [...props.store.doubts]
        .filter((item) => !item.deletedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [props.store.doubts]
  );
  const activeDoubts = useMemo(() => allDoubts.filter((item) => !item.archivedAt), [allDoubts]);
  const archivedDoubts = useMemo(() => allDoubts.filter((item) => Boolean(item.archivedAt)), [allDoubts]);

  const filteredDoubts = useMemo(() => {
    const base = showArchived ? archivedDoubts : activeDoubts;
    if (range === "all") return base;
    const now = Date.now();
    const span = range === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return base.filter((item) => now - new Date(item.createdAt).getTime() <= span);
  }, [activeDoubts, archivedDoubts, range, showArchived]);

  const notesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const note of props.store.notes) {
      map.set(note.doubtId, note.noteText);
    }
    return map;
  }, [props.store.notes]);

  const detailDoubt = useMemo(() => allDoubts.find((item) => item.id === detailId) ?? null, [allDoubts, detailId]);

  const groupedTimeline = useMemo<DateGroup[]>(() => {
    const groups: DateGroup[] = [];
    for (const item of filteredDoubts) {
      const dateKey = formatAxisDate(item.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) {
        last.items.push(item);
      } else {
        groups.push({ dateKey, items: [item] });
      }
    }
    return groups;
  }, [filteredDoubts]);

  const idToDateMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groupedTimeline) {
      for (const item of group.items) {
        map.set(item.id, group.dateKey);
      }
    }
    return map;
  }, [groupedTimeline]);

  const hoveredDateKey = hoveredId ? idToDateMap.get(hoveredId) ?? null : null;
  const playbackDateKey = playbackHighlightId ? idToDateMap.get(playbackHighlightId) ?? null : null;

  const readableSet = useMemo(() => {
    if (!filteredDoubts.length) return new Set<string>();
    if (expandedId) return new Set([expandedId]);
    if (playbackRunning && playbackHighlightId) return new Set([playbackHighlightId]);

    const center = scrollTop + (viewportHeight || 1) * 0.44;
    const ranked = filteredDoubts
      .map((item) => {
        const node = rowRefs.current[item.id];
        const y = node ? node.offsetTop + node.clientHeight * 0.5 : 0;
        return { id: item.id, dist: Math.abs(y - center) };
      })
      .sort((a, b) => a.dist - b.dist);

    return new Set(ranked.slice(0, LIFE_TOKENS.readableCount).map((item) => item.id));
  }, [expandedId, filteredDoubts, playbackHighlightId, playbackRunning, scrollTop, viewportHeight]);

  const toggleArchive = useCallback(
    async (id: string) => {
      const target = allDoubts.find((item) => item.id === id);
      if (!target) return false;
      setMenuOpenId(null);
      setDangerMenuId(null);

      if (target.archivedAt || showArchived) {
        return props.onArchiveDoubt(id);
      }

      setArchivingId(id);
      if (archiveTimerRef.current) window.clearTimeout(archiveTimerRef.current);
      return await new Promise<boolean>((resolve) => {
        archiveTimerRef.current = window.setTimeout(() => {
          void (async () => {
            const ok = await props.onArchiveDoubt(id);
            setArchivingId((prev) => (prev === id ? null : prev));
            archiveTimerRef.current = null;
            resolve(ok);
          })();
        }, LIFE_MOTION.archiveSink);
      });
    },
    [allDoubts, props, showArchived]
  );

  const saveLifeNote = useCallback(
    async (doubtId: string, noteText: string) => {
      const normalized = collapseWhitespace(noteText).slice(0, 42);
      return props.onSaveDoubtNote(doubtId, normalized);
    },
    [props]
  );

  const saveDoubt = useCallback(async () => {
    const text = collapseWhitespace(inputValue);
    if (!text) return;
    const ok = await props.onCreateDoubt(text);
    if (!ok) return;
    setInputValue("");
    setRitualVisible(true);
    if (ritualTimerRef.current) window.clearTimeout(ritualTimerRef.current);
    ritualTimerRef.current = window.setTimeout(() => {
      setRitualVisible(false);
      ritualTimerRef.current = null;
    }, 1200);
  }, [inputValue, props]);

  const runAutoPlayback = useCallback(async (source: LifeDoubt[]) => {
    if (!source.length) return;
    setPlaybackRunning(true);
    setPlaybackHighlightId(null);
    const ascending = [...source].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const route = pickPlaybackRoute(ascending);
    for (let i = 0; i < route.length; i += 1) {
      const doubt = route[i];
      setPlaybackHighlightId(doubt.id);
      rowRefs.current[doubt.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (i === 0) await sleep(1500);
      else if (i === route.length - 1) await sleep(1300);
      else await sleep(1200);
    }
    setPlaybackHighlightId(null);
    setPlaybackRunning(false);
  }, []);

  useEffect(() => {
    if (!props.ready || playbackStartedRef.current || props.store.meta.twelvePlaybackSeen) return;
    if (activeDoubts.length < 12) return;
    playbackStartedRef.current = true;
    props.setStore((prev) => ({ ...prev, meta: { ...prev.meta, twelvePlaybackSeen: true } }));
    void runAutoPlayback(activeDoubts);
  }, [activeDoubts, props, runAutoPlayback]);

  useEffect(() => {
    const ritualTimer = ritualTimerRef;
    const archiveTimer = archiveTimerRef;
    const wheelMotion = wheelMotionRef;
    return () => {
      if (ritualTimer.current) {
        window.clearTimeout(ritualTimer.current);
      }
      if (archiveTimer.current) {
        window.clearTimeout(archiveTimer.current);
      }
      if (wheelMotion.current.rafId) {
        window.cancelAnimationFrame(wheelMotion.current.rafId);
      }
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const h = listViewportRef.current?.clientHeight ?? 0;
      setViewportHeight(h);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    if (!filteredDoubts.some((item) => item.id === expandedId)) setExpandedId(null);
  }, [expandedId, filteredDoubts]);

  const animateWheelScroll = useCallback((timestamp: number) => {
    const viewport = listViewportRef.current;
    if (!viewport) {
      wheelMotionRef.current.rafId = null;
      return;
    }
    const state = wheelMotionRef.current;
    state.current += (state.target - state.current) * 0.16;
    viewport.scrollTop = state.current;
    const settled = Math.abs(state.target - state.current) <= 0.6;
    const elapsed = timestamp - state.startedAt;
    if (settled && elapsed >= LIFE_MOTION.wheelDampingMin) {
      viewport.scrollTop = state.target;
      state.current = state.target;
      state.rafId = null;
      return;
    }
    state.rafId = window.requestAnimationFrame(animateWheelScroll);
  }, []);

  const handleDampedWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const viewport = listViewportRef.current;
      if (!viewport) return;
      event.preventDefault();

      const state = wheelMotionRef.current;
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (!state.rafId) {
        state.current = viewport.scrollTop;
        state.target = viewport.scrollTop;
      }
      state.target = Math.max(0, Math.min(maxScroll, state.target + event.deltaY));
      state.startedAt = performance.now();
      if (!state.rafId) {
        state.rafId = window.requestAnimationFrame(animateWheelScroll);
      }
    },
    [animateWheelScroll]
  );

  return (
    <div className="relative h-full overflow-hidden px-4 pb-6 pt-4 md:px-8">
      <div className="life-grain pointer-events-none absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-56 bg-gradient-to-b from-sky-700/10 to-transparent" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
        <section className="relative rounded-2xl border border-slate-300/12 bg-slate-950/45 p-4 shadow-[0_18px_46px_rgba(1,7,16,0.45)] backdrop-blur">
          <div className="mb-3 flex min-h-[20px] items-center justify-between gap-3">
            <p className="text-xs tracking-[0.2em] text-slate-300/86">时间档案馆</p>
            <p className="text-xs text-slate-400/70">只记录时间，不解释意义</p>
          </div>
          <Textarea
            ref={composerRef}
            value={inputValue}
            maxLength={280}
            placeholder="把此刻的疑问放进来"
            className="min-h-[104px] resize-none rounded-xl border-slate-300/20 bg-slate-900/45 text-[15px] leading-[1.8] text-slate-100 placeholder:text-slate-400/60 focus-visible:ring-slate-300/40"
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => (event.ctrlKey || event.metaKey) && event.key === "Enter" && void saveDoubt()}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className={cn("text-xs text-slate-200/40 transition-opacity duration-300", ritualVisible ? "opacity-100" : "opacity-0")}>
              已存入时间。
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400/70">{inputValue.length}/280</span>
              <Button
                type="button"
                className="rounded-full border border-slate-300/25 bg-slate-900/75 px-5 text-sm tracking-[0.08em] text-slate-100 hover:bg-slate-800/90"
                onClick={() => void saveDoubt()}
              >
                放进去
              </Button>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-300/12 bg-slate-950/35 p-1">
            <RangeChip active={range === "week"} onClick={() => setRange("week")} label="近一周" />
            <RangeChip active={range === "month"} onClick={() => setRange("month")} label="近一月" />
            <RangeChip active={range === "all"} onClick={() => setRange("all")} label="全部" />
          </div>
          <RangeChip active={showArchived} onClick={() => setShowArchived((prev) => !prev)} label={showArchived ? "查看主视图" : "查看归档"} />
          {playbackRunning ? <p className="ml-2 text-xs text-slate-300/60">时间回放中…</p> : null}
        </section>

        <section
          className={cn(
            "relative overflow-hidden rounded-2xl border border-slate-300/10 bg-slate-950/24 p-3 md:p-4",
            expandedId ? "bg-slate-950/30" : "",
            filteredDoubts.length === 0 ? "h-[48vh]" : "min-h-0 flex-1"
          )}
        >
          <div
            className={cn("pointer-events-none absolute inset-0 z-[6] bg-black/5 opacity-0", expandedId ? "opacity-100" : "opacity-0")}
            style={{ transitionDuration: `${LIFE_MOTION.dim}ms`, transitionTimingFunction: "cubic-bezier(0.24, 0.61, 0.35, 1)" }}
          />
          <div
            ref={listViewportRef}
            className="life-scroll relative z-[8] h-full overflow-y-auto pr-1"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onWheel={handleDampedWheel}
          >
            {filteredDoubts.length === 0 ? (
              <EmptyTimelineState showArchived={showArchived} />
            ) : (
              <ol className="relative mx-auto w-full max-w-5xl pb-20 pt-4">
                <span
                  className="pointer-events-none absolute bottom-0 top-0 -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-300/25 to-transparent"
                  style={{ left: LIFE_TOKENS.axisX, width: `${LIFE_TOKENS.axisWidthPx}px` }}
                />
                {groupedTimeline.map((group, groupIndex) => {
                  const first = group.items[0];
                  const prevGroupLast = groupIndex > 0 ? groupedTimeline[groupIndex - 1].items.at(-1) ?? null : null;
                  const groupGap = resolveTimelineGroupGap(prevGroupLast, first);
                  const nodeActive = group.dateKey === hoveredDateKey || group.dateKey === playbackDateKey;

                  return (
                    <li key={group.dateKey} style={{ marginTop: groupGap }} className="relative">
                      <div className="relative min-h-[22px]">
                        <span
                          className={cn(
                            "absolute top-[7px] -translate-x-1/2 rounded-full border transition-colors",
                            nodeActive ? "border-slate-200/65 bg-slate-200/45" : "border-slate-300/45 bg-slate-300/22"
                          )}
                          style={{
                            left: LIFE_TOKENS.axisX,
                            width: `${LIFE_TOKENS.nodeSizePx}px`,
                            height: `${LIFE_TOKENS.nodeSizePx}px`,
                            transitionDuration: `${LIFE_MOTION.fade}ms`,
                            transitionTimingFunction: "cubic-bezier(0.24, 0.61, 0.35, 1)"
                          }}
                        />
                        <p className="pl-[calc(42%+1rem)] text-[11px] tracking-[0.16em] text-slate-300/64">{group.dateKey}</p>
                      </div>

                      <ul className="space-y-3 pl-[calc(42%+1rem)] pr-1 md:pr-10" style={{ rowGap: `${LIFE_TOKENS.sameDayGapPx}px` }}>
                        {group.items.map((item) => {
                          const note = notesMap.get(item.id);
                          const progress = props.thinkingProgressByDoubt[item.id];
                          const playbackFocus = playbackHighlightId === item.id;
                          const expanded = expandedId === item.id;
                          const readable = readableSet.has(item.id);
                          const primaryFocus = playbackFocus || expanded || (!expandedId && readable);
                          const secondaryFocus = !expandedId && !primaryFocus && hoveredId === item.id;
                          const receding = !primaryFocus && !secondaryFocus;
                          const archiving = archivingId === item.id;

                          return (
                            <li
                              key={item.id}
                              ref={(node) => {
                                rowRefs.current[item.id] = node;
                              }}
                              className="relative"
                              onMouseEnter={() => setHoveredId(item.id)}
                              onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                            >
                              <article
                                className={cn(
                                  "cursor-pointer rounded-xl px-4 py-3 transition-[opacity,background-color,transform,filter]",
                                  expanded ? "relative z-20 bg-slate-100/[0.042]" : "bg-slate-100/[0.028]",
                                  receding ? "opacity-55 blur-[0.25px]" : secondaryFocus ? "opacity-70" : "opacity-100",
                                  archiving ? "translate-y-2 brightness-90 opacity-40" : ""
                                )}
                                style={{
                                  transitionDuration: expanded ? `${LIFE_MOTION.expand}ms` : `${LIFE_MOTION.fade}ms`,
                                  transitionTimingFunction: "cubic-bezier(0.24, 0.61, 0.35, 1)"
                                }}
                                onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <p className="text-[11px] tracking-[0.08em] text-slate-400/74">
                                    {formatDateTime(item.createdAt).slice(11)}
                                    {item.archivedAt ? " · 已归档" : ""}
                                  </p>
                                  {progress ? (
                                    <button
                                      type="button"
                                      className="rounded-full border border-slate-300/30 px-2 py-0.5 text-[10px] text-slate-300/80 hover:bg-slate-900/45"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        props.onJumpToThinking({
                                          spaceId: progress.spaceId,
                                          mode: "root"
                                        });
                                      }}
                                    >
                                      已思考
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="rounded-full px-2 py-0.5 text-xs text-slate-400/72 transition-colors hover:bg-slate-900/45 hover:text-slate-300/85"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setMenuOpenId((prevOpen) => {
                                        const next = prevOpen === item.id ? null : item.id;
                                        if (next !== item.id) setDangerMenuId(null);
                                        return next;
                                      });
                                    }}
                                  >
                                    ...
                                  </button>
                                </div>

                                <p
                                  className={cn(
                                    "transition-[font-size,opacity,filter] duration-300",
                                    expanded ? "life-clamp-none text-[19px] leading-[1.88] text-slate-100" : "",
                                    primaryFocus && !expanded ? "life-clamp-2 text-[15px] leading-[1.8] text-slate-100/84" : "",
                                    !primaryFocus && !expanded ? "life-clamp-1 text-[14px] leading-[1.72] text-slate-300/64" : ""
                                  )}
                                >
                                  {item.rawText}
                                </p>
                                {note && primaryFocus ? (
                                  <p
                                    className={cn(
                                      "mt-2 text-xs leading-[1.74] text-slate-300/55 transition-opacity",
                                      expanded ? "opacity-100" : "opacity-80"
                                    )}
                                  >
                                    注记：{note}
                                  </p>
                                ) : null}
                                {expanded && progress ? (
                                  <div className="mt-2 rounded-lg border border-slate-300/20 bg-slate-900/45 px-3 py-2 text-xs text-slate-300/78">
                                    <p className="text-[11px] text-slate-300/72">{progress.status === "frozen" ? "这段思考停在这里" : "这段思考还在进行中"}</p>
                                    {progress.freezeNote ? <p className="mt-1 line-clamp-2">上次停下时：{progress.freezeNote}</p> : null}
                                    <div className="mt-2 border-t border-slate-300/10 pt-2">
                                      <p className="text-[11px] text-slate-300/68">再次进入</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {progress.reentry.questionEntry ? (
                                          <button
                                            type="button"
                                            className="rounded-full border border-slate-300/20 px-2.5 py-1 text-[11px] text-slate-200 transition-colors hover:bg-slate-900/60"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              props.onJumpToThinking({
                                                spaceId: progress.reentry.questionEntry?.spaceId ?? progress.spaceId,
                                                mode: "root"
                                              });
                                            }}
                                          >
                                            从当时的问题进入
                                          </button>
                                        ) : null}
                                        {progress.reentry.freezeEntry ? (
                                          <button
                                            type="button"
                                            className="rounded-full border border-slate-300/20 px-2.5 py-1 text-[11px] text-slate-200 transition-colors hover:bg-slate-900/60"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              props.onJumpToThinking({
                                                spaceId: progress.reentry.freezeEntry?.spaceId ?? progress.spaceId,
                                                mode: "freeze",
                                                trackId: progress.reentry.freezeEntry?.trackId ?? null,
                                                nodeId: progress.reentry.freezeEntry?.nodeId ?? null
                                              });
                                            }}
                                          >
                                            从上次停下的地方进入
                                          </button>
                                        ) : null}
                                        {progress.reentry.milestoneEntries.map((entry) => (
                                          <button
                                            key={`${entry.spaceId}:${entry.nodeId ?? entry.preview ?? "milestone"}`}
                                            type="button"
                                            className="rounded-full border border-slate-300/20 px-2.5 py-1 text-[11px] text-slate-200 transition-colors hover:bg-slate-900/60"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              props.onJumpToThinking({
                                                spaceId: entry.spaceId,
                                                mode: "milestone",
                                                trackId: entry.trackId,
                                                nodeId: entry.nodeId
                                              });
                                            }}
                                          >
                                            {entry.preview ? `从关键节点进入 · ${entry.preview}` : "从关键节点进入"}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </article>

                              <AnimatePresence>
                                {menuOpenId === item.id ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: -2 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -2 }}
                                    transition={{ duration: LIFE_MOTION.fade / 1000, ease: LIFE_EASE }}
                                    className="absolute right-2 top-11 z-30 grid gap-1 rounded-md border border-slate-400/20 bg-slate-950/94 p-1.5"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <MenuAction
                                      label="查看详情"
                                      onClick={() => {
                                        setDetailId(item.id);
                                        setMenuOpenId(null);
                                        setDangerMenuId(null);
                                      }}
                                    />
                                    <MenuAction label={item.archivedAt ? "恢复到主视图" : "归档"} onClick={() => void toggleArchive(item.id)} />
                                    <MenuAction label="更多…" onClick={() => setDangerMenuId((prev) => (prev === item.id ? null : item.id))} />
                                    {dangerMenuId === item.id ? (
                                      <div className="mt-1 border-t border-slate-300/15 pt-1">
                                        <MenuAction
                                          label="永久删除（不可恢复）"
                                          danger
                                          onClick={() => {
                                            setDeleteId(item.id);
                                            setMenuOpenId(null);
                                            setDangerMenuId(null);
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {detailDoubt ? (
          <LifeDetailModal
            doubt={detailDoubt}
            noteText={notesMap.get(detailDoubt.id) ?? ""}
            onClose={() => setDetailId(null)}
            onArchiveToggle={() => void toggleArchive(detailDoubt.id)}
            onDelete={() => setDeleteId(detailDoubt.id)}
            onImport={() => props.onImportToThinking(detailDoubt)}
            onSaveNote={(value) => void saveLifeNote(detailDoubt.id, value)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId ? (
          <ConfirmDialog
            title="永久删除？"
            description="删除后不可恢复，相关派生结构会一并清理。"
            confirmLabel="永久删除"
            onCancel={() => setDeleteId(null)}
            onConfirm={() => {
              void (async () => {
                const ok = await props.onDeleteDoubt(deleteId);
                if (!ok) return;
                if (detailId === deleteId) setDetailId(null);
                setDeleteId(null);
              })();
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>{!props.ready ? <LifeOpeningOverlay phase={props.openingPhase} stars={props.stars} /> : null}</AnimatePresence>
    </div>
  );
}

function formatAxisDate(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year} · ${month} · ${day}`;
}

function resolveTimelineGroupGap(previous: LifeDoubt | null, current: LifeDoubt) {
  if (!previous) return 0;
  const hours = Math.abs(new Date(previous.createdAt).getTime() - new Date(current.createdAt).getTime()) / (1000 * 60 * 60);
  const blend = Math.min(1, hours / 72);
  return Math.round(LIFE_TOKENS.groupGapMinPx + (LIFE_TOKENS.groupGapMaxPx - LIFE_TOKENS.groupGapMinPx) * blend);
}

function EmptyTimelineState(props: { showArchived: boolean }) {
  return (
    <div className="relative mx-auto h-full w-full max-w-5xl">
      <span
        className="pointer-events-none absolute bottom-10 top-10 -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-300/20 to-transparent"
        style={{ left: LIFE_TOKENS.axisX, width: `${LIFE_TOKENS.axisWidthPx}px` }}
      />
      <span
        className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300/42 bg-slate-300/18"
        style={{ left: LIFE_TOKENS.axisX, width: `${LIFE_TOKENS.nodeSizePx}px`, height: `${LIFE_TOKENS.nodeSizePx}px` }}
      />
      <p className="absolute left-[calc(42%+32px)] top-1/2 -translate-y-1/2 text-sm tracking-[0.08em] text-slate-300/42">
        {props.showArchived ? "归档处仍无回声" : "今夜尚无落笔"}
      </p>
    </div>
  );
}

function LifeOpeningOverlay(props: { phase: OpeningPhase; stars: StarDot[] }) {
  return (
    <motion.div
      className="absolute inset-0 z-20 bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: props.phase === "ready" ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0">
        {props.phase === "stars" || props.phase === "text" ? (
          <div className="absolute inset-0">
            {props.stars.map((star, index) => (
              <span
                key={`${star.left}-${star.top}-${index}`}
                className={cn("life-star absolute rounded-full bg-slate-200", star.large ? "h-1.5 w-1.5" : "h-1 w-1")}
                style={{
                  left: `${star.left}%`,
                  top: `${star.top}%`,
                  opacity: star.opacity,
                  animationDelay: `${star.delay}s`,
                  animationDuration: `${star.duration}s`
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <p
          className={cn(
            "text-sm tracking-[0.28em] text-slate-200/76 transition-opacity duration-700",
            props.phase === "text" ? "opacity-100" : "opacity-0"
          )}
        >
          你一直在走
        </p>
      </div>
    </motion.div>
  );
}

function RangeChip(props: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3 py-1 text-xs tracking-[0.08em] transition-colors",
        props.active
          ? "border-slate-300/45 bg-slate-900/70 text-slate-100"
          : "border-slate-300/18 bg-slate-900/35 text-slate-300/70 hover:bg-slate-900/60 hover:text-slate-100"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function MenuAction(props: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md px-3 py-1.5 text-left text-xs transition-colors",
        props.danger ? "text-slate-200/86 hover:bg-slate-800/78" : "text-slate-200/90 hover:bg-slate-800/80"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function LifeDetailModal(props: {
  doubt: LifeDoubt;
  noteText: string;
  onClose: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onImport: () => void;
  onSaveNote: (value: string) => void;
}) {
  return (
    <motion.section
      className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Card className="w-full max-w-2xl border-slate-400/20 bg-slate-950/95 text-slate-100">
        <CardHeader>
          <CardTitle className="text-base tracking-[0.06em]">条目详情</CardTitle>
          <CardDescription className="text-slate-300/65">{formatDateTime(props.doubt.createdAt)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[15px] leading-[1.86] text-slate-100">{props.doubt.rawText}</p>
          {isOlderThanOneYear(props.doubt.createdAt) ? (
            <div className="space-y-2 border-t border-slate-300/15 pt-3">
              <p className="text-xs text-slate-300/66">给当时的自己留一句话（可选）</p>
              <input
                defaultValue={props.noteText}
                maxLength={42}
                className="h-9 w-full rounded-md border border-slate-400/25 bg-slate-900/50 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
                onBlur={(event) => props.onSaveNote(event.target.value)}
              />
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 bg-slate-900/40 text-slate-100 hover:bg-slate-800/75"
            onClick={props.onImport}
          >
            带着它进入思路
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 bg-slate-900/40 text-slate-100 hover:bg-slate-800/75"
            onClick={props.onArchiveToggle}
          >
            {props.doubt.archivedAt ? "恢复" : "归档"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 bg-slate-900/40 text-slate-200/90 hover:bg-slate-800/70"
            onClick={props.onDelete}
          >
            删除
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 bg-slate-900/40 text-slate-100 hover:bg-slate-800/75"
            onClick={props.onClose}
          >
            关闭
          </Button>
        </CardFooter>
      </Card>
    </motion.section>
  );
}

function ConfirmDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.section
      className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Card className="w-full max-w-md border-slate-400/20 bg-slate-950/95 text-slate-100">
        <CardHeader>
          <CardTitle className="text-base">{props.title}</CardTitle>
          <CardDescription className="text-slate-300/70">{props.description}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 text-slate-100"
            onClick={props.onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-slate-300/25 bg-slate-900/50 text-slate-200/92"
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </motion.section>
  );
}

