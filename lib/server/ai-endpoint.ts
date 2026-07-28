import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normalizeBaseUrl } from "@/lib/ai-settings";

const BUILT_IN_AI_ORIGINS = new Set(["https://api.deepseek.com", "https://api.openai.com"]);

function configuredOrigins() {
  const result = new Set(BUILT_IN_AI_ORIGINS);
  for (const raw of (process.env.AI_ALLOWED_BASE_URLS ?? "").split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      result.add(new URL(value).origin.toLowerCase());
    } catch {
      // Invalid operator configuration is ignored and never broadens access.
    }
  }
  return result;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

function isPrivateIp(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split(".").map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
      octets[0] === 0 ||
      octets[0] >= 224
    );
  }
  if (family === 6) {
    const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return (
      normalized === "::" ||
      normalized === "::1" ||
      Boolean(mappedV4 && isPrivateIp(mappedV4)) ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff")
    );
  }
  return false;
}

export class UnsafeAiEndpointError extends Error {
  constructor() {
    super("AI endpoint is not allowed");
    this.name = "UnsafeAiEndpointError";
  }
}

export function resolveAiBaseUrl(
  value: unknown,
  fallback: string,
  source: "client" | "server"
) {
  const normalized = normalizeBaseUrl(value, fallback);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new UnsafeAiEndpointError();
  }

  if (url.username || url.password) throw new UnsafeAiEndpointError();
  const allowLocalCiEndpoint = process.env.CI === "true" && url.protocol === "http:" && isLoopbackHostname(url.hostname);
  if (allowLocalCiEndpoint) return normalized;

  if (url.protocol !== "https:") throw new UnsafeAiEndpointError();
  if (isLoopbackHostname(url.hostname) || isPrivateIp(url.hostname)) throw new UnsafeAiEndpointError();

  if (source === "client" && !configuredOrigins().has(url.origin.toLowerCase())) {
    throw new UnsafeAiEndpointError();
  }
  return normalized;
}

async function assertPublicDns(url: URL) {
  if (process.env.CI === "true" && url.protocol === "http:" && isLoopbackHostname(url.hostname)) return;
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new UnsafeAiEndpointError();
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeAiEndpointError();
  }
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) {
    throw new UnsafeAiEndpointError();
  }
}

export async function fetchAiEndpoint(
  input: string,
  init: RequestInit,
  source: "client" | "server"
) {
  let current = new URL(input);
  const originalOrigin = current.origin;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    resolveAiBaseUrl(current.toString(), current.toString(), source);
    await assertPublicDns(current);
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new UnsafeAiEndpointError();
    const next = new URL(location, current);
    // Never forward an API key to a different origin through a redirect.
    if (next.origin !== originalOrigin) throw new UnsafeAiEndpointError();
    current = next;
  }

  throw new UnsafeAiEndpointError();
}
