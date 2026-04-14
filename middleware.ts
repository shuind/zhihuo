import { NextRequest, NextResponse } from "next/server";

import { corsPreflightResponse } from "@/lib/server/cors";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/v1/") && request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/v1/:path*"
};
