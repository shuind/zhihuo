"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  type LifeDoubt,
  type LifeNote,
  type LifeNoteSaveOptions,
  type LifeStore,
  type OpeningPhase,
  type StarDot,
  LIFE_NOTE_MAX_LENGTH,
  collapseWhitespace,
  formatDateTimeInTimeZone,
  getDateKeyInTimeZone
} from "@/components/zhihuo-model";
import { LetterPaper, type PaperVariant } from "@/components/letter/letter-paper";
import { describeSolarTerm, getCurrentSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { poetize } from "@/lib/letter-poetize";
import { suggestVariant } from "@/components/letter/letter-exporter-dialog";
import { loadLetterSealText, loadLetterVariant } from "@/lib/letter-variant-store";

type DateGroup = {
  key: string;
  label: string;
  items: LifeDoubt[];
};

const EASE_GENTLE: [number, number, number, number] = [0.2, 0.72, 0.22, 1];
const REFLECTION_CONTINUE_WINDOW_MS = 10 * 60 * 1000;
const FIRST_DOUBT_EXAMPLE = "为什么我总在真正开始前犹豫？";

export function LifeLayer(props: {
  store: LifeStore;
  setStore: Dispatch<SetStateAction<LifeStore>>;
  timezone: string;
  ready: boolean;
  openingPhase: OpeningPhase;
  stars: StarDot[];
  onImportToThinking: (doubt: LifeDoubt) => void;
  onCreateDoubt: (rawText: string) => Promise<boolean>;
  onSaveDoubtNote: (doubtId: string, noteText: string, options?: LifeNoteSaveOptions) => Promise<boolean>;
  onDeleteDoubt: (doubtId: string) => Promise<boolean>;
  editable?: boolean;
  showNotice: (message: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ritualVisible, setRitualVisible] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileSearchMode, setMobileSearchMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
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

  const notesByDoubtMap = useMemo(() => {
    const map = new Map<string, LifeNote[]>();
    for (const note of props.store.notes) {
      const list = map.get(note.doubtId);
      if (list) list.push(note);
      else map.set(note.doubtId, [note]);
    }
    for (const [doubtId, notes] of map) map.set(doubtId, sortReflectionNotes(notes));
    return map;
  }, [props.store.notes]);

  const latestNotesMap = useMemo(() => {
    const map = new Map<string, LifeNote>();
    for (const [doubtId, notes] of notesByDoubtMap) {
      const latest = notes[0];
      if (latest) map.set(doubtId, latest);
    }
    return map;
  }, [notesByDoubtMap]);

  const latestNoteTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [doubtId, note] of latestNotesMap) map.set(doubtId, note.noteText);
    return map;
  }, [latestNotesMap]);

  const selectedDoubt = useMemo(() => allDoubts.find((item) => item.id === selectedDoubtId) ?? null, [allDoubts, selectedDoubtId]);
  const isSplitView = Boolean(selectedDoubt);
  const showSearchInput = !isMobile ? isSplitView : Boolean(selectedDoubt && mobileSearchMode);
  const normalizedSearch = useMemo(() => collapseWhitespace(searchQuery).toLocaleLowerCase(), [searchQuery]);
  const showFirstDoubtGuide = props.ready && allDoubts.length === 0 && !props.store.meta.firstDoubtGuideDismissedAt && !showSearchInput;

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
    const sync = () => {
      setIsMobile(media.matches);
      setDeviceReady(true);
    };
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
    setMobileSearchMode(false);
  }, [allDoubts, selectedDoubtId]);

  useEffect(() => {
    if (!isMobile) {
      setMobileDetailOpen(false);
      setMobileSearchMode(false);
      return;
    }
    if (selectedDoubtId && !mobileSearchMode) setMobileDetailOpen(true);
  }, [isMobile, selectedDoubtId, mobileSearchMode]);

  useEffect(() => {
    if (!deviceReady) return;
    if (!selectedDoubtId) {
      if (!isMobile) composerRef.current?.focus();
      return;
    }
    rowRefs.current[selectedDoubtId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (!isMobile || mobileSearchMode) searchRef.current?.focus();
  }, [selectedDoubtId, isMobile, mobileSearchMode, deviceReady]);

  useEffect(() => {
    const timer = ritualTimerRef;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const saveLifeNote = useCallback(
    async (doubtId: string, noteText: string, options?: LifeNoteSaveOptions) =>
      props.onSaveDoubtNote(doubtId, collapseWhitespace(noteText).slice(0, LIFE_NOTE_MAX_LENGTH), options),
    [props]
  );

  const dismissFirstDoubtGuide = useCallback(() => {
    props.setStore((prev) =>
      prev.meta.firstDoubtGuideDismissedAt
        ? prev
        : {
            ...prev,
            meta: {
              ...prev.meta,
              firstDoubtGuideDismissedAt: new Date().toISOString()
            }
          }
    );
  }, [props]);

  const fillFirstDoubtExample = useCallback(() => {
    setInputValue(FIRST_DOUBT_EXAMPLE);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, []);

  const saveDoubt = useCallback(async () => {
    if (props.editable === false) {
      props.showNotice("当前正在同步，稍后再写");
      return;
    }
    const text = collapseWhitespace(composerRef.current?.value ?? inputValue);
    if (!text) return;
    const ok = await props.onCreateDoubt(text);
    if (!ok) return;
    dismissFirstDoubtGuide();
    setInputValue("");
    setRitualVisible(true);
    if (ritualTimerRef.current) window.clearTimeout(ritualTimerRef.current);
    ritualTimerRef.current = window.setTimeout(() => {
      setRitualVisible(false);
      ritualTimerRef.current = null;
    }, 1400);
  }, [dismissFirstDoubtGuide, inputValue, props]);

  const handleSelect = useCallback(
    (doubtId: string) => {
      setSelectedDoubtId(doubtId);
      if (isMobile) {
        setMobileSearchMode(false);
        setMobileDetailOpen(true);
      }
    },
    [isMobile]
  );

  const openMobileSearch = useCallback(() => {
    if (!isMobile || !selectedDoubtId) return;
    setMobileDetailOpen(false);
    setMobileSearchMode(true);
  }, [isMobile, selectedDoubtId]);

  const backToMobileDetail = useCallback(() => {
    if (!isMobile || !selectedDoubtId) return;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setMobileSearchMode(false);
    setMobileDetailOpen(true);
  }, [isMobile, selectedDoubtId]);

  const closeDetail = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setSelectedDoubtId(null);
    setSearchQuery("");
    setMobileDetailOpen(false);
    setMobileSearchMode(false);
    setFieldFocused(false);
  }, []);

  const matchedCount = normalizedSearch
    ? allDoubts.filter((item) => item.rawText.toLocaleLowerCase().includes(normalizedSearch)).length
    : allDoubts.length;

  return (
    <div className="time-serif relative h-full overflow-hidden" data-life-layout="true">
      <div className="pointer-events-none absolute inset-0 life-surface" />
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="grain absolute inset-0 opacity-[0.012]" />
      </div>

      <div className="relative z-10 flex h-full min-h-0">
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          animate={{ width: !isMobile && selectedDoubt ? "60%" : "100%" }}
          transition={{ duration: 0.64, ease: EASE_GENTLE }}
        >
          <header className="sticky top-0 z-10 overflow-hidden" data-life-hero="true">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[17.5rem] life-hero-glow" />
            <div className="mx-auto w-full max-w-2xl px-8 lg:px-12">
              <div className="flex items-end justify-between pb-8 pt-16">
                <div className="space-y-2">
                  <h1
                    className="time-serif text-[1.35rem] font-normal tracking-[0.1em] text-[var(--life-title-amber)] [text-shadow:0_1px_0_rgba(246,239,226,0.02)]"
                  >
                    {"\u65F6\u95F4\u6863\u6848\u9986"}
                  </h1>
                  <p className="text-[13px] tracking-[0.08em] text-[var(--life-title-amber-soft)]">
                    {allDoubts.length}
                    {" \u7F15\u601D\u7EEA\u5728\u6B64\u6C89\u6DC0"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 opacity-40" aria-hidden="true">
                  <span className="h-1 w-1 rounded-full bg-[var(--time-accent)]/55" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--time-accent)]/70" />
                  <span className="h-1 w-1 rounded-full bg-[var(--time-accent)]/55" />
                </div>
              </div>

              <div className="pb-10" data-life-input-mode={showSearchInput ? "search" : "compose"}>
                <div className="time-input-shell relative max-w-[46rem] transition-all duration-700">
                  {!showSearchInput ? (
                    <div className="relative">
                      <Textarea
                        ref={composerRef}
                        value={inputValue}
                        maxLength={280}
                        placeholder={"\u6B64\u523B\uFF0C\u5728\u60F3\u4EC0\u4E48..."}
                        data-life-composer="true"
                        data-zh-input="multiline"
                        autoResize
                        maxAutoHeight={220}
                        disabled={props.editable === false}
                        className={cn(
                          "min-h-[2.6rem] max-h-[220px] w-full border-0 bg-transparent px-0 py-0 text-[0.95rem] font-light leading-[1.95] tracking-[0.03em] text-[var(--time-text-strong)] shadow-none ring-0 transition-colors duration-500 focus-visible:ring-0",
                          fieldFocused
                            ? "placeholder:text-[rgba(150,145,138,0.52)] hover:placeholder:text-[rgba(150,145,138,0.52)]"
                            : "placeholder:text-[rgba(124,129,132,0.4)] hover:placeholder:text-[rgba(124,129,132,0.4)]"
                        )}
                        onChange={(event) => setInputValue(event.target.value)}
                        onFocus={() => setFieldFocused(true)}
                        onBlur={() => setFieldFocused(false)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.shiftKey) return;
                          event.preventDefault();
                          void saveDoubt();
                        }}
                      />
                      <div className="mt-3 flex items-center justify-between gap-4 text-[11px] tracking-[0.14em] text-[var(--time-text-soft)]">
                        <p className={cn("transition-opacity duration-700", ritualVisible ? "opacity-100" : "opacity-0")}>{"\u5DF2\u5B58\u5165\u65F6\u95F4"}</p>
                        <div className="flex items-center gap-3">
                          <span className={cn("transition-opacity duration-700", inputValue ? "opacity-100" : "opacity-40")}>{inputValue.length}/280</span>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={props.editable === false}
                            className="time-subtle-button life-compose-button rounded-full px-4 text-[11px] font-light tracking-[0.16em]"
                            onClick={() => void saveDoubt()}
                          >
                            {"\u5B58\u5165\u6B64\u523B"}
                          </Button>
                        </div>
                      </div>
                      {showFirstDoubtGuide ? (
                        <motion.div
                          data-first-doubt-guide="true"
                          className="mt-5 rounded-2xl border border-white/[0.055] bg-white/[0.025] px-4 py-4 text-[var(--time-text)] shadow-[0_18px_48px_rgba(0,0,0,0.16)] backdrop-blur"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.42, ease: EASE_GENTLE }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="text-[15px] leading-7 tracking-[0.03em] text-[rgba(222,226,225,0.88)]">
                                把想不明白的问题，先放在这里。
                              </p>
                              <button
                                type="button"
                                className="text-left text-[12px] leading-6 tracking-[0.06em] text-[rgba(175,183,184,0.68)] transition-colors duration-500 hover:text-[rgba(220,226,229,0.86)]"
                                onClick={fillFirstDoubtExample}
                              >
                                例如：{FIRST_DOUBT_EXAMPLE}
                              </button>
                            </div>
                            <button
                              type="button"
                              className="-m-2 p-2 text-[12px] tracking-[0.08em] text-[rgba(146,154,154,0.58)] transition-colors duration-500 hover:text-[rgba(220,226,229,0.8)]"
                              onClick={dismissFirstDoubtGuide}
                            >
                              知道了
                            </button>
                          </div>
                        </motion.div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="relative pt-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] tracking-[0.1em] text-[var(--time-text-soft)]">{"\u63A2\u7D22"}</span>
                        <input
                          ref={searchRef}
                          value={searchQuery}
                          data-life-search="true"
                          placeholder={"\u8FD9\u6761\u65F6\u95F4\u6CB3\u6D41..."}
                          className="h-10 flex-1 border-0 bg-transparent px-0 text-[0.92rem] font-light tracking-[0.05em] text-[rgba(186,192,196,0.73)] outline-none placeholder:text-[rgba(130,136,140,0.46)]"
                          onChange={(event) => setSearchQuery(event.target.value)}
                          onFocus={() => setFieldFocused(true)}
                          onBlur={() => setFieldFocused(false)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="time-subtle-button rounded-full px-4 text-[11px] font-light tracking-[0.16em]"
                          onClick={isMobile ? backToMobileDetail : closeDetail}
                        >
                          {isMobile ? "\u8FD4\u56DE\u7EC6\u8BFB" : "\u9000\u51FA\u7EC6\u8BFB"}
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-4 text-[12px] tracking-[0.06em] text-[var(--time-text-soft)]">
                        <span>{normalizedSearch ? `\u5339\u914D\u5230 ${matchedCount} \u6761\u95EE\u9898` : ""}</span>
                      </div>
                    </div>
                  )}
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
                      mode={!isMobile && !isSplitView ? "home-desktop" : !isMobile ? "split" : "mobile"}
                      selectedId={selectedDoubtId}
                      notesMap={latestNoteTextMap}
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
              notes={notesByDoubtMap.get(selectedDoubt.id) ?? []}
              onClose={closeDetail}
              onDelete={() => setDeleteId(selectedDoubt.id)}
              onImport={() => props.onImportToThinking(selectedDoubt)}
              onSaveNote={(value, options) => void saveLifeNote(selectedDoubt.id, value, options)}
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
            notes={notesByDoubtMap.get(selectedDoubt.id) ?? []}
            onOpenSearch={openMobileSearch}
            onClose={closeDetail}
            onDelete={() => setDeleteId(selectedDoubt.id)}
            onImport={() => props.onImportToThinking(selectedDoubt)}
            onSaveNote={(value, options) => void saveLifeNote(selectedDoubt.id, value, options)}
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
  mode: "home-desktop" | "split" | "mobile";
  selectedId: string | null;
  notesMap: Map<string, string>;
  rowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelect: (id: string) => void;
}) {
  const selectedIndex = props.selectedId ? props.items.findIndex((entry) => entry.id === props.selectedId) : -1;

  return (
    <section className="relative">
      <div className="life-river-list" data-life-mode={props.mode}>
        {props.items.map((item, index) => (
          <TimeEntryCard
            key={item.id}
            doubt={item}
            noteText={props.notesMap.get(item.id) ?? ""}
            mode={props.mode}
            isSelected={props.selectedId === item.id}
            isAdjacent={selectedIndex >= 0 && Math.abs(selectedIndex - index) === 1}
            itemIndex={index}
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
  mode: "home-desktop" | "split" | "mobile";
  isSelected: boolean;
  isAdjacent: boolean;
  itemIndex: number;
  rowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onSelect: (id: string) => void;
}) {
  const driftOffsets = [0, 6, 2, 8, 3, 7];
  const driftOffset = props.mode === "home-desktop" ? 0 : driftOffsets[props.itemIndex % driftOffsets.length];

  return (
    <motion.article
      layout
      className="group life-river-item relative"
      data-life-mode={props.mode}
      data-life-adjacent={props.isAdjacent ? "true" : "false"}
      data-life-selected={props.isSelected ? "true" : "false"}
      style={{ marginLeft: `${driftOffset}px` }}
    >
      <motion.div
        className="absolute left-[2px] top-1/2 h-0 w-px -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(196,203,206,0.2),rgba(255,255,255,0))]"
        animate={{
          height: props.isSelected ? (props.mode === "home-desktop" ? "42%" : "34%") : props.isAdjacent ? "14%" : "0%",
          opacity: props.isSelected ? (props.mode === "home-desktop" ? 0.3 : 0.17) : props.isAdjacent ? 0.07 : 0,
        }}
        transition={{ duration: 0.64, ease: EASE_GENTLE }}
      />

      <button
        ref={(node) => {
          props.rowRefs.current[props.doubt.id] = node;
        }}
        type="button"
        className={cn(
          "life-pearl-card -mx-2 w-full rounded-[1.25rem] px-3 py-5 text-left transition-all duration-700 cursor-default",
          props.isAdjacent && "is-adjacent",
          props.isSelected && "is-selected"
        )}
        data-life-item="true"
        data-life-item-selected={props.isSelected ? "true" : "false"}
        onClick={() => props.onSelect(props.doubt.id)}
      >
        <div className="relative z-10 flex items-start gap-4">
          <div className="relative flex h-[1.96rem] shrink-0 items-center">
            <span className={cn("time-status-dot", "time-status-dot--plain")} />
          </div>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[var(--time-text)] text-[1.02rem] font-light leading-[1.92] tracking-[0.015em] transition-colors duration-700",
                props.mode === "home-desktop" && "text-[rgba(168,174,176,0.7)]",
                props.mode === "home-desktop" && "group-hover:text-[rgba(202,208,210,0.9)]",
                props.mode === "split" && !props.isSelected && "text-[rgba(162,168,172,0.74)]",
                props.mode === "split" && !props.isSelected && "group-hover:text-[rgba(172,178,182,0.78)]",
                props.mode === "split" && props.isSelected && "text-[rgba(188,195,199,0.84)]",
                props.mode !== "split" && props.isAdjacent && "text-[var(--time-text)]/84",
                props.mode !== "split" && props.isSelected && "text-[var(--time-text-strong)]"
              )}
            >
              {props.doubt.rawText}
            </p>

            {props.noteText ? (
              <p className="mt-2 line-clamp-2 text-[13px] leading-[1.72] text-[rgba(194,201,205,0.68)]">
                {props.noteText}
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-4 text-[12px] tracking-[0.04em] text-[var(--time-text-soft)]">
              <time className="life-time-meta transition-colors duration-700">{formatRelativeTime(props.doubt.createdAt)}</time>
              {props.noteText ? <span>{"\u6709\u56DE\u770B"}</span> : null}
            </div>
          </div>
        </div>
      </button>
    </motion.article>
  );
}

function DetailPanel(props: {
  doubt: LifeDoubt;
  timezone: string;
  notes: LifeNote[];
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onSaveNote: (value: string, options?: LifeNoteSaveOptions) => void;
}) {
  return (
    <motion.aside
      className="time-detail-shell relative z-40 hidden h-full min-h-0 w-[40%] min-w-[560px] max-w-[760px] flex-col overflow-hidden lg:flex"
      data-life-detail="desktop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.56, ease: EASE_GENTLE }}
    >
      <DetailBody {...props} />
    </motion.aside>
  );
}

function MobileDetailDrawer(props: {
  doubt: LifeDoubt;
  timezone: string;
  notes: LifeNote[];
  onOpenSearch: () => void;
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onSaveNote: (value: string, options?: LifeNoteSaveOptions) => void;
}) {
  return (
    <motion.section
      className="absolute inset-0 z-40 bg-black/40 lg:hidden"
      data-life-detail="mobile"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.52, ease: EASE_GENTLE }}
      onClick={props.onClose}
    >
      <motion.div
        className="time-sheet absolute bottom-0 left-0 right-0 flex h-[82vh] max-h-[82vh] flex-col overflow-hidden rounded-t-[2rem] border border-b-0 border-white/8 pb-6 shadow-[0_-24px_80px_rgba(0,0,0,0.44)]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.62, ease: EASE_GENTLE }}
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
  notes: LifeNote[];
  onOpenSearch?: () => void;
  onClose: () => void;
  onDelete: () => void;
  onImport: () => void;
  onSaveNote: (value: string, options?: LifeNoteSaveOptions) => void;
  compact?: boolean;
}) {
  const reflectionNotes = useMemo(() => sortReflectionNotes(props.notes), [props.notes]);
  const latestReflectionNote = reflectionNotes[0] ?? null;
  const canContinueLatestReflection = Boolean(
    latestReflectionNote && Date.now() - new Date(latestReflectionNote.createdAt).getTime() <= REFLECTION_CONTINUE_WINDOW_MS
  );
  const currentEditableNote = canContinueLatestReflection ? latestReflectionNote : null;
  const currentNoteText = currentEditableNote?.noteText ?? "";
  const saveNote = props.onSaveNote;
  const firstTrackNode = collapseWhitespace(props.doubt.firstNodePreview ?? "");
  const lastTrackNode = collapseWhitespace(props.doubt.lastNodePreview ?? firstTrackNode);
  const storedLetterLines = useMemo(
    () => (props.doubt.letterLines ?? []).map((line) => line.trim()).filter(Boolean),
    [props.doubt.letterLines]
  );
  const [letterPreviewOpen, setLetterPreviewOpen] = useState(false);
  const [reflectionHistoryOpen, setReflectionHistoryOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(currentNoteText);

  useEffect(() => {
    setLetterPreviewOpen(false);
    setReflectionHistoryOpen(false);
  }, [props.doubt.id]);

  useEffect(() => {
    setNoteDraft(currentNoteText);
  }, [props.doubt.id, currentEditableNote?.id, currentNoteText]);

  const writtenAt = useMemo(() => new Date(props.doubt.createdAt), [props.doubt.createdAt]);
  const dateLabel = useMemo(
    () => `${writtenAt.getFullYear()} / ${writtenAt.getMonth() + 1} / ${writtenAt.getDate()}`,
    [writtenAt]
  );
  const solarTermLabel = useMemo(() => describeSolarTerm(writtenAt), [writtenAt]);
  const solarTermName = useMemo(() => getCurrentSolarTerm(writtenAt).name, [writtenAt]);
  const moon = useMemo(() => getMoonPhase(writtenAt), [writtenAt]);

  const thoughtTraceItems = useMemo(
    () =>
      [
        { label: "初", text: firstTrackNode },
        { label: "终", text: lastTrackNode && lastTrackNode !== firstTrackNode ? lastTrackNode : "" }
      ].filter((item) => item.text),
    [firstTrackNode, lastTrackNode]
  );
  const hasThoughtTrace = thoughtTraceItems.length > 0;
  const hasSettledLetter = Boolean(
    storedLetterLines.length ||
      firstTrackNode ||
      lastTrackNode ||
      props.doubt.letterTitle ||
      props.doubt.letterVariant ||
      props.doubt.letterSealText
  );
  const letterLines = useMemo(() => {
    if (storedLetterLines.length) return storedLetterLines;
    return thoughtTraceItems.map((item) => item.text);
  }, [storedLetterLines, thoughtTraceItems]);
  const useLongPaper = letterLines.length > 4 || letterLines.some((line) => line.length > 36);

  const letterVariant = useMemo<PaperVariant>(
    () => (props.doubt.letterVariant as PaperVariant | null) ?? loadLetterVariant(props.doubt.id) ?? suggestVariant(writtenAt, true),
    [props.doubt.id, props.doubt.letterVariant, writtenAt]
  );
  const ornamentSealText = useMemo(
    () => props.doubt.letterSealText ?? loadLetterSealText(props.doubt.id) ?? "知",
    [props.doubt.id, props.doubt.letterSealText]
  );

  const poetizedLetter = useMemo(
    () => poetize({ doubt: props.doubt.rawText, nodes: letterLines }),
    [props.doubt.rawText, letterLines]
  );

  const letterPaperRef = useRef<HTMLDivElement>(null);

  const handleSaveLetter = useCallback(async () => {
    if (!letterPaperRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(letterPaperRef.current, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: "transparent"
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `zhihuo-jian-${writtenAt.getTime()}.png`;
    a.click();
  }, [writtenAt]);

  const commitNote = useCallback(() => {
    const next = collapseWhitespace(noteDraft).slice(0, LIFE_NOTE_MAX_LENGTH);
    if (!currentEditableNote && !next) return;
    if (next === currentNoteText) return;
    setNoteDraft(next);
    saveNote(next, { noteId: currentEditableNote?.id ?? null });
  }, [currentEditableNote, currentNoteText, noteDraft, saveNote]);

  const handlePrimaryAction = () => {
    props.onClose();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        props.onImport();
      });
      return;
    }
    props.onImport();
  };

  const latestEchoNote = canContinueLatestReflection ? reflectionNotes[1] ?? null : latestReflectionNote;
  const noteStateLabel = currentEditableNote ? "继续这次回看" : latestReflectionNote ? "写下新的回看" : "等待回看";
  const reflectionCount = reflectionNotes.length;
  const letterHint = storedLetterLines.length
    ? `${storedLetterLines.length} 行沉淀`
    : hasThoughtTrace
      ? "来自思考首尾"
      : "沉淀样式";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn("flex items-center justify-between px-8 pb-5 pt-[5.75rem]", props.compact && "px-6 pb-4 pt-4 md:px-8")}>
        <div className="flex items-center gap-4">
          <span className="text-[12px] uppercase tracking-[0.12em] text-[rgba(120,126,130,0.52)]">{"\u7EC6\u8282"}</span>
          {hasSettledLetter ? (
            <button
              type="button"
              onClick={() => setLetterPreviewOpen(true)}
              className="rounded-full border border-white/[0.055] bg-white/[0.018] px-3 py-1.5 text-[12px] tracking-[0.08em] text-[rgba(181,189,194,0.66)] transition-colors duration-500 hover:border-white/[0.09] hover:text-[rgba(220,226,229,0.84)]"
            >
              沉淀笺
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {props.compact && props.onOpenSearch ? (
            <button type="button" className="text-[11px] tracking-[0.1em] text-[var(--time-text-soft)] transition-colors duration-500 hover:text-[var(--time-text)]" onClick={props.onOpenSearch}>
              {"\u68C0\u7D22"}
            </button>
          ) : null}
          <button type="button" className="-m-2 p-2 text-[var(--time-text)]/78 transition-colors duration-700 hover:text-[var(--time-text-strong)]" onClick={props.onClose}>
            {"\u5173\u95ED"}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={props.doubt.id}
          className={cn("time-detail-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-4", props.compact && "px-6 pb-6 pt-3 md:px-8")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.48, ease: EASE_GENTLE }}
        >
          <div className="space-y-8 pb-4">
            <section className="space-y-5">
              <div className="flex flex-wrap items-center gap-4 text-[12px] tracking-[0.04em] text-[rgba(126,132,136,0.42)]">
                <time>{formatDateTimeInTimeZone(props.doubt.createdAt, props.timezone)}</time>
                <span>{hasThoughtTrace ? "来自思考沉淀" : "时间切片"}</span>
              </div>
              <p className="max-w-[580px] text-[17px] font-light leading-[1.78] tracking-[0.01em] text-[rgba(210,217,220,0.86)] md:text-[23px]" data-life-selected-title="true">
                {props.doubt.rawText}
              </p>

              {hasThoughtTrace ? (
                <div className="mt-7 max-w-[560px] space-y-3 border-l border-white/[0.055] pl-5">
                  <p className="text-[11px] tracking-[0.12em] text-[rgba(132,140,146,0.45)]">思考首尾</p>
                  {thoughtTraceItems.map((item) => (
                    <div key={item.label} className="grid grid-cols-[1.8rem_1fr] gap-3 text-[13px] leading-[1.84] text-[rgba(160,168,173,0.66)]">
                      <span className="text-[rgba(130,138,144,0.5)]">{item.label}</span>
                      <p>{item.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={cn("relative max-w-[560px]", !props.compact && "ml-auto")}>
              <div className="absolute -left-3 top-5 hidden h-12 w-px bg-[rgba(191,206,214,0.22)] md:block" />
              <div className="rounded-[1.1rem] border border-white/[0.055] bg-white/[0.018] px-5 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.14)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[12px] tracking-[0.1em] text-[rgba(218,225,229,0.86)]">回看札记</h3>
                    <span className="text-[11px] tracking-[0.08em] text-[rgba(132,140,146,0.48)]">{noteStateLabel}</span>
                  </div>
                  <span className="text-[11px] tabular-nums tracking-[0.04em] text-[rgba(132,140,146,0.4)]">{noteDraft.length}/{LIFE_NOTE_MAX_LENGTH}</span>
                </div>
                {latestEchoNote ? (
                  <div className="mt-4 border-l border-white/[0.055] pl-4">
                    <div className="mb-1.5 flex items-center gap-3 text-[11px] tracking-[0.08em] text-[rgba(132,140,146,0.44)]">
                      <span>最近回看</span>
                      <time>{formatDateTimeInTimeZone(latestEchoNote.createdAt, props.timezone)}</time>
                    </div>
                    <p className="text-[14px] leading-[1.78] text-[rgba(180,188,193,0.7)]">{latestEchoNote.noteText}</p>
                  </div>
                ) : null}
                <Textarea
                  value={noteDraft}
                  maxLength={LIFE_NOTE_MAX_LENGTH}
                  rows={3}
                  autoResize
                  maxAutoHeight={180}
                  data-zh-input="multiline"
                  placeholder={"现在回看这件事时，留下这一层的话。"}
                  className="mt-3 min-h-[6.4rem] border-0 bg-transparent px-0 py-0 text-[16px] leading-[1.9] text-[rgba(205,212,216,0.88)] outline-none placeholder:text-[rgba(136,144,149,0.44)] focus-visible:ring-0"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onBlur={commitNote}
                />
                {reflectionCount > 1 ? (
                  <div className="mt-4 border-t border-white/[0.035] pt-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-[12px] tracking-[0.08em] text-[rgba(146,154,160,0.54)] transition-colors duration-500 hover:text-[rgba(202,210,214,0.78)]"
                      onClick={() => setReflectionHistoryOpen((open) => !open)}
                    >
                      <span>{`回看过 ${reflectionCount} 次`}</span>
                      <span>{reflectionHistoryOpen ? "收起回声" : "展开回声"}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {reflectionHistoryOpen ? (
                        <motion.div
                          className="mt-4 space-y-4 border-l border-white/[0.045] pl-4"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.28, ease: EASE_GENTLE }}
                        >
                          {reflectionNotes.map((note, index) => (
                            <div key={note.id} className="relative">
                              <span className="absolute -left-[1.13rem] top-2 h-1.5 w-1.5 rounded-full bg-[rgba(184,194,200,0.34)]" />
                              <div className="flex flex-wrap items-center gap-3 text-[11px] tracking-[0.08em] text-[rgba(132,140,146,0.44)]">
                                <time>{formatDateTimeInTimeZone(note.createdAt, props.timezone)}</time>
                                {index === 0 ? <span>最近</span> : null}
                              </div>
                              <p className="mt-1.5 text-[13px] leading-[1.78] text-[rgba(176,184,190,0.68)]">{note.noteText}</p>
                            </div>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>
            </section>

          </div>
        </motion.div>
      </AnimatePresence>

      <div className={cn("border-t border-white/[0.025] px-8 py-5", props.compact && "px-6 md:px-8")}>
        <div className="flex items-center justify-center gap-8">
          <button type="button" className="text-sm tracking-[0.08em] text-[rgba(192,199,204,0.72)] transition-colors duration-700 hover:text-[rgba(220,226,229,0.9)]" onClick={handlePrimaryAction}>
            {"\u5E26\u5165\u601D\u8003"}
          </button>
          <button type="button" className="text-sm tracking-[0.08em] text-[rgba(140,148,153,0.48)] transition-colors duration-700 hover:text-[rgba(174,182,187,0.7)]" onClick={props.onDelete}>
            {"\u5220\u9664"}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {letterPreviewOpen && hasSettledLetter ? (
          <motion.div
            className="absolute inset-0 z-50 flex min-h-0 flex-col bg-[rgba(5,7,10,0.985)]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.44, ease: EASE_GENTLE }}
          >
            <div className={cn("flex items-center justify-between px-8 pb-5 pt-[5.75rem]", props.compact && "px-6 pb-4 pt-5 md:px-8")}>
              <div className="space-y-1">
                <p className="text-[12px] uppercase tracking-[0.12em] text-[rgba(120,126,130,0.52)]">沉淀笺</p>
                <p className="text-[11px] tracking-[0.08em] text-[rgba(144,152,158,0.46)]">{letterHint}</p>
              </div>
              <div className="flex items-center gap-4">
                <button type="button" className="text-[11px] tracking-[0.1em] text-[var(--time-text-soft)] transition-colors duration-500 hover:text-[var(--time-text)]" onClick={handleSaveLetter}>
                  {"\u4FDD\u5B58"}
                </button>
                <button type="button" className="-m-2 p-2 text-[var(--time-text)]/78 transition-colors duration-700 hover:text-[var(--time-text-strong)]" onClick={() => setLetterPreviewOpen(false)}>
                  收起
                </button>
              </div>
            </div>
            <div className={cn("time-detail-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8", props.compact && "px-4 md:px-6")}>
              <div className="mx-auto flex min-h-full w-full items-start justify-center py-3 md:items-center md:py-5">
                <div
                  className={cn(
                    "w-full",
                    useLongPaper
                      ? "max-w-[520px]"
                      : "max-w-[min(420px,calc((100dvh-220px)*0.75))]"
                  )}
                >
                  <LetterPaper
                    ref={letterPaperRef}
                    variant={letterVariant}
                    title={props.doubt.letterTitle || poetizedLetter.title || props.doubt.rawText}
                    lines={letterLines}
                    dateLabel={dateLabel}
                    solarTermLabel={solarTermLabel}
                    moon={moon}
                    authorName="shuind"
                    ornamentSealText={ornamentSealText}
                    sealVisible
                    sealDateLabel={dateLabel}
                    sealSolarTerm={solarTermName}
                    size={useLongPaper ? "long" : "standard"}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ConfirmDialog(props: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <motion.section
      className="absolute inset-0 z-40 grid place-items-center bg-black/56 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.44, ease: EASE_GENTLE }}
    >
      <div className="w-full max-w-md rounded-[1.8rem] border border-white/[0.08] bg-[rgba(8,10,12,0.94)] px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.22)]">
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
    <motion.div
      className="absolute inset-0 z-20 bg-[radial-gradient(120%_100%_at_50%_24%,rgba(84,103,109,0.22),rgba(2,2,3,1)_64%)]"
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "ready" ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: EASE_GENTLE }}
    >
      <div className="absolute inset-0 grid place-items-center">
        <p className={cn("time-serif text-lg tracking-[0.28em] text-white/74 transition-opacity duration-700", phase === "text" ? "opacity-100" : "opacity-0")}>
          {"\u65F6\u95F4\u6B63\u5728\u663E\u5F71"}
        </p>
      </div>
    </motion.div>
  );
}

function sortReflectionNotes(notes: LifeNote[]) {
  return [...notes].sort((a, b) => {
    const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (Number.isFinite(byDate) && byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
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

