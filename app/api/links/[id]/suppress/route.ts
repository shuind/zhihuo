import { NextRequest, NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/server/request";
import { suppressLink } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  const { id } = await context.params;

  const updated = await suppressLink(userId, id);
  if (!updated) {
    return NextResponse.json({ error: "link not found" }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}
