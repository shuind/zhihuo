import type { ThinkingTrackNodeView, ThinkingTrackView } from "@/components/thinking-layer"
import type { Scene, SceneStar, SceneStrand, StarRole } from "../stage/scene-types"
import { makeRng } from "../stage/scene-compiler"

interface FallbackInput {
  rootText: string
  tracks: ThinkingTrackView[]
  activeTrackId?: string | null
  /** stable seed (typically the spaceId) so the layout doesn't twitch on rerender. */
  spaceSeed: string
}

/**
 * Tracks → Scene (no AI). Goal: "looks like someone with taste placed it".
 *
 * Principles:
 *  - Most stars are silent. Only ~1/3 carry text.
 *  - Heroes are spread by golden angle to feel scattered, not symmetric.
 *  - Stars from the same track get a soft angular bias toward their hero
 *    (so related ideas feel close — without explicit clusters or borders).
 *  - Rings 2/3 carry most of the weight; ring 0 is empty (core mystery).
 *  - Strands do not all radiate from core. They mostly chain time-adjacent
 *    nodes within a track, plus explicit echoes across tracks.
 */
export function buildFallbackScene(input: FallbackInput): Scene {
  const { rootText, tracks, activeTrackId, spaceSeed } = input

  // 1. flatten
  type Flat = {
    node: ThinkingTrackNodeView
    track: ThinkingTrackView
    indexInTrack: number
    timeMs: number
  }
  const flat: Flat[] = []
  for (const track of tracks) {
    for (let i = 0; i < track.nodes.length; i++) {
      const node = track.nodes[i]
      flat.push({
        node,
        track,
        indexInTrack: i,
        timeMs: node.createdAt ? new Date(node.createdAt).getTime() : Number.MAX_SAFE_INTEGER - i,
      })
    }
  }

  if (flat.length === 0) {
    return {
      core: { text: rootText || "", intensity: 1 },
      stars: [],
      strands: [],
      ambientStarCount: 70,
    }
  }

  // 2. score and rank
  const now = Date.now()
  const validTimes = flat.map((f) => f.timeMs).filter(Number.isFinite)
  const minTime = validTimes.length ? Math.min(...validTimes) : now
  const maxTime = validTimes.length ? Math.max(...validTimes) : minTime + 1
  const timeSpan = Math.max(1, maxTime - minTime)

  const ranked = flat
    .map((f) => {
      const text = f.node.questionText ?? ""
      const time = Number.isFinite(f.timeMs) ? f.timeMs : minTime
      const recency = (time - minTime) / timeSpan
      const lengthSignal = Math.min(text.length / 72, 1) * 0.22
      const onActive = f.track.id === activeTrackId ? 0.42 : 0
      const hasAnswer = f.node.answerText ? 0.44 : 0
      const hasNote = f.node.noteText ? 0.24 : 0
      const hasImage = f.node.imageAssetId ? 0.32 : 0
      const concrete = isConcreteText(text) ? 0.22 : 0
      const suggested = f.node.isSuggested ? -0.34 : 0
      const score = recency * 0.34 + lengthSignal + onActive + hasAnswer + hasNote + hasImage + concrete + suggested
      return { ...f, score }
    })
    .sort((a, b) => b.score - a.score)

  // 3. pick role bands. Keep a few readable anchors and let the rest stay quiet.
  const total = ranked.length
  const heroCount = total <= 2 ? total : total <= 7 ? 2 : clamp(Math.round(total * 0.16), 2, Math.min(4, total))
  const supportCount = clamp(
    Math.round(total * 0.22),
    total > heroCount ? 1 : 0,
    Math.min(5, Math.max(0, total - heroCount))
  )

  const heroes = ranked.slice(0, heroCount)
  const supports = ranked.slice(heroCount, heroCount + supportCount)
  const ambients = ranked.slice(heroCount + supportCount)

  // 4. layout
  const rng = makeRng(`${spaceSeed}::layout::v1`)
  const stars: SceneStar[] = []
  const idMap = new Map<string, string>() // nodeId -> starId

  const dominantAngle = wrapAngle(rng() * 360)
  const counterAngle = wrapAngle(dominantAngle + 132 + rng() * 42)
  const remoteAngle = wrapAngle(dominantAngle + 238 + rng() * 58)
  // remember each hero's angle so we can bias same-track stars toward it
  const heroAngleByTrack = new Map<string, number>()
  const heroAngleAll: number[] = []

  heroes.forEach((h, i) => {
    const ringRoll = rng()
    const ring: 1 | 2 = i === 0 ? 1 : ringRoll < 0.55 ? 2 : 1
    const baseAngle = i === 0 ? dominantAngle : i === 1 ? counterAngle : remoteAngle + i * 29
    const angle = wrapAngle(baseAngle + (rng() - 0.5) * (i === 0 ? 18 : 28))
    const drift = (rng() - 0.5) * 1.35
    const id = mkId(h.node.id)
    idMap.set(h.node.id, id)
    heroAngleAll.push(angle)
    if (!heroAngleByTrack.has(h.track.id)) heroAngleByTrack.set(h.track.id, angle)
    stars.push({
      id,
      ring,
      angle,
      drift,
      role: "hero",
      halo: i < 2,
      text: cleanText(h.node.questionText, h.node.answerText),
      timestamp: hhmm(h.node.createdAt),
      trackId: h.track.id,
      nodeId: h.node.id,
    })
  })

  // Supports: bias toward the hero of the same track if any, otherwise toward
  // the nearest "free" zone. Always at ring 2 or 3.
  supports.forEach((s, i) => {
    const heroAngle = heroAngleByTrack.get(s.track.id) ?? pickAngleAwayFrom(heroAngleAll, rng)
    const side = (i % 2 === 0 ? 1 : -1) * (35 + rng() * 35) // 35..70 deg off the hero
    const angle = wrapAngle(heroAngle + side + (rng() - 0.5) * 18)
    const ring: 2 | 3 = rng() < 0.55 ? 2 : 3
    const drift = (rng() - 0.5) * 1.8
    const id = mkId(s.node.id)
    idMap.set(s.node.id, id)
    stars.push({
      id,
      ring,
      angle,
      drift,
      role: "support",
      halo: false,
      text: cleanText(s.node.questionText, s.node.answerText),
      timestamp: hhmm(s.node.createdAt),
      trackId: s.track.id,
      nodeId: s.node.id,
    })
  })

  // Ambients: silent dots. Most of them. Spread mostly on ring 2/3, a few on
  // ring 4 for depth. Soft bias toward their track's hero so same-track ideas
  // still cluster, but with enough random spread to avoid "fan" patterns.
  ambients.forEach((a) => {
    const heroAngle = heroAngleByTrack.get(a.track.id)
    const baseAngle =
      heroAngle != null
        ? heroAngle + (rng() - 0.5) * 150
        : pickAngleAwayFrom(heroAngleAll, rng)
    const angle = wrapAngle(baseAngle)
    const ringRoll = rng()
    const ring: 2 | 3 | 4 = ringRoll < 0.30 ? 2 : ringRoll < 0.85 ? 3 : 4
    const drift = (rng() - 0.5) * 2
    // role: most ambient, some "echo" (slightly brighter) — adds variety
    const role: StarRole = rng() < 0.30 ? "echo" : "ambient"
    const id = mkId(a.node.id)
    idMap.set(a.node.id, id)
    stars.push({
      id,
      ring,
      angle,
      drift,
      role,
      // no text → silent
      trackId: a.track.id,
      nodeId: a.node.id,
    })
  })

  // 5. strands. NOT all-to-core. Mostly within-track time chain, with
  // probabilistic skips to keep it sparse. Plus echo cross-links if present.
  const strands: SceneStrand[] = []
  const strandRng = makeRng(`${spaceSeed}::strands::v1`)

  // group flat by track in time order
  const byTrack = new Map<string, Flat[]>()
  for (const f of flat) {
    const list = byTrack.get(f.track.id) ?? []
    list.push(f)
    byTrack.set(f.track.id, list)
  }
  for (const [, list] of byTrack) {
    list.sort((a, b) => a.timeMs - b.timeMs)
    for (let i = 0; i < list.length - 1; i++) {
      const fromId = idMap.get(list[i].node.id)
      const toId = idMap.get(list[i + 1].node.id)
      if (!fromId || !toId) continue
      // probabilistic: heroes/supports more likely to keep the line; ambient often skipped
      const fromStar = stars.find((s) => s.id === fromId)
      const toStar = stars.find((s) => s.id === toId)
      const bothImportant =
        (fromStar?.role === "hero" || fromStar?.role === "support") &&
        (toStar?.role === "hero" || toStar?.role === "support")
      const keep = bothImportant ? strandRng() < 0.75 : strandRng() < 0.34
      if (!keep) continue
      strands.push({
        id: `t-${fromId}-${toId}`,
        fromId,
        toId,
        weight: bothImportant ? 0.55 + strandRng() * 0.26 : 0.22 + strandRng() * 0.22,
        detour: (strandRng() - 0.5) * 1.35,
        dustCount: bothImportant ? 4 + Math.floor(strandRng() * 3) : 2 + Math.floor(strandRng() * 3),
      })
    }
  }

  // explicit echoes (cross-track) — keep them
  for (const f of flat) {
    if (f.node.echoNodeId) {
      const fromId = idMap.get(f.node.id)
      const toId = idMap.get(f.node.echoNodeId)
      if (fromId && toId) {
        strands.push({
          id: `e-${fromId}-${toId}`,
          fromId,
          toId,
          weight: 0.38,
          detour: (strandRng() - 0.5) * 1.3,
          dustCount: 2 + Math.floor(strandRng() * 3),
        })
      }
    }
  }

  // 6. one or two strands from core to a hero — but not all heroes.
  // Done by adding a virtual core star? No — director language doesn't
  // include a core node id. Skip it. Reference image also has no
  // "all roads lead to core" feel.

  return {
    core: { text: rootText || "", intensity: 1 },
    stars,
    strands: trimStrands(strands, stars, total),
    // ambient star count scales softly with content density
    ambientStarCount: clamp(60 + Math.floor(total * 1.5), 60, 140),
  }
}

