import "server-only";

import { NextRequest } from "next/server";

const FALLBACK_USER_ID = "user-demo-001";

export function getUserIdFromRequest(request: NextRequest): string {
  const byHeader = request.headers.get("x-user-id")?.trim();
  if (byHeader) {
    return byHeader;
  }

  const byQuery = request.nextUrl.searchParams.get("userId")?.trim();
  if (byQuery) {
    return byQuery;
  }

  return FALLBACK_USER_ID;
}
