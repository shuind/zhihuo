import type { Scene, SceneStar, SceneStrand, StarRole } from "../stage/scene-types"

/**
 * Clamp + repair an LLM-produced Scene so the stage never blows up.
 * - dedupes ids
 * - clamps ring to 0..4, angle to 0..360
 * - drops strands that reference unknown ids
 * - enforces "ring 0 mostly empty" by demoting ring 0 supports/ambient to ring 1
 * - converts empty-string text to null (so the stage hides them)
 */
export function validateScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  const core = obj.core as Record<string, unknown> | undefined
  if (!core || typeof core.text !== "string") return null
  const intensity = clampInt(core.intensity, 0, 2, 1) as 0 | 1 | 2

  const seenIds = new Set<string>()
  const stars: SceneStar[] = []
  const rawStars = Array.isArray(obj.stars) ? obj.stars : []

  for (const s of rawStars) {
    if (!s || typeof s !== "object") continue
    const star = s as Record<string, unknown>
    const id = typeof star.id === "string" ? star.id : null
    if (!id || seenIds.has(id)) continue

    let ring = clampInt(star.ring, 0, 4, 2) as 0 | 1 | 2 | 3 | 4
    const role = normalizeRole(star.role)
    // Ring 0 is reserved for very rare hero placement; demote others.
    if (ring === 0 && role !== "hero") ring = 1

    const angle = ((Number(star.angle) || 0) % 360 + 360) % 360
    const drift = clampNumber(star.drift, -2, 2, 0)
    const text =
      typeof star.text === "string" && star.text.trim().length > 0
        ? star.text.trim().slice(0, 80)
        : undefined
    const timestamp =
      typeof star.timestamp === "string" && star.timestamp.length > 0
        ? star.timestamp.slice(0, 16)
        : undefined
    const halo = role === "hero" && star.halo === true

    const trackId = typeof star.trackId === "string" ? star.trackId : undefined
    const nodeId = typeof star.nodeId === "string" ? star.nodeId : undefined

    seenIds.add(id)
    stars.push({
      id,
      ring,
      angle,
      drift,
      role,
      halo,
      text,
      timestamp,
      trackId,
      nodeId,
    })
  }

  // Cap halo to at most 2.
  let haloCount = 0
  for (const star of stars) {
    if (star.halo) {
      haloCount++
      if (haloCount > 2) star.halo = false
    }
  }

  const strands: SceneStrand[] = []
  const rawStrands = Array.isArray(obj.strands) ? obj.strands : []
  const strandIds = new Set<string>()
  for (const t of rawStrands) {
    if (!t || typeof t !== "object") continue
    const strand = t as Record<string, unknown>
    const id =
      typeof strand.id === "string" && strand.id.length > 0
        ? strand.id
        : `t_${strands.length}`
    if (strandIds.has(id)) continue
    const fromId = typeof strand.fromId === "string" ? strand.fromId : null
    const toId = typeof strand.toId === "string" ? strand.toId : null
    if (!fromId || !toId || fromId === toId) continue
    if (!seenIds.has(fromId) || !seenIds.has(toId)) continue
    strandIds.add(id)
    strands.push({
      id,
      fromId,
      toId,
      weight: clampNumber(strand.weight, 0, 1, 0.5),
      detour: clampNumber(strand.detour, -1, 1, 0),
      dustCount: clampInt(strand.dustCount, 0, 7, 3),
    })
  }

  const ambientStarCount = clampInt(obj.ambientStarCount, 0, 200, 80)

  return {
    core: { text: core.text, intensity },
    stars,
    strands,
    ambientStarCount,
  }
}

function normalizeRole(value: unknown): StarRole {
  if (value === "hero" || value === "support" || value === "echo" || value === "ambient") {
    return value
  }
  return "ambient"
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
