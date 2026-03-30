import { NextRequest, NextResponse } from "next/server";

import { getAuthCookieName, readSessionToken } from "@/lib/server/auth";

export function getUserId(request: NextRequest) {
  const sessionToken = request.cookies.get(getAuthCookieName())?.value;
  const session = readSessionToken(sessionToken);
  if (session?.uid) return session.uid;
  const allowUserHeader = process.env.ALLOW_USER_HEADER === "true" && process.env.NODE_ENV !== "production";
  if (allowUserHeader) {
    const fromHeader = request.headers.get("x-user-id")?.trim();
    if (fromHeader) return fromHeader;
  }
  return null;
}

export function okJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorJson(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorizedJson(message = "未授权") {
  return errorJson(401, message);
}

export async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
