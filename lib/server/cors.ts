import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MOBILE_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost"];

function configuredOrigins() {
  const raw = process.env.APP_CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameOrigin(request: NextRequest) {
  return `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export function getAllowedCorsOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return null;
  if (origin === sameOrigin(request)) return origin;
  const allowed = new Set([...DEFAULT_MOBILE_ORIGINS, ...configuredOrigins()]);
  return allowed.has(origin) ? origin : null;
}

export function isAllowedCrossOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();
  return Boolean(origin && origin !== sameOrigin(request) && getAllowedCorsOrigin(request));
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
  const response = new NextResponse(null, { status: 204 });
  applyCorsHeaders(response, request);
  return response;
}
