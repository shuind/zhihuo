import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/server/request";
import { createDoubt, listDoubts } from "@/lib/server/repository";
import { Layer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLayer(value: unknown): Layer | undefined {
  if (value === "life" || value === "learning") {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor");

  const result = await listDoubts(userId, {
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
    cursor
  });

  return NextResponse.json({
    userId,
    ...result
  });
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as {
    rawText?: unknown;
    layer?: unknown;
  } | null;

  const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const created = await createDoubt(userId, {
    rawText,
    layer: parseLayer(body?.layer)
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
