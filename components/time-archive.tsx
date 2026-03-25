"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LifeLayer } from "@/components/life-layer";
import { SettingsLayer } from "@/components/settings-layer";
import { ThinkingLayer, type ThinkingSpaceView } from "@/components/thinking-layer";
import {
  type LayerTab,
  type LifeDoubt,
  type LifeNote,
  type ThinkingSpace,
  type ThinkingScratchItem,
  type ThinkingSpaceMeta,
  type TrackDirectionHint,
  type ThinkingStore,
  EMPTY_LIFE_STORE,
  EMPTY_THINKING_STORE,
  LIFE_STORAGE_KEY,
  MAX_ACTIVE_SPACES,
  OPENING_MS,
  THINKING_STORAGE_KEY,
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

const RESTORE_OVER_LIMIT_NOTICE = "当前已有 7 个活跃空间，请先写入或删除一个活跃空间，再恢复这条思路";

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
  const [thinkingFocusMode, setThinkingFocusMode] = useState(false);
  const [thinkingViewMode, setThinkingViewMode] = useState<"spaces" | "detail">("spaces");
  const [thinkingJumpTarget, setThinkingJumpTarget] = useState<ThinkingJumpTarget | null>(null);

  const noticeTimerRef = useRef<number | null>(null);
  const [stars] = useState(() => createStars(36));

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

  const syncAuth = useCallback(async () => {
    try {
      const response = await fetch("/v1/auth/me", { method: "GET", cache: "no-store" });
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
      showNotice("登录已失效，请重新登录");
      return true;
    },
    [showNotice]
  );

  const syncLifeFromApi = useCallback(
    async (silent = false) => {
      try {
        const response = await fetch("/v1/doubts?range=all&include_notes=true", {
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
        const response = await fetch("/v1/thinking/spaces", { method: "GET", cache: "no-store" });
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
        const response = await fetch("/v1/thinking/scratch", { method: "GET", cache: "no-store" });
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
        const response = await fetch(`/v1/thinking/spaces/${spaceId}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          if (response.status === 404) setThinkingView(null);
          else if (!silent) showNotice("思考详情加载失败");
          return false;
        }
        const payload = (await response.json()) as ApiThinkingSpaceView;
        setThinkingView(mapApiThinkingView(payload));
        return true;
      } catch {
        if (!silent) showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice]
  );

  const createLifeDoubt = useCallback(
    async (rawText: string) => {
      try {
        const response = await fetch("/v1/doubts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: rawText, layer: "life" })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          showNotice("放入失败，请稍后再试");
          return false;
        }
        void syncLifeFromApi(true);
        return true;
      } catch {
        showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice, syncLifeFromApi]
  );

  const saveLifeDoubtNote = useCallback(
    async (doubtId: string, noteText: string) => {
      try {
        const response = await fetch(`/v1/doubts/${doubtId}/note`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_text: noteText })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          showNotice("注记保存失败");
          return false;
        }
        void syncLifeFromApi(true);
        return true;
      } catch {
        showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [handleUnauthorized, showNotice, syncLifeFromApi]
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
      try {
        const response = await fetch(`/v1/doubts/${doubtId}/delete`, { method: "POST" });
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
        return true;
      } catch {
        showNotice("网络异常，请稍后再试");
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, pruneDerivedThinkingByDoubt, showNotice, syncLifeFromApi, syncThinkingSpacesFromApi, thinkingStore.spaces]
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
      try {
        const response = await fetch("/v1/thinking/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ root_question_text: rootQuestionText, source_time_doubt_id: sourceTimeDoubtId })
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
        return {
          ok: true,
          spaceId,
          converted: payload.converted === true,
          createdAsStatement: payload.created_as_statement === true,
          suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : [],
          questionSuggestion: typeof payload.question_suggestion === "string" ? payload.question_suggestion : null
        };
      } catch {
        return { ok: false, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi, syncThinkingSpacesFromApi]
  );

  useEffect(() => {
    void syncAuth();
  }, [syncAuth]);

  useEffect(() => {
    const loadedLife = loadLifeStore();
    const loadedThinking = loadThinkingStore();
    setLifeStore(loadedLife);
    setThinkingStore(loadedThinking);
    setActiveSpaceId(pickDefaultSpaceId(loadedThinking.spaces));
    setHydrated(true);
  }, []);

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
    if (!hydrated || !authReady || !sessionUser) return;
    void syncLifeFromApi(true);
  }, [authReady, hydrated, sessionUser, syncLifeFromApi]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser) return;
    void syncThinkingScratchFromApi(true);
  }, [authReady, hydrated, sessionUser, syncThinkingScratchFromApi]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser) return;
    void (async () => {
      const spaces = await syncThinkingSpacesFromApi(true);
      const initial = pickDefaultSpaceId(spaces);
      setActiveSpaceId((prev) => (prev && spaces.some((space) => space.id === prev) ? prev : initial));
      if (initial) await loadThinkingViewFromApi(initial, true);
      else setThinkingView(null);
    })();
  }, [authReady, hydrated, loadThinkingViewFromApi, sessionUser, syncThinkingSpacesFromApi]);

  useEffect(() => {
    if (!hydrated) return;
    persistLifeStore(lifeStore);
  }, [hydrated, lifeStore]);

  useEffect(() => {
    if (!hydrated) return;
    persistThinkingStore(thinkingStore);
  }, [hydrated, thinkingStore]);

  useEffect(() => {
    if (!hydrated) return;
    setActiveSpaceId((prev) => {
      if (prev && thinkingStore.spaces.some((space) => space.id === prev)) return prev;
      return pickDefaultSpaceId(thinkingStore.spaces);
    });
  }, [hydrated, thinkingStore.spaces]);

  useEffect(() => {
    if (!hydrated || !authReady || !sessionUser) return;
    if (!activeSpaceId) {
      setThinkingView(null);
      return;
    }
    void loadThinkingViewFromApi(activeSpaceId, true);
  }, [activeSpaceId, authReady, hydrated, loadThinkingViewFromApi, sessionUser]);

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
        const response = await fetch(`/v1/doubts/${doubtId}/archive`, { method: "POST" });
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
          const response = await fetch(`/v1/doubts/${doubt.id}/to-thinking`, { method: "POST" });
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
      try {
        const response = await fetch("/v1/thinking/scratch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: rawText })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await syncThinkingScratchFromApi(true);
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, syncThinkingScratchFromApi]
  );

  const handleFeedThinkingScratchToTime = useCallback(
    async (scratchId: string) => {
      try {
        const response = await fetch(`/v1/thinking/scratch/${scratchId}/feed-to-time`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await syncLifeFromApi(true);
        await syncThinkingScratchFromApi(true);
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, syncLifeFromApi, syncThinkingScratchFromApi]
  );

  const handleDeleteThinkingScratch = useCallback(
    async (scratchId: string) => {
      try {
        const response = await fetch(`/v1/thinking/scratch/${scratchId}/delete`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await syncThinkingScratchFromApi(true);
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, syncThinkingScratchFromApi]
  );

  const handleScratchToSpace = useCallback(
    async (scratchId: string) => {
      try {
        const response = await fetch(`/v1/thinking/scratch/${scratchId}/to-space`, { method: "POST" });
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
        return { ok: true as const, spaceId };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi, syncThinkingScratchFromApi, syncThinkingSpacesFromApi]
  );

  const handleThinkingAddQuestion = useCallback(
    async (
      spaceId: string,
      payload: { rawInput: string; trackId: string | null; fromSuggestion?: boolean }
    ) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raw_text: payload.rawInput,
            track_id: payload.trackId,
            from_suggestion: payload.fromSuggestion === true
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
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingOrganizePreview = useCallback(
    async (spaceId: string) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/organize-preview`, { method: "POST" });
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
    [handleUnauthorized]
  );

  const handleThinkingOrganizeApply = useCallback(
    async (spaceId: string, moves: Array<{ nodeId: string; targetTrackId: string }>) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/organize-apply`, {
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
        return { ok: true as const, movedCount: Number.isFinite(body.moved_count) ? Number(body.moved_count) : 0 };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingLinkNodes = useCallback(
    async (nodeId: string, targetNodeId: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_node_id: targetNodeId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingMoveNode = useCallback(
    async (nodeId: string, targetTrackId: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_track_id: targetTrackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/delete`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingUpdateNode = useCallback(
    async (nodeId: string, rawQuestionText: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_question_text: rawQuestionText })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingCopyNode = useCallback(
    async (nodeId: string, targetTrackId?: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetTrackId ? { target_track_id: targetTrackId } : {})
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { node_id?: string };
        if (!response.ok) return null;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return typeof body.node_id === "string" ? body.node_id : null;
      } catch {
        return null;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingSaveNodeAnswer = useCallback(
    async (nodeId: string, answerText: string | null) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_text: answerText })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingMisplacedNode = useCallback(
    async (nodeId: string) => {
      try {
        const response = await fetch(`/v1/thinking/nodes/${nodeId}/misplaced`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        if (activeSpaceId) await loadThinkingViewFromApi(activeSpaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingSetActiveTrack = useCallback(
    async (spaceId: string, trackId: string) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/active-track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: trackId })
        });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) return false;
        await loadThinkingViewFromApi(spaceId, true);
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingCreateTrack = useCallback(
    async (spaceId: string) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (handleUnauthorized(response)) return null;
        const body = (await response.json().catch(() => ({}))) as { track_id?: string };
        if (!response.ok) return null;
        await loadThinkingViewFromApi(spaceId, true);
        return typeof body.track_id === "string" ? body.track_id : null;
      } catch {
        return null;
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingTrackDirection = useCallback(
    async (spaceId: string, trackId: string, directionHint: TrackDirectionHint | null) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/track-direction`, {
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
        return true;
      } catch {
        return false;
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingSaveBackground = useCallback(
    async (spaceId: string, backgroundText: string | null) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/background`, {
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
        return {
          ok: true as const,
          version: Number.isFinite(payload.background_version) ? Number(payload.background_version) : 0
        };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingWriteToTime = useCallback(
    async (spaceId: string, freezeNote?: string) => {
      try {
        const normalizedNote = typeof freezeNote === "string" ? freezeNote.trim() : "";
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/write-to-time`, {
          method: "POST",
          headers: normalizedNote ? { "Content-Type": "application/json" } : undefined,
          body: normalizedNote ? JSON.stringify({ freeze_note: normalizedNote }) : undefined
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
        return { ok: true as const };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi, syncLifeFromApi, syncThinkingSpacesFromApi]
  );

  const handleThinkingDeleteSpace = useCallback(
    async (spaceId: string) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/delete`, { method: "POST" });
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
        return { ok: true as const };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi, syncThinkingSpacesFromApi]
  );

  const handleThinkingExport = useCallback(async (spaceId: string) => {
    try {
      const response = await fetch(`/v1/thinking/spaces/${spaceId}/export`, { method: "GET", cache: "no-store" });
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
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ root_question_text: rootQuestionText })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        const payload = (await response.json().catch(() => ({}))) as { error?: string; root_question_text?: string };
        if (!response.ok) {
          return { ok: false as const, message: typeof payload.error === "string" ? payload.error : "重命名失败" };
        }
        const spaces = await syncThinkingSpacesFromApi(true);
        if (activeSpaceId && spaces.some((space) => space.id === activeSpaceId)) {
          await loadThinkingViewFromApi(activeSpaceId, true);
        }
        return {
          ok: true as const,
          rootQuestionText: typeof payload.root_question_text === "string" ? payload.root_question_text : rootQuestionText
        };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi, syncThinkingSpacesFromApi]
  );

  const handleSystemExport = useCallback(
    async (options: { includeLife: boolean; includeThinking: boolean }) => {
      try {
        const params = new URLSearchParams({
          format: "markdown",
          include_life: String(options.includeLife),
          include_thinking: String(options.includeThinking)
        });
        const response = await fetch(`/v1/system/export?${params.toString()}`, { method: "GET", cache: "no-store" });
        if (handleUnauthorized(response)) return null;
        if (!response.ok) return null;
        const payload = (await response.json().catch(() => ({}))) as { markdown?: string };
        return typeof payload.markdown === "string" ? payload.markdown : null;
      } catch {
        return null;
      }
    },
    [handleUnauthorized]
  );

  const logout = useCallback(() => {
    void (async () => {
      try {
        await fetch("/v1/auth/logout", { method: "POST" });
      } finally {
        setSessionUser(null);
        setThinkingView(null);
        setActiveSpaceId(null);
        showNotice("已退出登录");
      }
    })();
  }, [showNotice]);

  const clearAllData = useCallback(() => {
    setThinkingStore(EMPTY_THINKING_STORE);
    setActiveSpaceId(null);
    setThinkingView(null);
    setLifeStore((prev) => ({ ...EMPTY_LIFE_STORE, meta: prev.meta }));
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LIFE_STORAGE_KEY);
      window.localStorage.removeItem(THINKING_STORAGE_KEY);
    }
    void syncLifeFromApi(true);
    void syncThinkingSpacesFromApi(true);
    showNotice("本地缓存已清理");
  }, [showNotice, syncLifeFromApi, syncThinkingSpacesFromApi]);

  if (!authReady) {
    return (
      <div className="grid h-screen place-items-center bg-slate-950 text-slate-200">
        <p className="text-sm tracking-[0.12em] text-slate-300/80">验证身份中...</p>
      </div>
    );
  }

  if (!sessionUser) {
    return <AuthPanel onAuthed={() => void syncAuth()} />;
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
            <div className={cn("inline-flex items-center gap-2 text-sm tracking-[0.24em]", isThinkingTab ? "text-slate-700" : "text-slate-300/80")}><img src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></div>
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
                ready={lifeReady}
                openingPhase={openingPhase}
                stars={stars}
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

function AuthPanel(props: { onAuthed: () => void }) {
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
        const response = await fetch(endpoint, {
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
        const response = await fetch(endpoint, {
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
    <div className="grid h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-300/15 bg-slate-900/65 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="inline-flex items-center gap-2 text-sm tracking-[0.22em] text-slate-300/85"><img src="/zhihuo_logo_icon.svg" alt="Zhihuo logo" className="h-4 w-4 rounded-sm object-contain opacity-90" /><span>知惑 Zhihuo</span></p>
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




