import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

type JsonLike = string | number | boolean | null | JsonLike[] | { [k: string]: JsonLike };

type RateLimitPolicy = {
  bucket: string;
  max: number;
  windowMs: number;
};

type RequestMeta = {
  requestId: string;
  method: string;
  path: string;
  userAgent: string;
  ip: string;
  startedAt: number;
};

type WrappedContext = { params?: Record<string, string | string[]> };
type RouteHandler<Context extends WrappedContext> = (request: NextRequest, context: Context, meta: RequestMeta) => Promise<Response>;

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_RESPONSE_BYTES = Math.max(
  1,
  Number.parseInt(process.env.MONITOR_DEFAULT_RESPONSE_BYTES ?? "12288", 10) || 12288
);

function pruneRateLimitStore(now: number) {
  if (rateLimitStore.size < 500) return;
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) rateLimitStore.delete(key);
  }
}

function getClientIp(request: NextRequest) {
  const candidate =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";
  return candidate || "unknown";
}

function shouldRecordTraffic(path: string) {
  return path.startsWith("/v1/") && path !== "/v1/health";
}

function responseBytes(response: Response) {
  const header = response.headers.get("content-length");
  if (header) {
    const parsed = Number(header);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_RESPONSE_BYTES;
}

async function recordTraffic(path: string, status: number, bytes: number) {
  if (!shouldRecordTraffic(path)) return;
  try {
    const { recordApiMinuteStat } = await import("@/lib/server/db");
    await recordApiMinuteStat({ route: path, status, responseBytes: bytes });
  } catch (error) {
    logWarn("monitor.traffic.record_failed", {
      path,
      status,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function getRequestId(request: NextRequest) {
  const fromHeader = request.headers.get("x-request-id")?.trim();
  if (fromHeader) return fromHeader;
  return randomUUID();
}

export function logInfo(event: string, fields?: Record<string, JsonLike>) {
  console.info(JSON.stringify({ level: "info", ts: new Date().toISOString(), event, ...(fields ?? {}) }));
}

export function logWarn(event: string, fields?: Record<string, JsonLike>) {
  console.warn(JSON.stringify({ level: "warn", ts: new Date().toISOString(), event, ...(fields ?? {}) }));
}

export function logError(event: string, fields?: Record<string, JsonLike>) {
  console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), event, ...(fields ?? {}) }));
}

function checkRateLimit(key: string, policy: RateLimitPolicy) {
  const now = Date.now();
  pruneRateLimitStore(now);

  const previous = rateLimitStore.get(key);
  if (!previous || previous.resetAt <= now) {
    const resetAt = now + policy.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { ok: true, remaining: policy.max - 1, resetAt };
  }

  if (previous.count >= policy.max) {
    return { ok: false, remaining: 0, resetAt: previous.resetAt };
  }

  previous.count += 1;
  return { ok: true, remaining: Math.max(0, policy.max - previous.count), resetAt: previous.resetAt };
}

export function withApiRoute<Context extends WrappedContext>(
  name: string,
  handler: RouteHandler<Context>,
  options?: { rateLimit?: RateLimitPolicy }
) {
  return async (request: NextRequest, context: Context = {} as Context) => {
    const startedAt = Date.now();
    const requestId = getRequestId(request);
    const meta: RequestMeta = {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      userAgent: request.headers.get("user-agent") ?? "",
      ip: getClientIp(request),
      startedAt
    };

    if (options?.rateLimit) {
      const bucket = `${options.rateLimit.bucket}:${meta.ip}`;
      const result = checkRateLimit(bucket, options.rateLimit);
      if (!result.ok) {
        const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
        logWarn("api.rate_limited", {
          requestId: meta.requestId,
          route: name,
          ip: meta.ip,
          retryAfterSeconds
        });
        const response = NextResponse.json({ error: "too many requests", request_id: meta.requestId }, { status: 429 });
        response.headers.set("x-request-id", meta.requestId);
        response.headers.set("retry-after", String(retryAfterSeconds));
        void recordTraffic(meta.path, response.status, responseBytes(response));
        return response;
      }
    }

    try {
      const response = await handler(request, context, meta);
      response.headers.set("x-request-id", meta.requestId);
      const durationMs = Date.now() - startedAt;
      logInfo("api.request", {
        requestId: meta.requestId,
        route: name,
        method: meta.method,
        path: meta.path,
        ip: meta.ip,
        status: response.status,
        durationMs
      });
      void recordTraffic(meta.path, response.status, responseBytes(response));
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logError("api.unhandled_error", {
        requestId: meta.requestId,
        route: name,
        method: meta.method,
        path: meta.path,
        ip: meta.ip,
        durationMs,
        error: error instanceof Error ? error.message : String(error)
      });
      const response = NextResponse.json(
        { error: "internal server error", request_id: meta.requestId },
        { status: 500 }
      );
      response.headers.set("x-request-id", meta.requestId);
      void recordTraffic(meta.path, response.status, responseBytes(response));
      return response;
    }
  };
}
