import type { PaperVariant } from "@/components/letter/letter-paper";

const KEY = (doubtId: string) => `zhihuo:letter-variant:${doubtId}`;
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
