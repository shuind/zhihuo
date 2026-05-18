import { NextRequest } from "next/server"

import { SCENE_CURATOR_SYSTEM_PROMPT } from "@/components/thinking/star-map/director/scene-prompt"
import { validateScene } from "@/components/thinking/star-map/director/scene-validator"
import type { Scene, SceneStar, SceneStrand } from "@/components/thinking/star-map/stage/scene-types"
import { makeRng } from "@/components/thinking/star-map/stage/scene-compiler"
import { DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL, normalizeAiApiSettings, normalizeBaseUrl } from "@/lib/ai-settings"
import { errorJson, getUserId, okJson, parseJsonBody, unauthorizedJson } from "@/lib/server/http"
import { logWarn, withApiRoute } from "@/lib/server/observability"

export const maxDuration = 30

type ThoughtInput = {
  id: string
  trackId: string
  text: string
  note: string | null
  answer: string | null
  createdAt: string | null
  hasImage: boolean
  timeLabel: string | null
}

type CurateRequest = {
  rootQuestion?: string
  thoughts?: ThoughtInput[]
  ai?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

const STAR_MAP_SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["core", "stars", "strands", "ambientStarCount"],
  properties: {
    core: {
      type: "object",
      additionalProperties: false,
      required: ["text", "intensity"],
      properties: {
        text: { type: "string" },
        intensity: { type: "integer", enum: [0, 1, 2] },
      },
    },
    stars: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "ring",
          "angle",
          "drift",
          "role",
          "halo",
          "text",
          "timestamp",
          "trackId",
          "nodeId",
        ],
        properties: {
          id: { type: "string" },
          ring: { type: "integer", enum: [0, 1, 2, 3, 4] },
          angle: { type: "number", minimum: 0, maximum: 360 },
          drift: { type: ["number", "null"], minimum: -2, maximum: 2 },
          role: { type: "string", enum: ["hero", "support", "echo", "ambient"] },
          halo: { type: ["boolean", "null"] },
          text: { type: ["string", "null"] },
          timestamp: { type: ["string", "null"] },
          trackId: { type: ["string", "null"] },
          nodeId: { type: ["string", "null"] },
        },
      },
    },
    strands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fromId", "toId", "weight", "detour", "dustCount"],
        properties: {
          id: { type: "string" },
          fromId: { type: "string" },
          toId: { type: "string" },
          weight: { type: "number", minimum: 0, maximum: 1 },
          detour: { type: ["number", "null"], minimum: -1, maximum: 1 },
          dustCount: { type: ["integer", "null"], minimum: 0, maximum: 7 },
        },
      },
    },
    ambientStarCount: { type: ["integer", "null"], minimum: 0, maximum: 200 },
  },
} as const

