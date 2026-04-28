import { NextRequest } from "next/server"

import { SCENE_CURATOR_SYSTEM_PROMPT } from "@/components/thinking/star-map/director/scene-prompt"
import { validateScene } from "@/components/thinking/star-map/director/scene-validator"
import type { Scene, SceneStar, SceneStrand } from "@/components/thinking/star-map/stage/scene-types"
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

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return errorJson(503, "OPENAI_API_KEY is not configured")

    const body = await parseJsonBody<CurateRequest>(request)
    if (!body || !Array.isArray(body.thoughts) || body.thoughts.length === 0) {
      return errorJson(400, "thoughts is required")
    }

    const thoughts = sanitizeThoughts(body.thoughts)
    if (!thoughts.length) return errorJson(400, "valid thoughts is required")

    const rootQuestion = trimText(body.rootQuestion ?? "", 200)
    const response = await fetch(`${openaiBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.STAR_MAP_CURATOR_MODEL || "gpt-5-mini",
        store: false,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: SCENE_CURATOR_SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({ rootQuestion, thoughts }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "star_map_scene",
            strict: true,
            schema: STAR_MAP_SCENE_SCHEMA,
          },
        },
        max_output_tokens: 3000,
      }),
    })

    const raw = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      logWarn("thinking.star_map.curate.openai_failed", {
        status: response.status,
        error: summarizeOpenAiError(raw),
      })
      return errorJson(502, "star map curator failed")
    }

    const text = extractOutputText(raw)
    if (!text) return errorJson(502, "star map curator returned empty output")

    const parsed = parseJsonObject(text)
    const validated = validateScene(parsed)
    if (!validated) return errorJson(502, "star map curator returned invalid scene")

    const repaired = repairSceneForThoughts(validated, thoughts, rootQuestion)
    if (!repaired) return errorJson(502, "star map curator scene has no usable stars")

    return okJson({ scene: repaired })
  },
  { rateLimit: { bucket: "thinking-star-map-curate", max: 12, windowMs: 60 * 1000 } }
)

function openaiBaseUrl() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
}

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

function summarizeOpenAiError(raw: unknown) {
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
