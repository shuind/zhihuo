import type { Scene, SceneStar, SceneStrand, StarRole } from "../stage/scene-types"

export function validateScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  const core = obj.core
  if (!core || typeof core !== "object") return null
  const coreObj = core as Record<string, unknown>
  if (typeof coreObj.text !== "string") return null

  const stars: SceneStar[] = []
  const seenStarIds = new Set<string>()
  const rawStars = Array.isArray(obj.stars) ? obj.stars : []
  for (const item of rawStars) {
    if (!item || typeof item !== "object") continue
    const rawStar = item as Record<string, unknown>
    const id = typeof rawStar.id === "string" && rawStar.id.trim() ? rawStar.id.trim() : null
    if (!id || seenStarIds.has(id)) continue

    const role = normalizeRole(rawStar.role)
    let ring = clampInt(rawStar.ring, 0, 4, 2) as 0 | 1 | 2 | 3 | 4
    if (ring === 0 && role !== "hero") ring = 1

    const text =
      typeof rawStar.text === "string" && rawStar.text.trim()
        ? rawStar.text.trim().slice(0, 80)
        : undefined
    const timestamp =
      typeof rawStar.timestamp === "string" && rawStar.timestamp.trim()
        ? rawStar.timestamp.trim().slice(0, 16)
        : undefined
    const trackId =
      typeof rawStar.trackId === "string" && rawStar.trackId.trim()
        ? rawStar.trackId.trim()
        : undefined
    const nodeId =
      typeof rawStar.nodeId === "string" && rawStar.nodeId.trim()
        ? rawStar.nodeId.trim()
        : undefined

    seenStarIds.add(id)
    stars.push({
      id,
      ring,
      angle: wrapAngle(Number(rawStar.angle)),
      drift: clampNumber(rawStar.drift, -2, 2, 0),
      role,
      halo: role === "hero" && rawStar.halo === true,
      text,
      timestamp,
      trackId,
      nodeId,
    })
  }

  let haloCount = 0
  for (const star of stars) {
    if (!star.halo) continue
    haloCount += 1
    if (haloCount > 2) star.halo = false
  }

  const validStarIds = new Set(stars.map((star) => star.id))
  const strands: SceneStrand[] = []
  const seenStrandIds = new Set<string>()
  const rawStrands = Array.isArray(obj.strands) ? obj.strands : []
  for (const item of rawStrands) {
    if (!item || typeof item !== "object") continue
    const rawStrand = item as Record<string, unknown>
    const id =
      typeof rawStrand.id === "string" && rawStrand.id.trim()
        ? rawStrand.id.trim()
        : `strand_${strands.length}`
    if (seenStrandIds.has(id)) continue

    const fromId = typeof rawStrand.fromId === "string" ? rawStrand.fromId : null
    const toId = typeof rawStrand.toId === "string" ? rawStrand.toId : null
    if (!fromId || !toId || fromId === toId) continue
    if (!validStarIds.has(fromId) || !validStarIds.has(toId)) continue

    seenStrandIds.add(id)
    strands.push({
      id,
      fromId,
      toId,
      weight: clampNumber(rawStrand.weight, 0, 1, 0.5),
      detour: clampNumber(rawStrand.detour, -1, 1, 0),
      dustCount: clampInt(rawStrand.dustCount, 0, 7, 3),
    })
  }

  return {
    core: {
      text: coreObj.text,
      intensity: clampInt(coreObj.intensity, 0, 2, 1) as 0 | 1 | 2,
    },
    stars,
    strands,
    ambientStarCount: clampInt(obj.ambientStarCount, 0, 200, 80),
  }
}

function normalizeRole(value: unknown): StarRole {
  if (value === "hero" || value === "support" || value === "echo" || value === "ambient") {
    return value
  }
  return "ambient"
}

function wrapAngle(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
