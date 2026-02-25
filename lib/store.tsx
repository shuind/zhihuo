"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { mockCandidateLinks, mockClusters, mockDoubts } from "@/lib/mock-data";
import {
  CandidateLink,
  Doubt,
  DoubtCluster,
  ExploreResult,
  SmartSettings
} from "@/lib/types";

interface ZhihuoState {
  doubts: Doubt[];
  clusters: DoubtCluster[];
  candidateLinks: CandidateLink[];
  bookmarks: ExploreResult[];
  selectedClusterId: string | null;
  settings: SmartSettings;
  addDoubt: (payload: { rawText: string; layer?: Doubt["layer"] }) => void;
  selectCluster: (clusterId: string | null) => void;
  toggleSetting: (settingKey: keyof SmartSettings) => void;
  suppressLink: (linkId: string) => void;
  saveBookmark: (result: ExploreResult) => void;
}

interface BootstrapResponse {
  doubts: Doubt[];
  clusters: DoubtCluster[];
  candidateLinks: CandidateLink[];
}

interface LocalSnapshot {
  bookmarks?: ExploreResult[];
  selectedClusterId?: string | null;
  settings?: Partial<SmartSettings>;
}

const STORAGE_KEY = "zhihuo-v0-store";
const USER_ID = "user-demo-001";

const defaultSettings: SmartSettings = {
  enableExploreMode: true,
  enableMeteorHints: true,
  enableLearningAutoSort: true,
  enableSemanticDerivation: true
};

const defaultState = {
  doubts: mockDoubts,
  clusters: mockClusters,
  candidateLinks: mockCandidateLinks,
  bookmarks: [] as ExploreResult[],
  selectedClusterId: null as string | null,
  settings: defaultSettings
};

const ZhihuoStoreContext = createContext<ZhihuoState | null>(null);

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function authHeaders(contentType = false): HeadersInit {
  const headers: HeadersInit = {
    "x-user-id": USER_ID
  };
  if (contentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

export function ZhihuoStoreProvider({ children }: { children: React.ReactNode }) {
  const [doubts, setDoubts] = useState<Doubt[]>(defaultState.doubts);
  const [clusters, setClusters] = useState<DoubtCluster[]>(defaultState.clusters);
  const [candidateLinks, setCandidateLinks] = useState<CandidateLink[]>(defaultState.candidateLinks);
  const [bookmarks, setBookmarks] = useState<ExploreResult[]>(defaultState.bookmarks);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    defaultState.selectedClusterId
  );
  const [settings, setSettings] = useState<SmartSettings>(defaultState.settings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as LocalSnapshot;
      if (parsed.bookmarks) {
        setBookmarks(parsed.bookmarks);
      }
      if (parsed.selectedClusterId !== undefined) {
        setSelectedClusterId(parsed.selectedClusterId);
      }
      if (parsed.settings) {
        setSettings((previous) => ({ ...previous, ...parsed.settings }));
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncBootstrap = async () => {
      try {
        const response = await fetch("/api/bootstrap", {
          method: "GET",
          headers: authHeaders(),
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as BootstrapResponse;
        if (cancelled) {
          return;
        }

        if (Array.isArray(payload.doubts)) {
          setDoubts(payload.doubts);
        }
        if (Array.isArray(payload.clusters)) {
          setClusters(payload.clusters);
        }
        if (Array.isArray(payload.candidateLinks)) {
          setCandidateLinks(payload.candidateLinks);
        }
      } catch {
        // Keep frontend usable with local fallback state.
      }
    };

    void syncBootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const payload: LocalSnapshot = {
      bookmarks,
      selectedClusterId,
      settings
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [bookmarks, hydrated, selectedClusterId, settings]);

  const addDoubt = useCallback((payload: { rawText: string; layer?: Doubt["layer"] }) => {
    const createdAt = new Date().toISOString();
    const optimisticId = createClientId("temp");
    const optimistic: Doubt = {
      id: optimisticId,
      userId: USER_ID,
      layer: payload.layer ?? "life",
      rawText: payload.rawText,
      createdAt,
      clusterId: "chaos-zone",
      importance: 0.62,
      recency: 1,
      growth: 0.52
    };

    setDoubts((previous) => [optimistic, ...previous]);

    void fetch("/api/doubts", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        rawText: payload.rawText,
        layer: payload.layer ?? "life"
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const json = (await response.json()) as { item?: Doubt };
        return json.item ?? null;
      })
      .then((saved) => {
        if (!saved) {
          return;
        }
        setDoubts((previous) => [saved, ...previous.filter((doubt) => doubt.id !== optimisticId)]);
      })
      .catch(() => {
        // Keep optimistic item when network fails.
      });
  }, []);

  const selectCluster = useCallback((clusterId: string | null) => {
    setSelectedClusterId(clusterId);
  }, []);

  const toggleSetting = useCallback((settingKey: keyof SmartSettings) => {
    setSettings((previous) => ({ ...previous, [settingKey]: !previous[settingKey] }));
  }, []);

  const suppressLink = useCallback((linkId: string) => {
    setCandidateLinks((previous) =>
      previous.map((link) => (link.id === linkId ? { ...link, suppressed: true } : link))
    );

    void fetch(`/api/links/${encodeURIComponent(linkId)}/suppress`, {
      method: "PATCH",
      headers: authHeaders()
    }).catch(() => {
      // Keep local state optimistic when request fails.
    });
  }, []);

  const saveBookmark = useCallback((result: ExploreResult) => {
    setBookmarks((previous) => [result, ...previous]);
  }, []);

  const value = useMemo<ZhihuoState>(
    () => ({
      doubts,
      clusters,
      candidateLinks,
      bookmarks,
      selectedClusterId,
      settings,
      addDoubt,
      selectCluster,
      toggleSetting,
      suppressLink,
      saveBookmark
    }),
    [
      addDoubt,
      bookmarks,
      candidateLinks,
      clusters,
      doubts,
      saveBookmark,
      selectedClusterId,
      selectCluster,
      settings,
      suppressLink,
      toggleSetting
    ]
  );

  return <ZhihuoStoreContext.Provider value={value}>{children}</ZhihuoStoreContext.Provider>;
}

export function useZhihuoStore<T>(selector: (state: ZhihuoState) => T): T {
  const context = useContext(ZhihuoStoreContext);
  if (!context) {
    throw new Error("useZhihuoStore must be used within ZhihuoStoreProvider");
  }

  return selector(context);
}

export function formatMonthLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short"
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
