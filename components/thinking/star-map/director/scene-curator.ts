import type { ThinkingTrackView } from "@/components/thinking-layer"
import type { Scene } from "../stage/scene-types"

export interface CurateInput {
  rootQuestionText: string
  tracks: ThinkingTrackView[]
}

export type CurateResult =
  | { ok: true; scene: Scene }
  | { ok: false; error: string }

export async function curateScene(input: CurateInput): Promise<CurateResult> {
  const thoughts = input.tracks.flatMap((track) =>
    track.nodes.map((node) => ({
      id: node.id,
      trackId: track.id,
      text: node.questionText ?? "",
      note: node.noteText ?? null,
      answer: node.answerText ?? null,
      createdAt: node.createdAt ?? null,
      hasImage: Boolean(node.imageAssetId),
      timeLabel: node.createdAt ? formatHHMM(node.createdAt) : null,
    }))
  )

  if (!thoughts.length) return { ok: false, error: "empty" }

  try {
    const response = await fetch("/v1/thinking/star-map/curate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootQuestion: input.rootQuestionText,
        thoughts,
      }),
    })

    const data = (await response.json().catch(() => null)) as { scene?: Scene; error?: string } | null
    if (!response.ok) return { ok: false, error: data?.error ?? `http_${response.status}` }
    if (!data?.scene) return { ok: false, error: "no_scene" }
    return { ok: true, scene: data.scene }
  } catch {
    return { ok: false, error: "network" }
  }
}

function formatHHMM(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
