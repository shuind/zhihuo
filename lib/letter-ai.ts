import type { AiApiSettings } from "./ai-settings";
import { poetize } from "./letter-poetize";

export type LetterCondenseRequest = {
  doubt?: unknown;
  nodes?: unknown;
  closing?: unknown;
  ai?: Partial<AiApiSettings>;
};

export type LetterCondenseInput = {
  doubt: string;
  nodes: string[];
  closing?: string;
  ai?: Partial<AiApiSettings>;
};

export type LetterCondenseDraft = {
  title: string;
  lines: string[];
};

export type LetterCondenseResponse = LetterCondenseDraft & {
  source: "ai" | "fallback";
};

const MAX_TITLE_CHARS = 24;
const MAX_LINE_CHARS = 28;
const MAX_LINES = 5;
const TARGET_MIN_LINES = 3;

export function normalizeLetterCondenseInput(input: LetterCondenseRequest | null | undefined): LetterCondenseInput {
  const record = input && typeof input === "object" ? input : {};
  const doubt = trimText((record as LetterCondenseRequest).doubt, 240);
  const closing = trimText((record as LetterCondenseRequest).closing, 240);
  const nodes = Array.isArray((record as LetterCondenseRequest).nodes)
    ? ((record as LetterCondenseRequest).nodes as unknown[])
        .map((node) => trimText(node, 240))
        .filter(Boolean)
        .slice(0, 80)
    : [];
  const ai = isRecord((record as LetterCondenseRequest).ai)
    ? ((record as LetterCondenseRequest).ai as Partial<AiApiSettings>)
    : undefined;

  return {
    doubt,
    nodes,
    closing: closing || undefined,
    ai
  };
}

export function hasLetterCondenseContent(input: LetterCondenseInput) {
  return Boolean(input.doubt || input.nodes.length || input.closing);
}

export function fallbackCondense(input: LetterCondenseInput): LetterCondenseResponse {
  const fallback = poetize({ doubt: input.doubt, nodes: input.nodes, closing: input.closing });
  const draft = normalizeLetterCondenseOutput(
    fallback,
    {
      title: input.doubt,
      lines: [...input.nodes, input.closing ?? ""].filter(Boolean)
    },
    { minLines: 0 }
  ) ?? {
    title: trimChars(input.doubt, MAX_TITLE_CHARS),
    lines: [trimChars(input.doubt || input.closing || input.nodes[0] || "", MAX_LINE_CHARS)].filter(Boolean)
  };

  return { ...draft, source: "fallback" };
}

export function normalizeLetterCondenseOutput(
  raw: unknown,
  fallback?: LetterCondenseDraft,
  options?: { minLines?: number }
): LetterCondenseDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const fallbackTitle = fallback?.title ? trimChars(cleanText(fallback.title), MAX_TITLE_CHARS) : "";
  const title = trimChars(cleanText(record.title), MAX_TITLE_CHARS) || fallbackTitle;
  const lines = normalizeLines(extractLines(record), MAX_LINE_CHARS);
  const minLines = options?.minLines ?? TARGET_MIN_LINES;

  if (fallback?.lines?.length && lines.length < minLines) {
    for (const line of normalizeLines(fallback.lines, MAX_LINE_CHARS)) {
      if (lines.length >= minLines) break;
      if (!lines.includes(line)) lines.push(line);
    }
  }

  const finalLines = lines.slice(0, MAX_LINES);
  if (!title && !finalLines.length) return null;

  return {
    title,
    lines: finalLines.length ? finalLines : [title].filter(Boolean)
  };
}

function extractLines(record: Record<string, unknown>): unknown[] {
  if (Array.isArray(record.lines)) return record.lines;
  if (typeof record.body === "string") return record.body.split(/\r?\n/);
  if (typeof record.text === "string") return record.text.split(/\r?\n/);
  return [];
}

function normalizeLines(values: unknown[], maxChars: number) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const value of values) {
    const cleaned = trimChars(cleanText(value).replace(/^[\s\-*•·\d.、)）]+/, ""), maxChars);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    lines.push(cleaned);
    if (lines.length >= MAX_LINES) break;
  }

  return lines;
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’《「『]+/, "")
    .replace(/["'“”‘’》」』]+$/, "")
    .trim();
}

function trimText(value: unknown, maxChars: number) {
  return trimChars(cleanText(value), maxChars);
}

function trimChars(value: string, maxChars: number) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
