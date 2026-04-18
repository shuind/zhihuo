"use client";

import { useCallback, useEffect, useState } from "react";

export type LifePaper =
  | "plain"
  | "songyan"
  | "xuetao"
  | "shuangye"
  | "feihong"
  | "zhishi"
  | "liuhuang"
  | "leitie";

export type ThinkingStamp = "pending" | "pain" | "spark" | "archived" | "echo";

export const PAPER_IDS: LifePaper[] = [
  "plain",
  "songyan",
  "xuetao",
  "shuangye",
  "feihong",
  "zhishi",
  "liuhuang",
  "leitie"
];

export const STAMP_IDS: ThinkingStamp[] = ["pending", "pain", "spark", "archived", "echo"];

const STORAGE_KEY = "zhihuo_decor_v1";
const CHANGE_EVENT = "zhihuo-decor-change";

type DecorState = {
  papers: Record<string, LifePaper>;
  stamps: Record<string, ThinkingStamp>;
};

const EMPTY_STATE: DecorState = { papers: {}, stamps: {} };

function isValidPaper(value: unknown): value is LifePaper {
  return typeof value === "string" && (PAPER_IDS as string[]).includes(value);
}

function isValidStamp(value: unknown): value is ThinkingStamp {
  return typeof value === "string" && (STAMP_IDS as string[]).includes(value);
}

function loadState(): DecorState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { papers: {}, stamps: {} };
    const parsed = JSON.parse(raw) as Partial<DecorState> | null;
    const papers: Record<string, LifePaper> = {};
    const stamps: Record<string, ThinkingStamp> = {};
    if (parsed && typeof parsed === "object") {
      if (parsed.papers && typeof parsed.papers === "object") {
        for (const [id, value] of Object.entries(parsed.papers)) {
          if (typeof id === "string" && isValidPaper(value) && value !== "plain") {
            papers[id] = value;
          }
        }
      }
      if (parsed.stamps && typeof parsed.stamps === "object") {
        for (const [id, value] of Object.entries(parsed.stamps)) {
          if (typeof id === "string" && isValidStamp(value)) {
            stamps[id] = value;
          }
        }
      }
    }
    return { papers, stamps };
  } catch {
    return { papers: {}, stamps: {} };
  }
}

function persistState(state: DecorState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

export type DecorController = {
  ready: boolean;
  papers: Record<string, LifePaper>;
  stamps: Record<string, ThinkingStamp>;
  getPaper: (doubtId: string) => LifePaper;
  getStamp: (nodeId: string) => ThinkingStamp | null;
  setPaper: (doubtId: string, paper: LifePaper | null) => void;
  setStamp: (nodeId: string, stamp: ThinkingStamp | null) => void;
};

export function useDecorStore(): DecorController {
  const [state, setState] = useState<DecorState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(loadState());
    setReady(true);
    const onChange = () => setState(loadState());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setState(loadState());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPaper = useCallback((doubtId: string, paper: LifePaper | null) => {
    setState((prev) => {
      const papers = { ...prev.papers };
      if (!paper || paper === "plain") delete papers[doubtId];
      else papers[doubtId] = paper;
      const next: DecorState = { ...prev, papers };
      persistState(next);
      return next;
    });
  }, []);

  const setStamp = useCallback((nodeId: string, stamp: ThinkingStamp | null) => {
    setState((prev) => {
      const stamps = { ...prev.stamps };
      if (!stamp) delete stamps[nodeId];
      else stamps[nodeId] = stamp;
      const next: DecorState = { ...prev, stamps };
      persistState(next);
      return next;
    });
  }, []);

  return {
    ready,
    papers: state.papers,
    stamps: state.stamps,
    getPaper: (id: string) => state.papers[id] ?? "plain",
    getStamp: (id: string) => state.stamps[id] ?? null,
    setPaper,
    setStamp
  };
}
