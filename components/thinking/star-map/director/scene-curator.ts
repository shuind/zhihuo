import type { ThinkingTrackView } from "@/components/thinking-layer"
import type { Scene } from "../stage/scene-types"

export interface CurateInput {
  rootQuestionText: string
  tracks: ThinkingTrackView[]
}

export interface CurateResult {
  ok: boolean
  scene?: Scene
  error?: string
}

/**
 * Send the trimmed thinking space to the curator API and get a Scene back.
 * The caller decides when to invoke this (typically on a manual button).
 */
export async function curateScene(input: CurateInput): Promise<CurateResult> {
  const thoughts: Array<{
    id: string
    trackId: string
    text: string
    note: string | null
    answer: string | null
    createdAt: string | null
    hasImage: boolean
    timeLabel: string | null
  }> = []

  for (const track of input.tracks) {
    for (const node of track.nodes) {
      thoughts.push({
        id: node.id,
        trackId: track.id,
        text: node.questionText ?? "",
        note: node.noteText ?? null,
        answer: node.answerText ?? null,
        createdAt: node.createdAt ?? null,
        hasImage: Boolean(node.imageAssetId),
        timeLabel: node.createdAt ? formatHHMM(node.createdAt) : null,
      })
    }
  }

  if (thoughts.length === 0) {
    return { ok: false, error: "empty" }
  }

  try {
    const res = await fetch("/api/star-map/curate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootQuestion: input.rootQuestionText,
        thoughts,
      }),
    })

    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` }
    }
    const data = (await res.json()) as { scene?: Scene; error?: string }
    if (!data.scene) {
      return { ok: false, error: data.error ?? "no_scene" }
    }
    return { ok: true, scene: data.scene }
  } catch (err) {
    console.error("[v0] scene-curator network error:", err)
    return { ok: false, error: "network" }
  }
}

function formatHHMM(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
