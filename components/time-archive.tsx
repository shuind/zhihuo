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
  type ThinkingSpaceMeta,
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
  pickDefaultSpaceId
} from "@/components/zhihuo-model";

type ApiLifeDoubt = {
  id: string;
  raw_text: string;
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
  status: "active" | "frozen" | "archived";
  created_at: string;
  frozen_at: string | null;
  source_time_doubt_id: string | null;
};

type ApiThinkingSpaceMeta = {
  space_id: string;
  user_freeze_note: string | null;
  export_version: number;
};

type ApiThinkingTrackNode = {
  id: string;
  raw_question_text: string;
  note_text?: string | null;
  created_at: string;
  is_suggested: boolean;
  echo_track_id?: string | null;
  echo_node_id?: string | null;
};

type ApiThinkingTrack = {
  id: string;
  title_question_text: string;
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
};

type SessionUser = {
  userId: string;
  email: string;
};

function mapApiLifeDoubt(item: ApiLifeDoubt): LifeDoubt {
  return {
    id: item.id,
    rawText: item.raw_text,
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
    frozenAt: item.frozen_at,
    sourceTimeDoubtId: item.source_time_doubt_id
  };
}

function mapApiThinkingMeta(item: ApiThinkingSpaceMeta): ThinkingSpaceMeta {
  return {
    spaceId: item.space_id,
    userFreezeNote: item.user_freeze_note,
    exportVersion: item.export_version
  };
}

