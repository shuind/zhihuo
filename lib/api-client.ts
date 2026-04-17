"use client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
export const API_CONNECTIVITY_EVENT = "zhihuo:api-connectivity";

export type ApiConnectivityDetail = {
  online: boolean;
};

function dispatchApiConnectivity(online: boolean) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent<ApiConnectivityDetail>(API_CONNECTIVITY_EVENT, { detail: { online } }));
}

function isOfflineFetchError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /network|failed to fetch|load failed|fetch/i.test(message);
}

export function buildApiUrl(input: string) {
  if (!API_BASE_URL || !input.startsWith("/v1/")) return input;
  return `${API_BASE_URL}${input}`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const nextInit: RequestInit = {
    credentials: API_BASE_URL ? "include" : "same-origin",
    ...init
  };
  try {
    const response =
      typeof input === "string" ? await fetch(buildApiUrl(input), nextInit) : await fetch(input, nextInit);
    dispatchApiConnectivity(true);
    return response;
  } catch (error) {
    if (isOfflineFetchError(error)) {
      dispatchApiConnectivity(false);
    }
    throw error;
  }
}