export const POST = withApiRoute(
  "thinking.star_map.curate",
  async (request: NextRequest) => {
    const userId = getUserId(request)
    if (!userId) return unauthorizedJson()

    const body = await parseJsonBody<CurateRequest>(request)
    if (!body || !Array.isArray(body.thoughts) || body.thoughts.length === 0) {
      return errorJson(400, "thoughts is required")
    }

    const ai = normalizeAiApiSettings(body.ai)
    const apiKey = ai.apiKey || process.env.DEEPSEEK_API_KEY || ""
    if (!apiKey) return errorJson(503, "请先在设置里填写 DeepSeek API Key")

    const thoughts = sanitizeThoughts(body.thoughts)
    if (!thoughts.length) return errorJson(400, "valid thoughts is required")

    const rootQuestion = trimText(body.rootQuestion ?? "", 200)
    const baseUrl = normalizeBaseUrl(ai.baseUrl || process.env.DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_BASE_URL)
    const model = ai.model || process.env.STAR_MAP_CURATOR_MODEL || DEFAULT_DEEPSEEK_MODEL
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `${SCENE_CURATOR_SYSTEM_PROMPT}\n\nReturn only valid json. Do not wrap it in markdown. The json object must follow the star_map_scene schema.`,
          },
          {
            role: "user",
            content: `Please curate this thinking star map as json. Schema:\n${JSON.stringify(STAR_MAP_SCENE_SCHEMA)}\nInput:\n${JSON.stringify({ rootQuestion, thoughts })}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 3000,
      }),
    })

    const raw = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      logWarn("thinking.star_map.curate.deepseek_failed", {
        status: response.status,
        error: summarizeApiError(raw),
      })
      return errorJson(502, "star map curator failed")
    }

    const text = extractChatCompletionText(raw) ?? extractOutputText(raw)
    if (!text) return errorJson(502, "star map curator returned empty output")

    const parsed = parseJsonObject(text)
    const validated = validateScene(parsed)
    if (!validated) return errorJson(502, "star map curator returned invalid scene")

    const repaired = repairSceneForThoughts(validated, thoughts, rootQuestion)
    if (!repaired) return errorJson(502, "star map curator scene has no usable stars")

    return okJson({ scene: amplifyCuratedScene(repaired, thoughts, rootQuestion) })
  },
  { rateLimit: { bucket: "thinking-star-map-curate", max: 12, windowMs: 60 * 1000 } }
)

function sanitizeThoughts(input: ThoughtInput[]) {
  return input
    .slice(0, 60)
    .map((thought) => ({
      id: trimText(String(thought.id ?? ""), 80),
      trackId: trimText(String(thought.trackId ?? ""), 80),
      text: trimText(String(thought.text ?? ""), 120),
      note: thought.note ? trimText(String(thought.note), 180) : null,
      answer: thought.answer ? trimText(String(thought.answer), 180) : null,
      createdAt: thought.createdAt ? trimText(String(thought.createdAt), 40) : null,
      hasImage: thought.hasImage === true,
      timeLabel: thought.timeLabel ? trimText(String(thought.timeLabel), 16) : null,
    }))
    .filter((thought) => thought.id && thought.trackId && thought.text)
}

function repairSceneForThoughts(scene: Scene, thoughts: ThoughtInput[], rootQuestion: string): Scene | null {
  const thoughtById = new Map(thoughts.map((thought) => [thought.id, thought]))
  const oldToNewId = new Map<string, string>()
  const seenNodeIds = new Set<string>()
  const seenStarIds = new Set<string>()
  const stars: SceneStar[] = []

  for (const star of scene.stars) {
    if (star.nodeId) {
      const thought = thoughtById.get(star.nodeId)
      if (!thought || seenNodeIds.has(thought.id)) continue
      const id = uniqueStarId(`s_${thought.id}`, seenStarIds)
      oldToNewId.set(star.id, id)
      seenNodeIds.add(thought.id)
      stars.push({
        ...star,
        id,
        trackId: thought.trackId,
        nodeId: thought.id,
        timestamp: star.timestamp ?? thought.timeLabel ?? undefined,
      })
      continue
    }

    const id = uniqueStarId(star.id.startsWith("s_") ? star.id : `s_${star.id}`, seenStarIds)
    oldToNewId.set(star.id, id)
    stars.push({
      ...star,
      id,
      trackId: undefined,
      nodeId: undefined,
      text: undefined,
    })
  }

  if (!stars.length) return null
  const validStarIds = new Set(stars.map((star) => star.id))
  const seenStrandIds = new Set<string>()
  const strands: SceneStrand[] = []
  for (const strand of scene.strands) {
    const fromId = oldToNewId.get(strand.fromId) ?? strand.fromId
    const toId = oldToNewId.get(strand.toId) ?? strand.toId
    if (!validStarIds.has(fromId) || !validStarIds.has(toId) || fromId === toId) continue
    const id = uniqueStrandId(strand.id, seenStrandIds)
    strands.push({ ...strand, id, fromId, toId })
  }

  return {
    core: {
      text: scene.core.text || rootQuestion,
      intensity: scene.core.intensity,
    },
    stars,
    strands,
    ambientStarCount: scene.ambientStarCount,
  }
}

function amplifyCuratedScene(scene: Scene, thoughts: ThoughtInput[], rootQuestion: string): Scene {
  const thoughtById = new Map(thoughts.map((thought) => [thought.id, thought]))
  const rng = makeRng(`ai-curator-v2::${rootQuestion}::${thoughts.map((thought) => thought.id).join("|")}`)
  const seenReal = new Set<string>()
  const realStars: SceneStar[] = []
  const decorativeStars: SceneStar[] = []

  for (const star of scene.stars) {
    if (star.nodeId && thoughtById.has(star.nodeId)) {
      if (seenReal.has(star.nodeId)) continue
      seenReal.add(star.nodeId)
      realStars.push(star)
    } else if (decorativeStars.length < 3) {
      decorativeStars.push({
        ...star,
        role: "ambient",
        text: undefined,
        timestamp: undefined,
        trackId: undefined,
        nodeId: undefined,
        halo: false,
      })
    }
  }

  for (const thought of thoughts) {
    if (seenReal.has(thought.id)) continue
    seenReal.add(thought.id)
    realStars.push({
      id: `s_${thought.id}`,
      ring: 3,
      angle: rng() * 360,
      drift: (rng() - 0.5) * 1.8,
      role: "ambient",
      halo: false,
      trackId: thought.trackId,
      nodeId: thought.id,
    })
  }

  if (!realStars.length) {
    return {
      core: { text: scene.core.text || rootQuestion, intensity: scene.core.intensity },
      stars: decorativeStars,
      strands: [],
      ambientStarCount: scene.ambientStarCount ?? 90,
    }
  }

  const total = realStars.length
  const heroTarget = total <= 3 ? 1 : total <= 7 ? 2 : total <= 14 ? 3 : 4
  const supportTarget = clampNumber(Math.round(total * 0.24), Math.min(1, Math.max(0, total - heroTarget)), Math.min(5, Math.max(0, total - heroTarget)))
  const labelBudget = clampNumber(Math.floor(total * 0.38), heroTarget, Math.min(total, heroTarget + supportTarget))
  const ranked = rankStarsForCuration(realStars, thoughtById)
  const heroIds = new Set(ranked.slice(0, heroTarget).map((item) => item.star.id))
  const supportIds = new Set(ranked.slice(heroTarget, heroTarget + supportTarget).map((item) => item.star.id))

  const dominantAngle = wrapAngle(rng() * 360 + 18)
  const counterAngle = wrapAngle(dominantAngle + 138 + rng() * 34)
  const remoteAngle = wrapAngle(dominantAngle + 248 + rng() * 45)
  const heroAngles = new Map<string, number>()
  const heroByTrack = new Map<string, SceneStar>()
  let labeledCount = 0

  const nextStars = ranked.map(({ star }, index) => {
    const thought = star.nodeId ? thoughtById.get(star.nodeId) : null
    const isHero = heroIds.has(star.id)
    const isSupport = supportIds.has(star.id)

    if (isHero) {
      const heroIndex = [...heroIds].indexOf(star.id)
      const angle =
        heroIndex === 0
          ? dominantAngle + (rng() - 0.5) * 16
          : heroIndex === 1
            ? counterAngle + (rng() - 0.5) * 20
            : remoteAngle + heroIndex * 29 + (rng() - 0.5) * 24
      const next: SceneStar = {
        ...star,
        role: "hero",
        ring: heroIndex === 0 ? 1 : 2,
        angle: wrapAngle(angle),
        drift: (rng() - 0.5) * 1.2,
        halo: heroIndex < 2,
        text: thought ? cleanCuratedText(thought) : star.text,
        timestamp: thought?.timeLabel ?? star.timestamp,
      }
      labeledCount += next.text ? 1 : 0
      heroAngles.set(next.id, next.angle)
      if (next.trackId && !heroByTrack.has(next.trackId)) heroByTrack.set(next.trackId, next)
      return next
    }

    const nearestHero = pickHeroForStar(star, ranked, heroIds, heroByTrack)
    const heroAngle = nearestHero ? heroAngles.get(nearestHero.id) ?? nearestHero.angle : dominantAngle
    if (isSupport) {
      const side = index % 2 === 0 ? 1 : -1
      const showText = labeledCount < labelBudget
      const next: SceneStar = {
        ...star,
        role: "support",
        ring: rng() < 0.52 ? 2 : 3,
        angle: wrapAngle(heroAngle + side * (32 + rng() * 48) + (rng() - 0.5) * 14),
        drift: (rng() - 0.5) * 1.8,
        halo: false,
        text: showText && thought ? cleanCuratedText(thought) : undefined,
        timestamp: showText ? thought?.timeLabel ?? star.timestamp : undefined,
      }
      labeledCount += next.text ? 1 : 0
      return next
    }

    const isEcho = rng() < 0.42 || (thought?.note || thought?.answer ? rng() < 0.62 : false)
    return {
      ...star,
      role: isEcho ? "echo" : "ambient",
      ring: rng() < 0.68 ? 3 : 4,
      angle: wrapAngle(heroAngle + 95 + (rng() - 0.5) * 168),
      drift: (rng() - 0.5) * 2,
      halo: false,
      text: undefined,
      timestamp: undefined,
    } satisfies SceneStar
  })

  const finalDecorative = decorativeStars.map((star, index) => ({
    ...star,
    id: uniqueStarId(`curator_dust_${index}`, new Set(nextStars.map((item) => item.id))),
    ring: 4 as const,
    angle: wrapAngle(remoteAngle + index * 37 + rng() * 28),
    drift: (rng() - 0.5) * 2,
  }))

  const strands = buildCuratedStrands(nextStars, scene.strands, rng, total)

  return {
    core: {
      text: scene.core.text || rootQuestion,
      intensity: Math.max(1, scene.core.intensity) as 1 | 2,
    },
    stars: [...nextStars, ...finalDecorative],
    strands,
    ambientStarCount: clampNumber(75 + Math.floor(total * 1.9), 80, 165),
  }
}

function rankStarsForCuration(stars: SceneStar[], thoughtById: Map<string, ThoughtInput>) {
  const times = stars
    .map((star) => (star.nodeId ? new Date(thoughtById.get(star.nodeId)?.createdAt ?? "").getTime() : Number.NaN))
    .filter(Number.isFinite)
  const minTime = times.length ? Math.min(...times) : Date.now()
  const maxTime = times.length ? Math.max(...times) : minTime + 1
  const span = Math.max(1, maxTime - minTime)
  return stars
    .map((star) => {
      const thought = star.nodeId ? thoughtById.get(star.nodeId) : null
      const time = thought?.createdAt ? new Date(thought.createdAt).getTime() : minTime
      const recency = Number.isFinite(time) ? (time - minTime) / span : 0
      const roleBias = star.role === "hero" ? 1.1 : star.role === "support" ? 0.55 : star.role === "echo" ? 0.18 : 0
      const richness =
        (thought?.note ? 0.38 : 0) +
        (thought?.answer ? 0.5 : 0) +
        (thought?.hasImage ? 0.42 : 0) +
        Math.min((thought?.text.length ?? 0) / 90, 1) * 0.24
      const concreteness = /[0-9]|为什么|怎么|不能|害怕|想要|必须|一直|突然/.test(thought?.text ?? "") ? 0.28 : 0
      return {
        star,
        score: roleBias + richness + concreteness + recency * 0.32,
      }
    })
    .sort((a, b) => b.score - a.score)
}

function pickHeroForStar(
  star: SceneStar,
  ranked: Array<{ star: SceneStar; score: number }>,
  heroIds: Set<string>,
  heroByTrack: Map<string, SceneStar>
) {
  if (star.trackId) {
    const sameTrack = heroByTrack.get(star.trackId)
    if (sameTrack) return sameTrack
  }
  return ranked.find((item) => heroIds.has(item.star.id))?.star ?? null
}

function buildCuratedStrands(stars: SceneStar[], aiStrands: SceneStrand[], rng: () => number, total: number): SceneStrand[] {
  const byId = new Map(stars.map((star) => [star.id, star]))
  const heroes = stars.filter((star) => star.role === "hero")
  const supports = stars.filter((star) => star.role === "support")
  const limit = clampNumber(Math.round(total * 0.45), Math.min(2, Math.max(0, total - 1)), 8)
  const strands: SceneStrand[] = []
  const seen = new Set<string>()

  function add(fromId: string | undefined, toId: string | undefined, weight: number, dustCount: number) {
    if (!fromId || !toId || fromId === toId) return
    if (!byId.has(fromId) || !byId.has(toId)) return
    const key = [fromId, toId].sort().join("::")
    if (seen.has(key) || strands.length >= limit) return
    seen.add(key)
    strands.push({
      id: `curated_${strands.length}_${fromId}_${toId}`,
      fromId,
      toId,
      weight,
      detour: (rng() - 0.5) * 1.7,
      dustCount,
    })
  }

  for (const support of supports) {
    const sameTrackHero = support.trackId ? heroes.find((hero) => hero.trackId === support.trackId) : null
    const hero = sameTrackHero ?? heroes[Math.floor(rng() * Math.max(1, heroes.length))]
    add(hero?.id, support.id, 0.45 + rng() * 0.2, 3 + Math.floor(rng() * 3))
  }

  for (let index = 0; index < heroes.length - 1; index += 1) {
    add(heroes[index]?.id, heroes[index + 1]?.id, 0.55 + rng() * 0.22, 4 + Math.floor(rng() * 3))
  }

  for (const strand of aiStrands) {
    const from = byId.get(strand.fromId)
    const to = byId.get(strand.toId)
    if (!from || !to) continue
    if (from.role === "ambient" && to.role === "ambient") continue
    add(from.id, to.id, Math.max(0.28, Math.min(0.82, strand.weight)), strand.dustCount ?? 3)
  }

  return strands
}

function cleanCuratedText(thought: ThoughtInput) {
  const raw = thought.text || thought.answer || thought.note || ""
  return trimText(raw.replace(/\s+/g, " "), 54)
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function wrapAngle(value: number) {
  return ((value % 360) + 360) % 360
}

function uniqueStarId(base: string, seen: Set<string>) {
  let candidate = base
  let index = 1
  while (seen.has(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  seen.add(candidate)
  return candidate
}

function uniqueStrandId(base: string, seen: Set<string>) {
  let candidate = base || `strand_${seen.size}`
  let index = 1
  while (seen.has(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  seen.add(candidate)
  return candidate
}

function extractOutputText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (typeof record.output_text === "string") return record.output_text
  const output = record.output
  if (!Array.isArray(output)) return null
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === "string") chunks.push(text)
    }
  }
  return chunks.join("").trim() || null
}

function extractChatCompletionText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const choices = (raw as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return null
  const chunks: string[] = []
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue
    const message = (choice as Record<string, unknown>).message
    if (!message || typeof message !== "object") continue
    const content = (message as Record<string, unknown>).content
    if (typeof content === "string") chunks.push(content)
  }
  return chunks.join("").trim() || null
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function summarizeApiError(raw: unknown) {
  if (!raw || typeof raw !== "object") return "unknown"
  const error = (raw as Record<string, unknown>).error
  if (!error || typeof error !== "object") return "unknown"
  const message = (error as Record<string, unknown>).message
  return typeof message === "string" ? trimText(message, 200) : "unknown"
}

function trimText(value: string, max: number) {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}