function mapApiThinkingView(payload: ApiThinkingSpaceView): ThinkingSpaceView {
  return {
    spaceId: payload.root.id,
    currentTrackId: typeof payload.current_track_id === "string" ? payload.current_track_id : null,
    tracks: (payload.tracks ?? []).map((track) => ({
      id: track.id,
      titleQuestionText: track.title_question_text,
      nodes: (track.nodes ?? []).map((node) => ({
        id: node.id,
        questionText: node.raw_question_text,
        noteText: typeof node.note_text === "string" ? node.note_text : null,
        isSuggested: Boolean(node.is_suggested),
        createdAt: node.created_at,
        echoTrackId: typeof node.echo_track_id === "string" ? node.echo_track_id : null,
        echoNodeId: typeof node.echo_node_id === "string" ? node.echo_node_id : null
      })),
      nodeCount: Math.max(0, track.node_count ?? 0)
    })),
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
        const response = await fetch("/v1/doubts?range=all&include_archived=true&include_notes=true", {
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
        const payload = (await response.json()) as { spaces?: ApiThinkingSpace[]; space_meta?: ApiThinkingSpaceMeta[] };
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

  const archiveLifeDoubt = useCallback(
    async (doubtId: string) => {
      try {
        const response = await fetch(`/v1/doubts/${doubtId}/archive`, { method: "POST" });
        if (handleUnauthorized(response)) return false;
        if (!response.ok) {
          showNotice("归档操作失败");
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
      | { ok: true; spaceId: string; converted: boolean; createdAsStatement: boolean; suggestedQuestions: string[] }
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
          suggestedQuestions: Array.isArray(payload.suggested_questions) ? payload.suggested_questions : []
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
    if (!hydrated || !authReady || !sessionUser) return;
    void syncLifeFromApi(true);
  }, [authReady, hydrated, sessionUser, syncLifeFromApi]);

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

  const handleImportToThinking = useCallback(
    (doubt: { id: string; rawText: string }) => {
      void (async () => {
        try {
          const response = await fetch(`/v1/doubts/${doubt.id}/to-thinking`, { method: "POST" });
          if (handleUnauthorized(response)) return;
          if (response.status === 409) {
            showNotice(`活跃空间上限为 ${MAX_ACTIVE_SPACES}`);
            return;
          }
          if (!response.ok) {
            showNotice("创建思考空间失败");
            return;
          }
          const payload = (await response.json()) as { space_id?: string };
          const spaceId = typeof payload.space_id === "string" ? payload.space_id : null;
          if (!spaceId) {
            showNotice("创建思考空间失败");
            return;
          }
          await syncThinkingSpacesFromApi(true);
          setActiveSpaceId(spaceId);
          await loadThinkingViewFromApi(spaceId, true);
          setTab("thinking");
          showNotice("已创建思考空间");
        } catch {
          showNotice("网络异常，请稍后再试");
        }
      })();
    },
    [handleUnauthorized, loadThinkingViewFromApi, showNotice, syncThinkingSpacesFromApi]
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
        spaceId: result.spaceId
      };
    },
    [createThinkingSpaceApi]
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
          suggestedQuestions: Array.isArray(body.suggested_questions) ? body.suggested_questions : []
        };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi]
  );

  const handleThinkingOrganize = useCallback(
    async (spaceId: string) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/rebuild`, { method: "POST" });
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

  const handleThinkingFreeze = useCallback(
    async (spaceId: string, userFreezeNote: string | null) => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/freeze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_freeze_note: userFreezeNote })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        if (!response.ok) {
          if (response.status === 404) return { ok: false as const, message: "空间不存在" };
          return { ok: false as const, message: "冻结失败，请稍后再试" };
        }
        const payload = (await response.json()) as { frozen_at?: string | null; user_freeze_note?: string | null };
        await syncThinkingSpacesFromApi(true);
        await loadThinkingViewFromApi(spaceId, true);
        return {
          ok: true as const,
          frozenAt: typeof payload.frozen_at === "string" ? payload.frozen_at : new Date().toISOString(),
          freezeNote: typeof payload.user_freeze_note === "string" ? payload.user_freeze_note : null
        };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [handleUnauthorized, loadThinkingViewFromApi, syncThinkingSpacesFromApi]
  );

  const handleThinkingToggleArchive = useCallback(
    async (spaceId: string, targetStatus: "active" | "archived") => {
      try {
        const response = await fetch(`/v1/thinking/spaces/${spaceId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus })
        });
        if (handleUnauthorized(response)) return { ok: false as const, message: "登录已失效，请重新登录" };
        if (!response.ok) {
          if (response.status === 409) return { ok: false as const, message: `活跃空间上限为 ${MAX_ACTIVE_SPACES}` };
          return { ok: false as const, message: "状态更新失败" };
        }
        await syncThinkingSpacesFromApi(true);
        if (activeSpaceId === spaceId) await loadThinkingViewFromApi(spaceId, true);
        return { ok: true as const };
      } catch {
        return { ok: false as const, message: "网络异常，请稍后再试" };
      }
    },
    [activeSpaceId, handleUnauthorized, loadThinkingViewFromApi, syncThinkingSpacesFromApi]
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

  const appendThinkingFreezeToLife = useCallback(
    (payload: { rootQuestionText: string; createdAt: string; frozenAt: string; freezeNote: string | null }) => {
      const lines = [`[思路阶段] ${payload.rootQuestionText}`, `时间范围：${payload.createdAt.slice(0, 10)} ~ ${payload.frozenAt.slice(0, 10)}`];
      if (payload.freezeNote) lines.push(`当前状态：${payload.freezeNote}`);
      const rawText = lines.join("\n");
      void (async () => {
        const ok = await createLifeDoubt(rawText);
        if (ok) showNotice("已记入时间档案馆");
      })();
    },
    [createLifeDoubt, showNotice]
  );

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

  const appPayload = useMemo(
    () => ({ exportedAt: new Date().toISOString(), life: lifeStore, thinking: thinkingStore }),
    [lifeStore, thinkingStore]
  );

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

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden text-slate-100",
        tab === "life" ? "life-surface" : tab === "thinking" ? "thinking-surface text-slate-900" : "settings-surface"
      )}
    >
      <header
        className={cn(
          "absolute left-0 top-0 z-30 w-full border-b px-4 py-3 backdrop-blur md:px-6",
          tab === "thinking" ? "border-black/8 bg-[#f5f3f0]/76" : "border-slate-200/10 bg-black/20"
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className={cn("text-sm tracking-[0.2em]", tab === "thinking" ? "text-slate-700" : "text-slate-300/80")}>
            知惑 Zhihuo
          </div>
          <nav className="flex items-center gap-2">
            <TopTab label="时间" active={tab === "life"} onClick={() => setTab("life")} daytime={false} />
            <TopTab label="思路" active={tab === "thinking"} onClick={() => setTab("thinking")} daytime />
            <TopTab label="设置" active={tab === "settings"} onClick={() => setTab("settings")} daytime={tab !== "life"} />
            <button
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs tracking-[0.08em] transition-colors",
                tab === "thinking"
                  ? "border-slate-500/20 bg-slate-50/20 text-slate-700 hover:bg-slate-50/45"
                  : "border-slate-300/20 bg-slate-900/20 text-slate-300/80 hover:bg-slate-900/50"
              )}
              onClick={logout}
            >
              退出
            </button>
          </nav>
        </div>
      </header>

      <main className="h-full pt-[62px]">
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
                ready={lifeReady}
                openingPhase={openingPhase}
                stars={stars}
                onImportToThinking={handleImportToThinking}
                onCreateDoubt={createLifeDoubt}
                onArchiveDoubt={archiveLifeDoubt}
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
                activeSpaceId={activeSpaceId}
                setActiveSpaceId={setActiveSpaceId}
                spaceView={thinkingView}
                onCreateSpace={handleCreateThinkingFromInput}
                onAddQuestion={handleThinkingAddQuestion}
                onOrganizeSpace={handleThinkingOrganize}
                onMoveNode={handleThinkingMoveNode}
                onMarkMisplaced={handleThinkingMisplacedNode}
                onDeleteNode={handleThinkingDeleteNode}
                onSetActiveTrack={handleThinkingSetActiveTrack}
                onSaveBackground={handleThinkingSaveBackground}
                onFreezeSpace={handleThinkingFreeze}
                onToggleArchiveSpace={handleThinkingToggleArchive}
                onExportSpace={handleThinkingExport}
                onFreezeToLife={appendThinkingFreezeToLife}
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
                payload={appPayload}
                assistEnabled={thinkingStore.assistEnabled}
                setAssistEnabled={(enabled) => setThinkingStore((prev) => ({ ...prev, assistEnabled: enabled }))}
                onClearAll={clearAllData}
                showNotice={showNotice}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>

      <p
        className={cn(
          "pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-400/20 bg-black/45 px-4 py-1.5 text-xs text-slate-200/80 backdrop-blur transition-all duration-300",
          notice ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        {notice}
      </p>
    </div>
  );
}

