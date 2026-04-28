import type { Scene, SceneStar, StarRole } from "./scene-types"

// ---------- compiled types ----------

export interface CompiledStar extends SceneStar {
  x: number
  y: number
  /** size in px */
  r: number
  opacity: number
}

export interface CompiledStrand {
  id: string
  fromId: string
  toId: string
  fromXY: { x: number; y: number }
  toXY: { x: number; y: number }
  control: { x: number; y: number }
  weight: number
  dustPoints: Array<{ x: number; y: number }>
}

export interface CompiledAmbient {
  x: number
  y: number
  r: number
  opacity: number
}

export interface CompiledScene {
  width: number
  height: number
  core: { x: number; y: number; r: number; text: string; intensity: number }
  stars: CompiledStar[]
  strands: CompiledStrand[]
  ambient: CompiledAmbient[]
}

// ---------- visual presets per role ----------

const ROLE_SIZE: Record<StarRole, number> = {
  hero: 4.2,
  support: 2.6,
  echo: 1.9,
  ambient: 1.3,
}

const ROLE_OPACITY: Record<StarRole, number> = {
  hero: 1.0,
  support: 0.8,
  echo: 0.5,
  ambient: 0.32,
}

// ---------- compiler ----------

export function compileScene(
  scene: Scene,
  width: number,
  height: number,
  seed: string
): CompiledScene {
  const cx = width / 2
  const cy = height / 2
  const minDim = Math.min(width, height)

  // ring radii are proportional to the smaller dimension so the layout
  // breathes at any aspect ratio without ever clipping at the edge
  const rings: number[] = [
    0,
    minDim * 0.16, // ring 1 close to core
    minDim * 0.28, // ring 2 mid
    minDim * 0.40, // ring 3 far
    minDim * 0.50, // ring 4 edge
  ]
  const coreR = minDim * 0.10

  const rng = makeRng(seed)

  // -------- stars --------
  const compiledStars: CompiledStar[] = scene.stars.map((star) => {
    const baseR = rings[Math.min(4, Math.max(0, star.ring))] ?? rings[2]
    const driftPx = (star.drift ?? 0) * (minDim * 0.025)
    // hand-placed jitter: small radial + angular wobble seeded so a given
    // space always renders the same way
    const jitterR = (rng() - 0.5) * minDim * 0.018
    const jitterA = (rng() - 0.5) * 0.06
    const r = Math.max(0, baseR + driftPx + jitterR)
    const a = (star.angle * Math.PI) / 180 + jitterA
    return {
      ...star,
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      r: ROLE_SIZE[star.role],
      opacity: ROLE_OPACITY[star.role],
    }
  })

  const byId = new Map(compiledStars.map((s) => [s.id, s]))

  // -------- strands --------
  const compiledStrands: CompiledStrand[] = []
  for (const strand of scene.strands) {
    const a = byId.get(strand.fromId)
    const b = byId.get(strand.toId)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // perpendicular unit vector (rotate 90 ccw in screen coords)
    const px = -dy / len
    const py = dx / len
    const detour = strand.detour ?? 0
    // also add a tiny seeded wobble so detour=0 lines aren't dead straight
    const wobble = (rng() - 0.5) * 0.15
    const offset = len * (0.18 * detour + wobble)
    const mx = (a.x + b.x) / 2 + px * offset
    const my = (a.y + b.y) / 2 + py * offset

    // dust dots along quadratic bezier
    const dustCount = strand.dustCount ?? 4
    const dust: Array<{ x: number; y: number }> = []
    for (let i = 1; i <= dustCount; i++) {
      const t = i / (dustCount + 1)
      const omt = 1 - t
      dust.push({
        x: omt * omt * a.x + 2 * omt * t * mx + t * t * b.x,
        y: omt * omt * a.y + 2 * omt * t * my + t * t * b.y,
      })
    }

    compiledStrands.push({
      id: strand.id,
      fromId: strand.fromId,
      toId: strand.toId,
      fromXY: { x: a.x, y: a.y },
      toXY: { x: b.x, y: b.y },
      control: { x: mx, y: my },
      weight: strand.weight,
      dustPoints: dust,
    })
  }

  // -------- ambient noise stars (background depth) --------
  const ambient: CompiledAmbient[] = []
  const ambientCount = scene.ambientStarCount ?? 90
  let attempts = 0
  while (ambient.length < ambientCount && attempts < ambientCount * 4) {
    attempts++
    const angle = rng() * Math.PI * 2
    const r = rings[1] * 0.7 + rng() * (rings[4] * 1.25 - rings[1] * 0.7)
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue
    // avoid the very inner zone (core glow takes care of it)
    const fromCenter = Math.hypot(x - cx, y - cy)
    if (fromCenter < coreR * 1.4) continue
    ambient.push({
      x,
      y,
      r: 0.5 + rng() * 0.7,
      opacity: 0.10 + rng() * 0.30,
    })
  }

  return {
    width,
    height,
    core: { x: cx, y: cy, r: coreR, text: scene.core.text, intensity: scene.core.intensity },
    stars: compiledStars,
    strands: compiledStrands,
    ambient,
  }
}

// ---------- seeded RNG (mulberry32 + FNV-1a) ----------

export function makeRng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let s = h >>> 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
