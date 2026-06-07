import { validateScene } from "@/components/thinking/star-map/director/scene-validator";
import type { StarMapStatePatch } from "@/lib/server/store";

function normalizeStarMapPlacements(value: unknown): StarMapStatePatch["starPlacements"] {
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

export function buildStarMapPatch(payload: Record<string, unknown>): StarMapStatePatch | null {
  const patch: StarMapStatePatch = {};
  if (Object.prototype.hasOwnProperty.call(payload, "curated_scene")) {
    if (payload.curated_scene === null) {
      patch.curatedScene = null;
      patch.sceneSignature = null;
      patch.curatedAt = null;
    } else {
      const scene = validateScene(payload.curated_scene);
      if (!scene) return null;
      patch.curatedScene = scene as unknown as Record<string, unknown>;
      patch.sceneSignature = typeof payload.scene_signature === "string" ? payload.scene_signature : null;
      patch.curatedAt = typeof payload.curated_at === "string" ? payload.curated_at : null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "star_placements")) {
    if (payload.star_placements === null) {
      patch.starPlacements = null;
      patch.placementsSignature = null;
      patch.placementsUpdatedAt = null;
    } else {
      const placements = normalizeStarMapPlacements(payload.star_placements);
      if (!placements) return null;
      patch.starPlacements = placements;
      patch.placementsSignature = typeof payload.placements_signature === "string" ? payload.placements_signature : null;
      patch.placementsUpdatedAt = typeof payload.placements_updated_at === "string" ? payload.placements_updated_at : null;
    }
  }
  return patch;
}
