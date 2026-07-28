import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MOBILE_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost"];

function configuredOrigins() {
  const raw = process.env.APP_CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function requestOrigins(request: NextRequest) {
  const origins = new Set([`${request.nextUrl.protocol}//${request.nextUrl.host}`]);
  const host = request.headers.get("host")?.trim();
  if (host) origins.add(`${request.nextUrl.protocol}//${host}`);

  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
      origins.add(`${forwardedProto}://${forwardedHost}`);
    }
  }
  return origins;
}

function isSameOrigin(request: NextRequest, origin: string) {
  return requestOrigins(request).has(origin);
}

export function isTrustedRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();
  if (origin) return isSameOrigin(request, origin) || Boolean(getAllowedCorsOrigin(request));
  return request.headers.get("sec-fetch-site")?.toLowerCase() !== "cross-site";
}

export function getAllowedCorsOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return null;
  if (isSameOrigin(request, origin)) return origin;
  const allowed = new Set([...DEFAULT_MOBILE_ORIGINS, ...configuredOrigins()]);
  return allowed.has(origin) ? origin : null;
}

export function isAllowedCrossOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();
  return Boolean(origin && !isSameOrigin(request, origin) && getAllowedCorsOrigin(request));
}

export function applyCorsHeaders(response: Response, request: NextRequest) {
  const origin = getAllowedCorsOrigin(request);
  if (!origin) return response;
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-credentials", "true");
  response.headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  response.headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ?? "content-type,x-request-id"
  );
  response.headers.append("vary", "Origin");
  return response;
}

export function corsPreflightResponse(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }
  const response = new NextResponse(null, { status: 204 });
  applyCorsHeaders(response, request);
  return response;
}
