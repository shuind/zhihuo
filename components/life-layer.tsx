"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  type LifeDoubt,
  type LifeStore,
  type OpeningPhase,
  type StarDot,
  collapseWhitespace,
  formatDateTimeInTimeZone,
  getDateKeyInTimeZone,
  isOlderThanOneYear
} from "@/components/zhihuo-model";

type ThinkingProgress = {
  spaceId: string;
  status: "active" | "hidden";
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
};

type DateGroup = {
  key: string;
  label: string;
  items: LifeDoubt[];
};

type LinkedSpacePreview = {
  spaceId: string;
  title: string;
  firstNode: string;
  lastNode: string;
};

const EASE: [number, number, number, number] = [0.24, 0.61, 0.35, 1];

export function LifeLayer(props: {
  store: LifeStore;
  setStore: Dispatch<SetStateAction<LifeStore>>;
  timezone: string;
  linkedSpacePreview: LinkedSpacePreview | null;
  ready: boolean;
  openingPhase: OpeningPhase;
  stars: StarDot[];
  thinkingProgressByDoubt: Record<string, ThinkingProgress>;
  onJumpToThinking: (target: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null; doubtId?: string }) => void;
  onImportToThinking: (doubt: LifeDoubt) => void;
  onCreateDoubt: (rawText: string) => Promise<boolean>;
  onSaveDoubtNote: (doubtId: string, noteText: string) => Promise<boolean>;
  onDeleteDoubt: (doubtId: string) => Promise<boolean>;
  showNotice: (message: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ritualVisible, setRitualVisible] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ritualTimerRef = useRef<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const allDoubts = useMemo(
    () =>
      [...props.store.doubts]
        .filter((item) => !item.deletedAt && !item.archivedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [props.store.doubts]
  );

  const notesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const note of props.store.notes) map.set(note.doubtId, note.noteText);
    return map;
  }, [props.store.notes]);

  const selectedDoubt = useMemo(() => allDoubts.find((item) => item.id === selectedDoubtId) ?? null, [allDoubts, selectedDoubtId]);
  const isSplitView = Boolean(selectedDoubt);
  const normalizedSearch = useMemo(() => collapseWhitespace(searchQuery).toLocaleLowerCase(), [searchQuery]);

  const filteredDoubts = useMemo(() => {
    if (!normalizedSearch) return allDoubts;
    return allDoubts.filter((item) => item.rawText.toLocaleLowerCase().includes(normalizedSearch) || item.id === selectedDoubtId);
  }, [allDoubts, normalizedSearch, selectedDoubtId]);

  const groupedTimeline = useMemo<DateGroup[]>(() => {
    const groups: DateGroup[] = [];
    for (const item of filteredDoubts) {
      const key = getDateKeyInTimeZone(item.createdAt, props.timezone);
      const previous = groups[groups.length - 1];
      if (previous && previous.key === key) previous.items.push(item);
      else groups.push({ key, label: formatGroupLabel(key, props.timezone), items: [item] });
    }
    return groups;
  }, [filteredDoubts, props.timezone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!selectedDoubtId) return;
    if (allDoubts.some((item) => item.id === selectedDoubtId)) return;
    setSelectedDoubtId(null);
    setSearchQuery("");
    setMobileDetailOpen(false);
  }, [allDoubts, selectedDoubtId]);

  useEffect(() => {
    if (!isMobile) {
      setMobileDetailOpen(false);
      return;
    }
    if (selectedDoubtId) setMobileDetailOpen(true);
  }, [isMobile, selectedDoubtId]);

  useEffect(() => {
    if (!selectedDoubtId) {
      composerRef.current?.focus();
      return;
    }
    rowRefs.current[selectedDoubtId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    searchRef.current?.focus();
  }, [selectedDoubtId]);

  useEffect(() => {
    const timer = ritualTimerRef;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const saveLifeNote = useCallback(
    async (doubtId: string, noteText: string) => props.onSaveDoubtNote(doubtId, collapseWhitespace(noteText).slice(0, 42)),
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
    }, 1400);
  }, [inputValue, props]);

  const handleSelect = useCallback(
    (doubtId: string) => {
      setSelectedDoubtId(doubtId);
      if (isMobile) setMobileDetailOpen(true);
    },
    [isMobile]
  );

  const closeDetail = useCallback(() => {
    setSelectedDoubtId(null);
    setSearchQuery("");
    setMobileDetailOpen(false);
  }, []);

  const selectedProgress = selectedDoubt ? props.thinkingProgressByDoubt[selectedDoubt.id] ?? null : null;
  const matchedCount = normalizedSearch
    ? allDoubts.filter((item) => item.rawText.toLocaleLowerCase().includes(normalizedSearch)).length
    : allDoubts.length;

  return (
    <div className="time-serif relative h-full overflow-hidden" data-life-layout="true">
      <div className="pointer-events-none absolute inset-0 life-surface" />
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="grain absolute inset-0 opacity-[0.022]" />
      </div>

      <div className="relative z-10 flex h-full min-h-0">
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          animate={{ width: !isMobile && selectedDoubt ? "60%" : "100%" }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        >
          <header className="sticky top-0 z-10 bg-[rgba(2,2,3,0.82)] backdrop-blur-xl" data-life-hero="true">
            <div className="mx-auto w-full max-w-2xl px-8 lg:px-12">
              <div className="flex items-end justify-between pb-8 pt-16">
                <div className="space-y-2">
                  <h1 className="time-serif text-xl font-light tracking-[0.2em] text-[var(--time-text-strong)]">{"\u65F6\u95F4\u6863\u6848\u9986"}</h1>
                  <p className="text-xs tracking-[0.18em] text-[var(--time-text-soft)]">
                    {allDoubts.length}
                    {" \u4E2A\u95EE\u9898\u5728\u6B64\u6C89\u6DC0"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 opacity-40" aria-hidden="true">
                  <span className="h-1 w-1 rounded-full bg-[var(--time-accent)]/55" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--time-accent)]/70" />
                  <span className="h-1 w-1 rounded-full bg-[var(--time-accent)]/55" />
                </div>
              </div>

              <div className="pb-10" data-life-input-mode={isSplitView ? "search" : "compose"}>
                <div className={cn("time-input-shell relative max-w-[42rem] transition-all duration-500", fieldFocused ? "scale-[1.006]" : "")}>
                  <div
                    className="absolute -inset-3 rounded-[1.25rem] bg-white/[0.024] opacity-0 transition-opacity duration-500"
                    style={{ opacity: fieldFocused ? 1 : 0 }}
                  />
                  {!isSplitView ? (
                    <div className="relative">
                      <Textarea
                        ref={composerRef}
                        value={inputValue}
                        maxLength={280}
                        placeholder={"\u6B64\u523B\uFF0C\u5728\u60F3\u4EC0\u4E48..."}
                        data-life-composer="true"
                        className="min-h-[2.6rem] w-full resize-none border-0 bg-transparent px-0 py-0 text-[1.06rem] font-light leading-[1.95] tracking-[0.04em] text-[var(--time-text-strong)] shadow-none ring-0 placeholder:text-[var(--time-text-soft)] focus-visible:ring-0"
                        onChange={(event) => setInputValue(event.target.value)}
                        onFocus={() => setFieldFocused(true)}
                        onBlur={() => setFieldFocused(false)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void saveDoubt();
                        }}
                      />
                      <div className="mt-3 flex items-center justify-between gap-4 text-[11px] tracking-[0.14em] text-[var(--time-text-soft)]">
                        <p className={cn("transition-opacity duration-300", ritualVisible ? "opacity-100" : "opacity-0")}>{"\u5DF2\u5B58\u5165\u65F6\u95F4"}</p>
                        <div className="flex items-center gap-3">
                          <span className={cn("transition-opacity", inputValue ? "opacity-100" : "opacity-40")}>{inputValue.length}/280</span>
                          <Button type="button" variant="ghost" className="time-subtle-button rounded-full px-4 text-[11px] font-light tracking-[0.16em]" onClick={() => void saveDoubt()}>
                            {"\u5B58\u5165\u6B64\u523B"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] tracking-[0.22em] text-[var(--time-text-soft)]">{"\u68C0\u7D22"}</span>
                        <input
                          ref={searchRef}
                          value={searchQuery}
                          data-life-search="true"
                          placeholder={"\u641C\u7D22\u8FD9\u6761\u65F6\u95F4\u6CB3\u6D41\u91CC\u7684\u95EE\u9898"}
                          className="h-10 flex-1 border-0 bg-transparent px-0 text-[0.98rem] font-light tracking-[0.06em] text-[var(--time-text-strong)] outline-none placeholder:text-[var(--time-text-soft)]"
                          onChange={(event) => setSearchQuery(event.target.value)}
                          onFocus={() => setFieldFocused(true)}
                          onBlur={() => setFieldFocused(false)}
                        />
                        <Button type="button" variant="ghost" className="time-subtle-button rounded-full px-4 text-[11px] font-light tracking-[0.16em]" onClick={closeDetail}>
                          {"\u9000\u51FA\u7EC6\u8BFB"}
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-4 text-[11px] tracking-[0.14em] text-[var(--time-text-soft)]">
                        <span>{normalizedSearch ? `\u5339\u914D\u5230 ${matchedCount} \u6761\u95EE\u9898` : "\u6CBF\u65F6\u95F4\u68C0\u7D22"}</span>
                        <span>{groupedTimeline.reduce((sum, group) => sum + group.items.length, 0)} {"\u6761"}</span>
                      </div>
                    </div>
                  )}
                  <motion.div className="mt-3 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" animate={{ opacity: fieldFocused ? 0.82 : 0.3 }} transition={{ duration: 0.3 }} />
                </div>
              </div>
            </div>
          </header>

          <main className="time-list-mask flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-8 pb-32 lg:px-12" data-life-timeline="true">
              {filteredDoubts.length === 0 ? (
                <EmptyTimelineState hasSearch={Boolean(normalizedSearch)} />
              ) : (
                <div className="space-y-16">
                  {groupedTimeline.map((group) => (
                    <TimeClusterGroup
                      key={group.key}
                      label={group.label}
                      count={group.items.length}
                      items={group.items}
                      selectedId={selectedDoubtId}
                      notesMap={notesMap}
                      progressByDoubt={props.thinkingProgressByDoubt}
                      rowRefs={rowRefs}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </motion.div>

        <AnimatePresence initial={false}>
          {!isMobile && selectedDoubt ? (
            <DetailPanel
              key="detail-panel"
              doubt={selectedDoubt}
              timezone={props.timezone}
              linkedSpacePreview={props.linkedSpacePreview}
              noteText={notesMap.get(selectedDoubt.id) ?? ""}
              progress={selectedProgress}
              onClose={closeDetail}
              onDelete={() => setDeleteId(selectedDoubt.id)}
              onImport={() => props.onImportToThinking(selectedDoubt)}
              onJumpToThinking={props.onJumpToThinking}
              onSaveNote={(value) => void saveLifeNote(selectedDoubt.id, value)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isMobile && selectedDoubt && mobileDetailOpen ? (
          <MobileDetailDrawer
            key="mobile-detail-drawer"
            doubt={selectedDoubt}
            timezone={props.timezone}
            linkedSpacePreview={props.linkedSpacePreview}
            noteText={notesMap.get(selectedDoubt.id) ?? ""}
            progress={selectedProgress}
            onClose={closeDetail}
            onDelete={() => setDeleteId(selectedDoubt.id)}
            onImport={() => props.onImportToThinking(selectedDoubt)}
            onJumpToThinking={props.onJumpToThinking}
            onSaveNote={(value) => void saveLifeNote(selectedDoubt.id, value)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId ? (
          <ConfirmDialog
            title={"\u6C38\u4E45\u5220\u9664\uFF1F"}
            description={"\u5220\u9664\u540E\u4E0D\u53EF\u6062\u590D\uFF0C\u76F8\u5173\u6D3E\u751F\u5185\u5BB9\u4E5F\u4F1A\u4E00\u5E76\u6E05\u7406\u3002"}
            confirmLabel={"\u6C38\u4E45\u5220\u9664"}
            onCancel={() => setDeleteId(null)}
            onConfirm={() => {
              void (async () => {
                const ok = await props.onDeleteDoubt(deleteId);
                if (!ok) return;
                if (selectedDoubtId === deleteId) closeDetail();
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

function EmptyTimelineState(props: { hasSearch: boolean }) {
  return (
    <div className="grid min-h-[28rem] place-items-center py-12 text-center md:justify-items-start">
      <div className="max-w-md space-y-4">
        <p className="time-serif text-[28px] text-[var(--time-text)]">
          {props.hasSearch ? "\u6CA1\u6709\u627E\u5230\u76F8\u8FD1\u7684\u95EE\u9898" : "\u4ECA\u591C\u5C1A\u65E0\u843D\u7B14"}
        </p>
        <p className="text-sm leading-8 text-[var(--time-text-soft)]">
          {props.hasSearch
            ? "\u6362\u4E00\u4E2A\u8BCD\uFF0C\u518D\u6CBF\u7740\u8FD9\u6761\u65F6\u95F4\u6CB3\u6D41\u8F7B\u8F7B\u68C0\u7D22\u3002"
            : "\u5199\u4E0B\u4E00\u53E5\u60AC\u800C\u672A\u51B3\u7684\u8BDD\uFF0C\u5B83\u4F1A\u7559\u5728\u8FD9\u91CC\u3002"}
        </p>
      </div>
    </div>
  );
}

function TimeClusterGroup(props: {
  label: string;
  count: number;
  items: LifeDoubt[];
  selectedId: string | null;
  notesMap: Map<string, string>;
  progressByDoubt: Record<string, ThinkingProgress>;
  rowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="relative">
      <div
        className="sticky top-0 z-10 mb-6"
        style={{ background: "linear-gradient(180deg, rgba(2,2,3,0.98), rgba(2,2,3,0.82))" }}
        data-life-group="true"
      >
        <div className="flex items-center gap-4 py-1">
          <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--time-text-soft)]">{props.label}</span>
          <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
          <span className="text-[10px] tabular-nums text-[var(--time-text-soft)]/75">{props.count}</span>
        </div>
      </div>

      <div className="space-y-1">
        {props.items.map((item) => (
          <TimeEntryCard
            key={item.id}
            doubt={item}
            noteText={props.notesMap.get(item.id) ?? ""}
            progress={props.progressByDoubt[item.id] ?? null}
            isSelected={props.selectedId === item.id}
            rowRefs={props.rowRefs}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function TimeEntryCard(props: {
  doubt: LifeDoubt;
  noteText: string;
  progress: ThinkingProgress | null;
  isSelected: boolean;
  rowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelect: (id: string) => void;
}) {
  const statusTone = resolveStatusTone(props.progress);

  return (
    <motion.article layout className="group relative">
      <motion.div
        className="absolute -left-4 top-1/2 h-0 w-0.5 -translate-y-1/2 rounded-full bg-[var(--time-accent)]/65"
        animate={{ height: props.isSelected ? "56%" : 0, opacity: props.isSelected ? 0.78 : 0 }}
        transition={{ duration: 0.3 }}
      />

      <button
        ref={(node) => {
          props.rowRefs.current[props.doubt.id] = node;
        }}
        type="button"
        className={cn(
          "-mx-3 w-full rounded-[1.35rem] px-3 py-6 text-left transition-all duration-500",
          "hover:bg-white/[0.024]",
          props.isSelected && "bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
        )}
        data-life-item="true"
        data-life-item-selected={props.isSelected ? "true" : "false"}
        onClick={() => props.onSelect(props.doubt.id)}
      >
        <div className="flex items-start gap-4">
          <div className="relative mt-2.5 shrink-0">
            <span className={cn("time-status-dot", statusTone.dotClass)} />
          </div>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[var(--time-text)] font-light leading-[1.9] tracking-[0.04em] transition-colors duration-300",
                "group-hover:text-[var(--time-text-strong)]",
                props.isSelected && "text-[var(--time-text-strong)]"
              )}
            >
              {props.doubt.rawText}
            </p>

            <div className="mt-4 flex items-center gap-4 text-[11px] tracking-[0.14em] text-[var(--time-text-soft)]">
              <time>{formatRelativeTime(props.doubt.createdAt)}</time>
              {props.progress ? <span>{props.progress.status === "active" ? "\u6709\u5EF6\u7EED" : statusTone.label}</span> : null}
              {props.noteText ? <span>{"\u6709\u6CE8\u8BB0"}</span> : null}
            </div>
          </div>

          <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-300", "opacity-0 group-hover:opacity-100")}>
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="transition-transform duration-300">
              <path d="M1 1L5 5L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30" />
            </svg>
          </div>
        </div>
      </button>
    </motion.article>
  );
}

function DetailPanel(props: {
  doubt: LifeDoubt;
  timezone: string;
  linkedSpacePreview: LinkedSpacePreview | null;
  noteText: string;
  progress: ThinkingProgress | null;
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onJumpToThinking: (target: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null; doubtId?: string }) => void;
  onSaveNote: (value: string) => void;
}) {
  return (
    <motion.aside
      className="time-detail-shell time-detail-scroll hidden h-full min-h-0 w-[40%] min-w-[560px] max-w-[760px] flex-col overflow-y-auto lg:flex"
      data-life-detail="desktop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <DetailBody {...props} />
    </motion.aside>
  );
}

function MobileDetailDrawer(props: {
  doubt: LifeDoubt;
  timezone: string;
  linkedSpacePreview: LinkedSpacePreview | null;
  noteText: string;
  progress: ThinkingProgress | null;
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onJumpToThinking: (target: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null; doubtId?: string }) => void;
  onSaveNote: (value: string) => void;
}) {
  return (
    <motion.section
      className="absolute inset-0 z-30 bg-black/45 backdrop-blur-sm lg:hidden"
      data-life-detail="mobile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={props.onClose}
    >
      <motion.div
        className="time-sheet absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-[2rem] border border-b-0 border-white/8 pb-8 shadow-[0_-24px_80px_rgba(0,0,0,0.44)]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.34, ease: EASE }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-white/10" />
        <DetailBody {...props} compact />
      </motion.div>
    </motion.section>
  );
}

function DetailBody(props: {
  doubt: LifeDoubt;
  timezone: string;
  linkedSpacePreview: LinkedSpacePreview | null;
  noteText: string;
  progress: ThinkingProgress | null;
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onJumpToThinking: (target: { spaceId: string; mode: "root" | "freeze" | "milestone"; trackId?: string | null; nodeId?: string | null; doubtId?: string }) => void;
  onSaveNote: (value: string) => void;
  compact?: boolean;
}) {
  const continueTarget = props.progress?.reentry.freezeEntry
    ? {
        spaceId: props.progress.reentry.freezeEntry.spaceId,
        mode: "freeze" as const,
        trackId: props.progress.reentry.freezeEntry.trackId,
        nodeId: props.progress.reentry.freezeEntry.nodeId
      }
    : props.progress?.reentry.questionEntry
      ? { spaceId: props.progress.reentry.questionEntry.spaceId, mode: "root" as const }
      : props.progress
        ? { spaceId: props.progress.spaceId, mode: "root" as const }
        : null;
  const canEditNote = isOlderThanOneYear(props.doubt.createdAt);
  const actionLabel = continueTarget ? "\u56DE\u5230\u8FD9\u6BB5\u601D\u8DEF" : "\u5E26\u5165\u601D\u8003";
  const fallbackTrackNodes = useMemo(() => {
    if (!props.progress) return [];
    return [
      ...(props.progress.milestonePreviews ?? []),
      ...(props.progress.reentry.milestoneEntries.map((entry) => entry.preview ?? "").filter(Boolean) as string[]),
      props.progress.reentry.freezeEntry?.preview ?? ""
    ]
      .map((item) => item.trim())
      .filter((item, index, source) => item.length > 0 && source.indexOf(item) === index);
  }, [props.progress]);
  const matchedLinkedSpacePreview =
    props.linkedSpacePreview && props.progress?.spaceId && props.linkedSpacePreview.spaceId === props.progress.spaceId
      ? props.linkedSpacePreview
      : null;
  const firstTrackNode =
    props.doubt.firstNodePreview?.trim() ||
    matchedLinkedSpacePreview?.firstNode ||
    fallbackTrackNodes[0] ||
    "";
  const lastTrackNode =
    props.doubt.lastNodePreview?.trim() ||
    matchedLinkedSpacePreview?.lastNode ||
    fallbackTrackNodes[fallbackTrackNodes.length - 1] ||
    firstTrackNode;
  const shouldShowTrackEdgeSummary = Boolean(props.progress && firstTrackNode);
  const shouldShowLastTrackNode = Boolean(lastTrackNode);

  const handlePrimaryAction = () => {
    if (continueTarget) {
      props.onJumpToThinking({ ...continueTarget, doubtId: props.doubt.id });
      return;
    }
    props.onImport();
  };

  return (
    <div className={cn("flex h-full flex-col", props.compact && "px-6 pt-4 md:px-8")}>
      <div className={cn("flex items-center justify-between border-b border-white/8 px-8 py-6", props.compact && "px-0")}>
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--time-accent)]/60" />
          <span className="text-xs uppercase tracking-[0.28em] text-[var(--time-text)]/80">{"\u7EC6\u8282"}</span>
        </div>
        <button type="button" className="-m-2 p-2 text-[var(--time-text)]/78 transition-colors hover:text-[var(--time-text-strong)]" onClick={props.onClose}>
          {"\u5173\u95ED"}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={props.doubt.id}
          className={cn("flex-1 overflow-y-auto px-8 py-10", props.compact ? "px-0 py-6" : "")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mb-12">
            <p className="text-[25px] font-light leading-relaxed tracking-wide text-[var(--time-text-strong)] md:text-[31px]" data-life-selected-title="true">
              {props.doubt.rawText}
            </p>
          </div>

        <div className="mb-12 flex flex-wrap items-center gap-6 text-xs text-[var(--time-text)]/74">
          <span>{formatDateTimeInTimeZone(props.doubt.createdAt, props.timezone)}</span>
          {props.progress?.status === "active" ? <span className="text-[var(--time-accent)]/85">{"\u601D\u8003\u4E2D"}</span> : null}
        </div>

          <div className="mb-12 h-px bg-gradient-to-r from-white/16 via-white/8 to-transparent" />

          {props.noteText ? (
            <div className="mb-10">
              <h3 className="mb-4 text-[10px] uppercase tracking-[0.2em] text-[var(--time-text)]/72">{"\u6CE8\u8BB0"}</h3>
              <p className="border-l-2 border-white/15 pl-4 text-sm italic leading-relaxed text-[var(--time-text)]/92">{props.noteText}</p>
            </div>
          ) : null}

          {props.progress ? (
            <div className="mb-10">
              {shouldShowTrackEdgeSummary ? (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-[var(--time-text)]/94">最初：{firstTrackNode}</p>
                  {shouldShowLastTrackNode ? (
                    <p className="text-sm leading-relaxed text-[var(--time-text)]/94">最后：{lastTrackNode}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mb-10" />
          )}

          {canEditNote ? (
            <div className="mb-10">
              <h3 className="mb-4 text-[10px] uppercase tracking-[0.2em] text-[var(--time-text)]/72">{"\u7ED9\u90A3\u65F6\u7684\u81EA\u5DF1"}</h3>
              <input
                defaultValue={props.noteText}
                maxLength={42}
                placeholder={"\u7559\u4E00\u53E5\u8BDD"}
                className="h-11 w-full border-0 border-b border-white/8 bg-transparent px-0 text-[16px] text-[var(--time-text-strong)] outline-none transition-colors placeholder:text-[var(--time-text-soft)] focus:border-[var(--time-accent)]/22"
                onBlur={(event) => props.onSaveNote(event.target.value)}
              />
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className={cn("border-t border-white/8 px-8 py-6", props.compact && "px-0")}>
        <div className="flex items-center gap-4">
          <button type="button" className="flex-1 rounded-lg bg-[var(--time-accent-soft)] px-4 py-3 text-sm text-[var(--time-text-strong)] transition-all duration-300 hover:bg-[var(--time-accent)]/18" onClick={handlePrimaryAction}>
            {actionLabel}
          </button>
          <button type="button" className="rounded-lg px-4 py-3 text-sm text-[var(--time-text-soft)] transition-all duration-300 hover:bg-white/[0.04] hover:text-[var(--time-text)]" onClick={props.onDelete}>
            {"\u5220\u9664"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog(props: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <motion.section className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="w-full max-w-md rounded-[1.8rem] border border-white/8 bg-[rgba(5,5,7,0.94)] px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.36)]">
        <div className="space-y-3">
          <h3 className="time-serif text-2xl text-[var(--time-text-strong)]">{props.title}</h3>
          <p className="text-sm leading-8 text-[var(--time-text-soft)]">{props.description}</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" className="time-subtle-button rounded-full px-4 text-[11px] font-light tracking-[0.16em]" onClick={props.onCancel}>
            {"\u53D6\u6D88"}
          </Button>
          <Button type="button" variant="ghost" className="rounded-full border border-[var(--time-accent)]/22 bg-[var(--time-accent-soft)] px-4 text-[11px] font-light tracking-[0.16em] text-[var(--time-text-strong)] hover:bg-[var(--time-accent)]/18" onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

function LifeOpeningOverlay(props: { phase: OpeningPhase; stars: StarDot[] }) {
  const { phase } = props;
  return (
    <motion.div className="absolute inset-0 z-20 bg-black" initial={{ opacity: 1 }} animate={{ opacity: phase === "ready" ? 0 : 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
      <div className="absolute inset-0 grid place-items-center">
        <p className={cn("time-serif text-lg tracking-[0.28em] text-white/74 transition-opacity duration-700", phase === "text" ? "opacity-100" : "opacity-0")}>
          {"\u65F6\u95F4\u6B63\u5728\u663E\u5F71"}
        </p>
      </div>
    </motion.div>
  );
}

function formatGroupLabel(dateKey: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const date = new Date(year, month - 1, day);
  const todayKey = getDateKeyInTimeZone(new Date().toISOString(), timeZone);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map((value) => Number(value));
  const todayStart = new Date(todayYear, todayMonth - 1, todayDay).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const deltaDays = Math.round((todayStart - targetStart) / (24 * 60 * 60 * 1000));

  if (deltaDays === 0) return "\u4ECA\u5929";
  if (deltaDays === 1) return "\u6628\u5929";
  return `${month} \u6708 ${day} \u65E5`;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} \u5929\u524D`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} \u4E2A\u6708\u524D`;
  const years = Math.floor(months / 12);
  return `${years} \u5E74\u524D`;
}

function resolveStatusTone(progress: ThinkingProgress | null) {
  if (!progress) {
    return { label: "\u9759\u7F6E\u4E2D", detail: "\u5C1A\u672A\u8FDB\u5165\u601D\u8003\u5C42", dotClass: "time-status-dot--muted" };
  }
  if (progress.status === "active") {
    return { label: "\u601D\u8003\u4E2D", detail: "\u4ECD\u5728\u5EF6\u7EED", dotClass: "time-status-dot--active" };
  }
  return { label: "\u5DF2\u5199\u56DE\u65F6\u95F4", detail: "\u53EF\u91CD\u65B0\u8FDB\u5165", dotClass: "" };
}