// ---------- helpers ----------

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}
function wrapAngle(a: number) {
  return ((a % 360) + 360) % 360
}
function isConcreteText(text: string) {
  return /[0-9]|为什么|怎么|不能|害怕|想要|必须|一直|突然|如果|但是|因为|担心|决定/.test(text)
}
function pickAngleAwayFrom(taken: number[], rng: () => number): number {
  // try a few angles, pick the one furthest from any taken angle
  let bestA = rng() * 360
  let bestD = -1
  for (let i = 0; i < 8; i++) {
    const cand = rng() * 360
    let minD = 360
    for (const t of taken) {
      const d = Math.min(Math.abs(cand - t), 360 - Math.abs(cand - t))
      if (d < minD) minD = d
    }
    if (minD > bestD) {
      bestD = minD
      bestA = cand
    }
  }
  return bestA
}
function hhmm(input?: string): string | undefined {
  if (!input) return undefined
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return undefined
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
function cleanText(question?: string | null, answer?: string | null): string | undefined {
  // prefer the question; if blank, fall back to a short snippet of the answer
  const q = (question ?? "").trim()
  if (q) return truncate(q, 56)
  const a = (answer ?? "").trim()
  if (a) return truncate(a, 56)
  return undefined
}
function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + "…"
}
function mkId(nodeId: string) {
  return `s_${nodeId}`
}

function trimStrands(strands: SceneStrand[], stars: SceneStar[], total: number): SceneStrand[] {
  const roleScore: Record<StarRole, number> = {
    hero: 4,
    support: 3,
    echo: 1,
    ambient: 0,
  }
  const byId = new Map(stars.map((star) => [star.id, star]))
  const limit = clamp(Math.round(total * 0.36), Math.min(2, Math.max(0, total - 1)), 8)
  const seen = new Set<string>()
  return strands
    .map((strand, index) => {
      const from = byId.get(strand.fromId)
      const to = byId.get(strand.toId)
      return {
        strand,
        index,
        score: (strand.weight ?? 0.3) + (from ? roleScore[from.role] * 0.18 : 0) + (to ? roleScore[to.role] * 0.18 : 0),
      }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter(({ strand }) => {
      const key = [strand.fromId, strand.toId].sort().join("::")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map(({ strand }) => strand)
}
