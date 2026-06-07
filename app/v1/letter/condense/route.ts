import { NextRequest } from "next/server";

import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAiApiSettings,
  normalizeBaseUrl
} from "@/lib/ai-settings";
import {
  fallbackCondense,
  hasLetterCondenseContent,
  normalizeLetterCondenseInput,
  normalizeLetterCondenseOutput,
  type LetterCondenseRequest,
  type LetterCondenseResponse
} from "@/lib/letter-ai";
import { errorJson, okJson, parseJsonBody } from "@/lib/server/http";
import { logWarn, withApiRoute } from "@/lib/server/observability";

export const maxDuration = 30;

export const POST = withApiRoute(
  "letter.condense",
  async (request: NextRequest) => {
    const body = await parseJsonBody<LetterCondenseRequest>(request);
    if (!body) return errorJson(400, "invalid json");

    const input = normalizeLetterCondenseInput(body);
    if (!hasLetterCondenseContent(input)) return errorJson(400, "doubt or nodes is required");

    const fallback = fallbackCondense(input);
    const hasRequestAiSettings = Boolean(input.ai);
    const ai = normalizeAiApiSettings(input.ai);
    const apiKey = hasRequestAiSettings ? ai.apiKey : process.env.DEEPSEEK_API_KEY || "";
    if (!apiKey) return okJson(fallback);

    const baseUrl = hasRequestAiSettings
      ? normalizeBaseUrl(ai.baseUrl, DEFAULT_DEEPSEEK_BASE_URL)
      : normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_BASE_URL);
    const model = hasRequestAiSettings ? ai.model : DEFAULT_DEEPSEEK_MODEL;

    const aiResponse = await callDeepSeek({ input, apiKey, baseUrl, model }).catch((error: unknown) => {
      logWarn("letter.condense.deepseek_network_failed", {
        error: error instanceof Error ? trimText(error.message, 200) : "unknown"
      });
      return null;
    });

    if (!aiResponse) return okJson(fallback);
    if (!aiResponse.ok) {
      logWarn("letter.condense.deepseek_failed", {
        status: aiResponse.status,
        error: summarizeApiError(aiResponse.raw)
      });
      return okJson(fallback);
    }

    const text = extractChatCompletionText(aiResponse.raw) ?? extractOutputText(aiResponse.raw);
    const parsed = text ? parseJsonObject(text) : null;
    const draft = normalizeLetterCondenseOutput(parsed, fallback);
    if (!draft) {
      logWarn("letter.condense.invalid_output", { reason: text ? "invalid_json_or_empty" : "empty_output" });
      return okJson(fallback);
    }

    return okJson({ ...draft, source: "ai" } satisfies LetterCondenseResponse);
  },
  { rateLimit: { bucket: "letter-condense", max: 20, windowMs: 60 * 1000 } }
);

async function callDeepSeek({
  input,
  apiKey,
  baseUrl,
  model
}: {
  input: ReturnType<typeof normalizeLetterCondenseInput>;
  apiKey: string;
  baseUrl: string;
  model: string;
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是知惑的信笺凝练助手。把用户的疑问和思考过程凝练成安静、克制、可回望的短笺。只返回 JSON，不要 Markdown。JSON 结构必须是 {\"title\":\"...\",\"lines\":[\"...\",\"...\",\"...\"]}。标题不超过 24 个字，正文 3 到 5 行，每行短句。不要编造用户没有表达过的结论。"
        },
        {
          role: "user",
          content: JSON.stringify({
            doubt: input.doubt,
            nodes: input.nodes,
            closing: input.closing ?? ""
          })
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.72,
      max_tokens: 700
    })
  });
  const raw = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, raw };
}

function extractChatCompletionText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const choices = (raw as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return null;
  const chunks: string[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") chunks.push(content);
  }
  return chunks.join("").trim() || null;
}

function extractOutputText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = record.output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("").trim() || null;
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function summarizeApiError(raw: unknown) {
  if (!raw || typeof raw !== "object") return "unknown";
  const error = (raw as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return "unknown";
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? trimText(message, 200) : "unknown";
}

function trimText(value: string, maxChars: number) {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) return value.trim();
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}
