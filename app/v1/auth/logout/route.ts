import { NextRequest, NextResponse } from "next/server";

import { getAuthCookieName, getAuthCookieOptions } from "@/lib/server/auth";
import { withApiRoute } from "@/lib/server/observability";

export const POST = withApiRoute("auth.logout", async (request: NextRequest) => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAuthCookieName(), "", getAuthCookieOptions(request, 0));
  return response;
});
