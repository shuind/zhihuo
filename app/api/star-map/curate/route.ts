import { generateText, Output } from "ai"
import * as z from "zod"
import { SCENE_CURATOR_SYSTEM_PROMPT } from "@/components/thinking/star-map/director/scene-prompt"
import { validateScene } from "@/components/thinking/star-map/director/scene-validator"

export const maxDuration = 30

/**
 * Input schema (what the client sends after trimming the thinking space).
 * Kept tiny so token cost stays low even with many thoughts.
 */
interface ThoughtInput {
  id: string
  trackId: string
  text: string
  note: string | null
  answer: string | null
  createdAt: string | null
  hasImage: boolean
  timeLabel: string | null
}

interface CurateRequest {
  rootQuestion: string
  thoughts: ThoughtInput[]
}

// Scene schema for Output.object — must use nullable() (not optional()) for OpenAI strict mode.
const StarSchema = z.object({
  id: z.string().describe("must start with 's_'"),
  ring: z.number().int().min(0).max(4),
  angle: z.number().min(0).max(360),
  drift: z.number().min(-2).max(2).nullable(),
  role: z.enum(["hero", "support", "echo", "ambient"]),
  halo: z.boolean().nullable(),
  text: z.string().nullable().describe("null = silent star (no label rendered)"),
  timestamp: z.string().nullable(),
  trackId: z.string().nullable(),
  nodeId: z.string().nullable().describe("must equal an input thought.id, or null for ambient"),
})

const StrandSchema = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  weight: z.number().min(0).max(1),
  detour: z.number().min(-1).max(1).nullable(),
  dustCount: z.number().int().min(0).max(7).nullable(),
})

const SceneSchema = z.object({
  core: z.object({
    text: z.string(),
    intensity: z.number().int().min(0).max(2),
  }),
  stars: z.array(StarSchema),
  strands: z.array(StrandSchema),
  ambientStarCount: z.number().int().min(0).max(200).nullable(),
})

export async function POST(req: Request) {
  let body: CurateRequest
  try {
    body = (await req.json()) as CurateRequest
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  if (!body || !Array.isArray(body.thoughts) || body.thoughts.length === 0) {
    return Response.json({ error: "empty_thoughts" }, { status: 400 })
  }

  // Trim each thought to keep token cost bounded.
  const safeThoughts = body.thoughts.slice(0, 60).map((t) => ({
    id: String(t.id).slice(0, 64),
    trackId: String(t.trackId).slice(0, 64),
    text: trimText(t.text, 100),
    note: t.note ? trimText(t.note, 200) : null,
    answer: t.answer ? trimText(t.answer, 200) : null,
    createdAt: t.createdAt ?? null,
    hasImage: Boolean(t.hasImage),
    timeLabel: t.timeLabel ?? null,
  }))

  const userPayload = JSON.stringify({
    rootQuestion: trimText(body.rootQuestion ?? "", 200),
    thoughts: safeThoughts,
  })

  try {
    const { output } = await generateText({
      model: "openai/gpt-5-mini",
      system: SCENE_CURATOR_SYSTEM_PROMPT,
      prompt: userPayload,
      output: Output.object({ schema: SceneSchema }),
    })

    const scene = validateScene(output)
    if (!scene) {
      return Response.json({ error: "invalid_scene" }, { status: 502 })
    }
    return Response.json({ scene })
  } catch (err) {
    console.error("[v0] star-map curate failed:", err)
    return Response.json({ error: "llm_failed" }, { status: 502 })
  }
}

function trimText(s: string, max: number): string {
  if (!s) return ""
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}
