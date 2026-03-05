import { randomUUID } from "node:crypto";

import type { DimensionKey } from "@/lib/server/types";

export const USER_FALLBACK = "local_user";
export const MAX_ACTIVE_SPACES = 7;
export const MAX_SPACE_NODES = 40;

export const DIMENSIONS: DimensionKey[] = ["definition", "resource", "risk", "value", "path", "evidence"];

type NormalizeQuestionSuccess = {
  ok: true;
  text: string;
  converted: boolean;
  raw_note: string | null;
  is_question: boolean;
  suggested_questions: string[];
};

type NormalizeQuestionFailure = {
  ok: false;
  suggested_questions: string[];
};

export type NormalizeQuestionResult = NormalizeQuestionSuccess | NormalizeQuestionFailure;

type RecommendationProvider = "none" | "llm";

const INTERROGATIVE_PREFIX =
  /^(why|how|what|where|when|who|which|can|could|should|would|is|are|am|do|does|did|will|是否|为什么|为何|怎么|如何|什么|谁|哪|能否|可否|要不要|是不是|有没有)/iu;

function getRecommendationProvider(): RecommendationProvider {
  const configured = (process.env.THINKING_RECOMMENDER ?? "none").toLowerCase();
  if (configured === "llm") return "llm";
  return "none";
}

export function createId() {
  return randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseBoolean(value: string | null | undefined, fallback: boolean) {
  if (value == null) return fallback;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return fallback;
}

function ensureQuestionMark(input: string) {
  const trimmed = input.replace(/[。.!！？?]+$/u, "").trim();
  if (!trimmed) return "";
  if (/[?？]$/u.test(trimmed)) return trimmed;
  return /[\u4e00-\u9fa5]/u.test(trimmed) ? `${trimmed}？` : `${trimmed}?`;
}

function cleanForQuestion(input: string) {
  return collapseWhitespace(input).replace(/[。.!！？?]+$/u, "").trim();
}

function looksLikeQuestion(input: string) {
  return /[?？]$/u.test(input) || INTERROGATIVE_PREFIX.test(input);
}

function focusSnippet(raw: string, max = 26) {
  const compact = raw.replace(/[“”"'`]/gu, "");
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

async function buildSuggestedQuestionsByLlm(rawInput: string, backgroundText: string | null, maxCount: number) {
  void rawInput;
  void backgroundText;
  void maxCount;
  // 预留：后续接入大模型推荐器。
  return [] as string[];
}

export function buildSuggestedQuestions(rawInput: string, backgroundText: string | null, maxCount: number) {
  if (maxCount <= 0) return [];
  const focus = focusSnippet(cleanForQuestion(rawInput));
  if (!focus || focus.length < 2) return [];

  const provider = getRecommendationProvider();
  if (provider === "none") return [];

  if (provider === "llm") {
    // 当前未接入真实模型，保持接口兼容并返回空数组。
    void buildSuggestedQuestionsByLlm(focus, backgroundText, maxCount);
    return [];
  }
  return [];
}

export function normalizeQuestionInput(raw: string, backgroundText: string | null): NormalizeQuestionResult {
  const text = collapseWhitespace(raw);
  if (!text || text.length < 2) return { ok: false, suggested_questions: [] };

  if (looksLikeQuestion(text)) {
    const normalized = ensureQuestionMark(text);
    if (!normalized) return { ok: false, suggested_questions: [] };
    return {
      ok: true,
      text: normalized,
      converted: false,
      raw_note: null,
      is_question: true,
      suggested_questions: []
    };
  }

  const cleaned = cleanForQuestion(text);
  const fallback = cleaned || text;
  return {
    ok: true,
    text: fallback,
    converted: false,
    raw_note: null,
    is_question: false,
    suggested_questions: buildSuggestedQuestions(fallback, backgroundText, 3)
  };
}

function hashText(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function tokenizeText(input: string) {
  const matches = input.toLowerCase().match(/[\p{Script=Han}A-Za-z0-9]+/gu) ?? [];
  return matches.filter((token) => token.length > 0);
}

export function textOverlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let common = 0;
  for (const token of aSet) {
    if (bSet.has(token)) common += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  if (!union) return 0;
  return common / union;
}

export function classifyDimension(text: string): DimensionKey {
  const rules: Record<DimensionKey, RegExp[]> = {
    definition: [/define|what|scope|boundary|meaning|definition|定义|范围|边界|是什么/iu],
    resource: [/resource|constraint|cost|budget|time|capacity|资源|成本|预算|时间|产能/iu],
    risk: [/risk|worst|failure|loss|outcome|风险|后果|最坏|失败/iu],
    value: [/value|motivation|why|worth|purpose|价值|动机|意义|为什么/iu],
    path: [/path|strategy|step|plan|how|路径|策略|步骤|如何|怎么/iu],
    evidence: [/evidence|prove|data|metric|validate|证据|验证|数据|指标/iu]
  };
  for (const dimension of DIMENSIONS) {
    if (rules[dimension].some((rule) => rule.test(text))) return dimension;
  }
  return DIMENSIONS[hashText(text) % DIMENSIONS.length];
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}
