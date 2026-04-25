import type { PaperVariant } from "@/components/letter/letter-paper";

const KEY = (doubtId: string) => `zhihuo:letter-variant:${doubtId}`;
const SEAL_KEY = (doubtId: string) => `zhihuo:letter-seal:${doubtId}`;
const VALID: PaperVariant[] = ["plain", "rice", "clay", "tide", "ink", "vellum"];

export function saveLetterVariant(doubtId: string | null | undefined, variant: PaperVariant) {
  if (!doubtId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(doubtId), variant);
  } catch {}
}

export function loadLetterVariant(doubtId: string | null | undefined): PaperVariant | null {
  if (!doubtId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(doubtId));
    if (raw && (VALID as string[]).includes(raw)) return raw as PaperVariant;
  } catch {}
  return null;
}

export function saveLetterSealText(doubtId: string | null | undefined, sealText: string) {
  if (!doubtId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEAL_KEY(doubtId), normalizeLetterSealText(sealText));
  } catch {}
}

export function loadLetterSealText(doubtId: string | null | undefined): string | null {
  if (!doubtId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEAL_KEY(doubtId));
    return raw ? normalizeLetterSealText(raw) : null;
  } catch {}
  return null;
}

export function normalizeLetterSealText(value: string) {
  const text = Array.from(value.replace(/\s+/g, "").trim()).slice(0, 4).join("");
  return text || "知";
}
