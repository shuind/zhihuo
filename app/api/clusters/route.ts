import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/server/request";
import { listClusters } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const items = await listClusters(userId);

  return NextResponse.json({
    userId,
    items
  });
}
