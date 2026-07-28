import { NextRequest } from "next/server";

import { validateScene } from "@/components/thinking/star-map/director/scene-validator";
import { updateUserDbScoped } from "@/lib/server/db";
import { errorJson, extractClientMutationMeta, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http";
import { withApiRoute } from "@/lib/server/observability";
import { updateSpaceStarMapState, type StarMapStatePatch } from "@/lib/server/store";
import { nowIso } from "@/lib/server/utils";

type StarMapBody = {
  scene_signature?: string | null;
  curated_scene?: unknown;
  curated_at?: string | null;
  placements_signature?: string | null;
  star_placements?: unknown;
  placements_updated_at?: string | null;
  client_mutation_id?: string;
  client_updated_at?: string;
};

export const POST = withApiRoute(
  "thinking.spaces.star_map",
  async (request: NextRequest, { params }: { params: { spaceId: string } }) => {
    const body = await parseJsonBody<StarMapBody>(request);
    const { clientMutationId, clientUpdatedAt } = extractClientMutationMeta(body);

    const userId = getUserId(request);
    if (!userId) return unauthorizedJson();
    if (!body) return errorJson(400, "请求体无效");

    const patch = normalizeStarMapBody(body);
    if (patch.kind === "invalid_scene") return errorJson(400, "星图场景无效");
    if (patch.kind === "invalid_placements") return errorJson(400, "星位数据无效");
    if (patch.kind !== "ok") return errorJson(400, "星图状态无效");

    const resultRef: { value: ReturnType<typeof updateSpaceStarMapState> | null } = { value: null };
    await updateUserDbScoped(userId, ["thinking_spaces", "thinking_space_meta"], (db) => {
      resultRef.value = updateSpaceStarMapState(db, userId, params.spaceId, patch.value);
    });

    const result = resultRef.value;
    if (!result) return errorJson(500, "星图保存失败");
    if (result.kind === "not_found") return errorJson(404, "空间不存在");
    if (result.kind === "readonly") return errorJson(409, "空间不是进行中状态");
    if (result.kind === "invalid_scene") return errorJson(400, "星图场景无效");
    if (result.kind === "invalid_placements") return errorJson(400, "星位数据无效");

    return okJson({
      ok: true,
      star_map_scene_signature: result.star_map_scene_signature,
      star_map_curated_scene: result.star_map_curated_scene,
      star_map_curated_at: result.star_map_curated_at,
      star_map_star_placements: result.star_map_star_placements,
      star_map_placements_signature: result.star_map_placements_signature,
      star_map_placements_updated_at: result.star_map_placements_updated_at,
      updated_at: clientUpdatedAt ?? nowIso(),
      client_mutation_id: clientMutationId
    });
  },
  { rateLimit: { bucket: "thinking-space-star-map", max: 60, windowMs: 60 * 1000 } }
);

function normalizeStarMapBody(body: StarMapBody): { kind: "ok"; value: StarMapStatePatch } | { kind: "invalid_scene" | "invalid_placements" } {
  const patch: StarMapStatePatch = {};

  if (Object.prototype.hasOwnProperty.call(body, "curated_scene")) {
    if (body.curated_scene === null) {
      patch.curatedScene = null;
      patch.sceneSignature = null;
      patch.curatedAt = null;
    } else {
      const scene = validateScene(body.curated_scene);
      if (!scene) return { kind: "invalid_scene" };
      patch.curatedScene = scene as unknown as Record<string, unknown>;
      patch.sceneSignature = typeof body.scene_signature === "string" ? body.scene_signature : null;
      patch.curatedAt = typeof body.curated_at === "string" ? body.curated_at : null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "star_placements")) {
    if (body.star_placements === null) {
      patch.starPlacements = null;
      patch.placementsSignature = null;
      patch.placementsUpdatedAt = null;
    } else {
      const placements = normalizePlacements(body.star_placements);
      if (!placements) return { kind: "invalid_placements" };
      patch.starPlacements = placements;
      patch.placementsSignature = typeof body.placements_signature === "string" ? body.placements_signature : null;
      patch.placementsUpdatedAt = typeof body.placements_updated_at === "string" ? body.placements_updated_at : null;
    }
  }

  return { kind: "ok", value: patch };
}

function normalizePlacements(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const placements: NonNullable<StarMapStatePatch["starPlacements"]> = {};
  for (const [starId, rawPlacement] of Object.entries(value as Record<string, unknown>)) {
    if (!rawPlacement || typeof rawPlacement !== "object" || Array.isArray(rawPlacement)) continue;
    const item = rawPlacement as Record<string, unknown>;
    const ring = Number(item.ring);
    if (ring !== 1 && ring !== 2 && ring !== 3 && ring !== 4) continue;
    const angle = Number(item.angle);
    const drift = Number(item.drift);
    placements[starId] = {
      ring,
      angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0,
      drift: Number.isFinite(drift) ? Math.max(-2, Math.min(2, drift)) : 0
    };
  }
  return placements;
}
