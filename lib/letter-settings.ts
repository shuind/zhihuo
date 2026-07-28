import { useEffect, useState } from "react";

export const LETTER_AUTHOR_STORAGE_KEY = "zhihuo_letter_author_v1";
export const MAX_LETTER_AUTHOR_LENGTH = 12;

export function normalizeLetterAuthorName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_LETTER_AUTHOR_LENGTH);
}

export function loadLetterAuthorName(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeLetterAuthorName(window.localStorage.getItem(LETTER_AUTHOR_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function saveLetterAuthorName(value: string) {
  if (typeof window === "undefined") return;
  const next = normalizeLetterAuthorName(value);
  try {
    if (next) window.localStorage.setItem(LETTER_AUTHOR_STORAGE_KEY, next);
    else window.localStorage.removeItem(LETTER_AUTHOR_STORAGE_KEY);
  } catch {
    /* 落款只是装饰，写不进本机存储时静默降级为不署名 */
  }
}

/**
 * 落款留空即不署名。挂载后才读本机存储：服务端渲染不到 localStorage，
 * 初值直接取会导致 hydration 不匹配。设置层与信笺不会同时可见，读一次即可。
 */
export function useLetterAuthorName() {
  const [authorName, setAuthorName] = useState("");
  useEffect(() => {
    setAuthorName(loadLetterAuthorName());
  }, []);
  return authorName;
}
