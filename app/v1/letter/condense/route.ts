import { NextRequest } from "next/server";

import {
  DEFAULT_AI_PROVIDER,
  getAiProviderDefaults,
  normalizeAiApiSettings
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
import { getUserId, unauthorizedJson } from "@/lib/server/http";
import { fetchAiEndpoint, resolveAiBaseUrl, UnsafeAiEndpointError } from "@/lib/server/ai-endpoint";
import { readUserDb } from "@/lib/server/db";
import { logWarn, withApiRoute } from "@/lib/server/observability";

export const maxDuration = 30;

export const POST = withApiRoute(
  "letter.condense",
  async (request: NextRequest) => {
    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    const userDb = await readUserDb(userId, []);
    if (!userDb.users.some((user) => user.id === userId && !user.deleted_at)) return unauthorizedJson();
    const body = await parseJsonBody<LetterCondenseRequest>(request);
    if (!body) return errorJson(400, "invalid json");

    const input = normalizeLetterCondenseInput(body);
    if (!hasLetterCondenseContent(input)) return errorJson(400, "doubt or nodes is required");

    const fallback = fallbackCondense(input);
    if (!input.allowRemoteProcessing) return okJson(fallback);
    const hasRequestAiSettings = Boolean(input.ai);
    const ai = normalizeAiApiSettings(input.ai);
    const envDefaults = getAiProviderDefaults(DEFAULT_AI_PROVIDER);
    const providerDefaults = getAiProviderDefaults(ai.provider);
    const apiKey = hasRequestAiSettings
      ? ai.apiKey
      : process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
    if (!apiKey) return okJson(fallback);

    let baseUrl: string;
    try {
      baseUrl = hasRequestAiSettings
        ? resolveAiBaseUrl(ai.baseUrl, providerDefaults.baseUrl, "client")
        : resolveAiBaseUrl(
            process.env.AI_BASE_URL || process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL,
            envDefaults.baseUrl,
            "server"
          );
    } catch (error) {
      if (error instanceof UnsafeAiEndpointError) return errorJson(400, "AI endpoint is not allowed");
      throw error;
    }
    const model = hasRequestAiSettings ? ai.model : process.env.AI_MODEL || process.env.OPENAI_MODEL || envDefaults.model;

    let aiResponse: Awaited<ReturnType<typeof callChatCompletions>> | null = null;
    try {
      aiResponse = await callChatCompletions({
        input,
        apiKey,
        baseUrl,
        model,
        endpointSource: hasRequestAiSettings ? "client" : "server"
      });
    } catch (error) {
      if (error instanceof UnsafeAiEndpointError) return errorJson(400, "AI endpoint is not allowed");
      logWarn("letter.condense.ai_network_failed", {
        error: error instanceof Error ? trimText(error.message, 200) : "unknown"
      });
    }

    if (!aiResponse) return okJson(fallback);
    if (!aiResponse.ok) {
      logWarn("letter.condense.ai_failed", {
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

async function callChatCompletions({
  input,
  apiKey,
  baseUrl,
  model,
  endpointSource
}: {
  input: ReturnType<typeof normalizeLetterCondenseInput>;
  apiKey: string;
  baseUrl: string;
  model: string;
  endpointSource: "client" | "server";
}) {
  const response = await fetchAiEndpoint(`${baseUrl}/chat/completions`, {
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
            [
              "你是知惑的信笺凝练助手。你的任务是忠实压缩，不是替用户解释人生或提供答案。",
              "只使用用户明确写过的信息；保留尚未解决、矛盾和犹豫，不补充因果，不推测动机，不制造结论。",
              "使用第一人称或无主语短句，不把用户称为“你”，不使用导师、鸡汤、诊断或命令口吻。",
              "禁用空泛升华和套话，包括但不限于：答案就在心中、时间会证明、勇敢前行、拥抱变化、成为更好的自己、这是一场旅程。",
              "标题应来自原始疑问的核心词，不夸张、不诗化过度；正文按思考发生的顺序保留关键转折。",
              "只返回 JSON，不要 Markdown。结构必须为 {\"title\":\"...\",\"lines\":[\"...\",\"...\",\"...\"]}。",
              "标题不超过 24 个字；正文 3 到 5 行，每行不超过 28 个字。",
              "合格示例：输入含“想先试一个月，但担心中途放弃”，可写为“先试一个月 / 仍担心自己中途停下”。",
              "不合格示例：不要写“答案已经在路上”“相信自己的选择”。"
            ].join("\n")
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
  }, endpointSource);
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
