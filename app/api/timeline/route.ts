import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/server/request";
import { listTimeline } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const yearParam = Number(request.nextUrl.searchParams.get("year"));
  const clusterId = request.nextUrl.searchParams.get("clusterId") ?? undefined;
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));

  const items = await listTimeline(userId, {
    year: Number.isFinite(yearParam) ? yearParam : undefined,
    clusterId: clusterId || undefined,
    limit: Number.isFinite(limitParam) ? limitParam : undefined
  });

  return NextResponse.json({
    userId,
    items
  });
}