function TopTab(props: { label: string; active: boolean; onClick: () => void; daytime: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "rounded-full border px-3 text-xs tracking-[0.12em] transition-colors",
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

function AuthPanel(props: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(() => {
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setSubmitting(true);
    setError("");
    void (async () => {
      try {
        const endpoint = mode === "login" ? "/v1/auth/login" : "/v1/auth/register";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || "认证失败");
          setSubmitting(false);
          return;
        }
        props.onAuthed();
      } catch {
        setError("网络异常，请稍后再试");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [email, mode, password, props]);

  return (
    <div className="grid h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-300/15 bg-slate-900/65 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="text-sm tracking-[0.22em] text-slate-300/85">知惑 Zhihuo</p>
        <p className="mt-2 text-xs tracking-[0.12em] text-slate-400/75">请先登录你的时间档案馆</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "login" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              mode === "register" ? "border-slate-300/45 bg-slate-900 text-slate-100" : "border-slate-300/20 text-slate-300/75"
            )}
            onClick={() => setMode("register")}
          >
            注册
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
            placeholder="密码（至少8位）"
            className="h-10 rounded-lg border border-slate-300/20 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none focus-visible:ring-1 focus-visible:ring-slate-300/45"
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          <Button
            type="button"
            disabled={submitting}
            className="rounded-full border border-slate-300/30 bg-slate-900/70 text-slate-100 hover:bg-slate-800/90"
            onClick={submit}
          >
            {submitting ? "处理中..." : mode === "login" ? "登录" : "注册并登录"}
          </Button>
          <p className={cn("min-h-[1.2em] text-xs text-red-300/85", error ? "opacity-100" : "opacity-0")}>{error}</p>
        </div>
      </div>
    </div>
  );
}



