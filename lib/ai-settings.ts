export type AiProvider = "deepseek";

export type AiApiSettings = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const AI_SETTINGS_STORAGE_KEY = "zhihuo_ai_api_settings_v1";
export const DEFAULT_AI_PROVIDER: AiProvider = "deepseek";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export const DEFAULT_AI_SETTINGS: AiApiSettings = {
  provider: DEFAULT_AI_PROVIDER,
  apiKey: "",
  baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
  model: DEFAULT_DEEPSEEK_MODEL
};

export function normalizeAiApiSettings(
  input:
    | {
        provider?: unknown;
        apiKey?: unknown;
        baseUrl?: unknown;
        model?: unknown;
      }
    | null
    | undefined
): AiApiSettings {
  return {
    provider: input?.provider === "deepseek" ? "deepseek" : DEFAULT_AI_PROVIDER,
    apiKey: typeof input?.apiKey === "string" ? input.apiKey.trim() : "",
    baseUrl: normalizeBaseUrl(input?.baseUrl, DEFAULT_DEEPSEEK_BASE_URL),
    model: typeof input?.model === "string" && input.model.trim() ? input.model.trim() : DEFAULT_DEEPSEEK_MODEL
  };
}

export function loadAiApiSettings(): AiApiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    return normalizeAiApiSettings(JSON.parse(raw) as Partial<AiApiSettings>);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiApiSettings(settings: Partial<AiApiSettings>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAiApiSettings(settings)));
}

export function clearAiApiSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
}

export function normalizeBaseUrl(value: unknown, fallback = DEFAULT_DEEPSEEK_BASE_URL) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(trimmed)) return fallback;
  return trimmed;
}
