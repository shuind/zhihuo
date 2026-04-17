"use client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export function buildApiUrl(input: string) {
  if (!API_BASE_URL || !input.startsWith("/v1/")) return input;
  return `${API_BASE_URL}${input}`;
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const nextInit: RequestInit = {
    credentials: API_BASE_URL ? "include" : "same-origin",
    ...init
  };
  if (typeof input === "string") {
    return fetch(buildApiUrl(input), nextInit);
  }
  return fetch(input, nextInit);
}
