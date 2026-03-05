import { NextRequest, NextResponse } from "next/server";

import { getAuthCookieName } from "@/lib/server/auth";
import { withApiRoute } from "@/lib/server/observability";

export const POST = withApiRoute("auth.logout", async (_request: NextRequest) => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
});
