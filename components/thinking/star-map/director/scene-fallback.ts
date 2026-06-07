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
    trackOrder: number
    indexInTrack: number
    globalOrder: number
    timeMs: number
  }
  const flat: Flat[] = []
  for (let trackOrder = 0; trackOrder < tracks.length; trackOrder += 1) {
    const track = tracks[trackOrder]
    for (let i = 0; i < track.nodes.length; i++) {
      const node = track.nodes[i]
      flat.push({
        node,
        track,
        trackOrder,
        indexInTrack: i,
        globalOrder: flat.length,
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
  const dimensionCounts = new Map<string, number>()
  for (const f of flat) {
    dimensionCounts.set(f.node.dimension, (dimensionCounts.get(f.node.dimension) ?? 0) + 1)
  }

  const ranked = flat
    .map((f) => {
      const text = f.node.questionText ?? ""
      const time = Number.isFinite(f.timeMs) ? f.timeMs : minTime
      const recency = (time - minTime) / timeSpan
      const lengthSignal = Math.min(text.length / 72, 1) * 0.18
      const onActive = f.track.id === activeTrackId ? 0.24 : 0
      const hasAnswer = f.node.answerText ? 0.44 : 0
      const hasNote = f.node.noteText ? 0.24 : 0
      const hasImage = f.node.imageAssetId ? 0.32 : 0
      const concrete = isConcreteText(text) ? 0.22 : 0
      const firstInTrack = f.indexInTrack === 0 ? 0.18 : 0
      const latestInTrack = f.indexInTrack === f.track.nodes.length - 1 ? 0.14 : 0
      const dimensionRarity = 0.14 / Math.max(1, dimensionCounts.get(f.node.dimension) ?? 1)
      const suggested = f.node.isSuggested ? -0.34 : 0
      const score =
        recency * 0.28 +
        lengthSignal +
        onActive +
        hasAnswer +
        hasNote +
        hasImage +
        concrete +
        firstInTrack +
        latestInTrack +
        dimensionRarity +
        suggested
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
  const { heroes, supports, ambients } = pickRoleBands(ranked, heroCount, supportCount)
  const labelBudget = clamp(
    Math.round(total * 0.34),
    Math.min(total, heroCount),
    Math.min(total, Math.max(heroCount, 7))
  )

  // 4. layout
  const rng = makeRng(`${spaceSeed}::layout::v2`)
  const stars: SceneStar[] = []
  const idMap = new Map<string, string>() // nodeId -> starId
  let labeledCount = 0

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
    const text = cleanText(h.node.questionText, h.node.answerText, h.node.noteText)
    if (text) labeledCount += 1
    stars.push({
      id,
      ring,
      angle,
      drift,
      role: "hero",
      halo: i < 2,
      text,
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
    const shouldLabel =
      labeledCount < labelBudget && Boolean(s.node.answerText || s.node.noteText || isConcreteText(s.node.questionText ?? ""))
    const text = shouldLabel ? cleanText(s.node.questionText, s.node.answerText, s.node.noteText) : undefined
    if (text) labeledCount += 1
    stars.push({
      id,
      ring,
      angle,
      drift,
      role: "support",
      halo: false,
      text,
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
  const strandRng = makeRng(`${spaceSeed}::strands::v2`)

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

  const resonancePool = ranked.slice(0, Math.min(48, ranked.length))
  const resonanceCandidates: Array<{ fromId: string; toId: string; score: number; index: number }> = []
  for (let i = 0; i < resonancePool.length; i += 1) {
    for (let j = i + 1; j < resonancePool.length; j += 1) {
      const a = resonancePool[i]
      const b = resonancePool[j]
      if (a.track.id === b.track.id) continue
      const fromId = idMap.get(a.node.id)
      const toId = idMap.get(b.node.id)
      if (!fromId || !toId) continue
      const score = resonanceScore(a.node, b.node)
      if (score < 0.34) continue
      resonanceCandidates.push({ fromId, toId, score, index: resonanceCandidates.length })
    }
  }
  const resonanceLimit = clamp(Math.round(total * 0.14), total >= 4 ? 1 : 0, 4)
  for (const candidate of resonanceCandidates
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, resonanceLimit)) {
    strands.push({
      id: `r-${candidate.fromId}-${candidate.toId}`,
      fromId: candidate.fromId,
      toId: candidate.toId,
      weight: clamp(0.28 + candidate.score * 0.5, 0.3, 0.58),
      detour: (strandRng() - 0.5) * 1.55,
      dustCount: 2 + Math.floor(strandRng() * 4),
    })
  }

  // 6. one or two strands from core to a hero — but not all heroes.
  // Done by adding a virtual core star? No — director language doesn't
  // include a core node id. Skip it. Reference image also has no
  // "all roads lead to core" feel.

  return {
    core: { text: rootText || "", intensity: total >= 8 ? 2 : 1 },
    stars,
    strands: trimStrands(strands, stars, total),
    // ambient star count scales softly with content density
    ambientStarCount: clamp(68 + Math.floor(total * 1.65) + tracks.length * 3, 68, 156),
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
function pickRoleBands<T extends { track: { id: string }; score: number }>(
  ranked: T[],
  heroCount: number,
  supportCount: number
) {
  const heroes = pickDiverse(ranked, heroCount, 1)
  const heroSet = new Set(heroes)
  const supportPool = ranked.filter((item) => !heroSet.has(item))
  const supports = pickDiverse(supportPool, supportCount, 2)
  const supportSet = new Set(supports)
  return {
    heroes,
    supports,
    ambients: supportPool.filter((item) => !supportSet.has(item)),
  }
}
function pickDiverse<T extends { track: { id: string }; score: number }>(items: T[], count: number, firstPassLimit: number) {
  const picked: T[] = []
  const perTrack = new Map<string, number>()

  for (const item of items) {
    if (picked.length >= count) break
    const used = perTrack.get(item.track.id) ?? 0
    if (used >= firstPassLimit) continue
    picked.push(item)
    perTrack.set(item.track.id, used + 1)
  }

  for (const item of items) {
    if (picked.length >= count) break
    if (picked.includes(item)) continue
    picked.push(item)
  }

  return picked
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
function cleanText(question?: string | null, answer?: string | null, note?: string | null): string | undefined {
  // prefer the question; if blank, fall back to a short snippet of the answer/note
  const q = (question ?? "").trim()
  if (q) return truncate(q, 56)
  const a = (answer ?? "").trim()
  if (a) return truncate(a, 56)
  const n = (note ?? "").trim()
  if (n) return truncate(n, 56)
  return undefined
}
function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + "…"
}
function resonanceScore(a: ThinkingTrackNodeView, b: ThinkingTrackNodeView) {
  let score = 0
  if (a.dimension === b.dimension) score += 0.22
  if (a.echoNodeId === b.id || b.echoNodeId === a.id) score += 0.5
  if (isConcreteText(a.questionText ?? "") && isConcreteText(b.questionText ?? "")) score += 0.1
  const aKeywords = keywordSet([a.questionText, a.answerText, a.noteText].filter(Boolean).join(" "))
  const bKeywords = keywordSet([b.questionText, b.answerText, b.noteText].filter(Boolean).join(" "))
  let overlap = 0
  for (const keyword of aKeywords) {
    if (bKeywords.has(keyword)) overlap += 1
  }
  return score + Math.min(0.44, overlap * 0.14)
}
function keywordSet(text: string) {
  const result = new Set<string>()
  for (const match of text.toLowerCase().matchAll(/[a-z0-9_]{3,}/g)) {
    result.add(match[0])
  }
  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const value = match[0]
    for (let index = 0; index < value.length - 1; index += 1) {
      const keyword = value.slice(index, index + 2)
      if (!COMMON_BIGRAMS.has(keyword)) result.add(keyword)
    }
  }
  return result
}
function mkId(nodeId: string) {
  return `s_${nodeId}`
}

const COMMON_BIGRAMS = new Set(["什么", "怎么", "如何", "可以", "是否", "自己", "这个", "那个", "因为", "但是", "如果", "需要"])

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
