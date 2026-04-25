"use client"

import { useMemo, useState } from "react"
import type { ThinkingTrackView } from "@/components/thinking-layer"
import { cn } from "@/lib/utils"
import { buildFallbackScene } from "./director/scene-fallback"
import { StageRenderer } from "./stage/stage-renderer"
import { ThoughtDetailPanel } from "./thought-detail-panel"

export interface StarMapViewProps {
  rootQuestionText: string
  tracks: ThinkingTrackView[]
  activeTrackId?: string | null
  spaceId?: string
  frozen?: boolean

  /** kept for API parity; not invoked by v1 since we don't render cluster pills. */
  onSelectTrack?: (trackId: string) => void
  onJumpToTrackNode: (trackId: string, nodeId: string) => void
  onSubmitFromNode?: (trackId: string, nodeId: string, rawInput: string) => Promise<void>

  composerEnabled?: boolean
  className?: string

  // mode props kept so existing callsites don't break; we intentionally
  // do not render any in-canvas tabs (extreme minimalism).
  mode?: "starmap" | "tracks"
  onModeChange?: (mode: "starmap" | "tracks") => void
}

export function StarMapView({
  rootQuestionText,
  tracks,
  activeTrackId,
  spaceId,
  frozen,
  onJumpToTrackNode,
  onSubmitFromNode,
  composerEnabled = true,
  className,
}: StarMapViewProps) {
  const [selected, setSelected] = useState<{ trackId: string; nodeId: string } | null>(null)

  // stable seed per space so the layout doesn't twitch on rerender
  const seed = useMemo(() => spaceId || hashTracks(tracks), [spaceId, tracks])

  const scene = useMemo(
    () =>
      buildFallbackScene({
        rootText: rootQuestionText,
        tracks,
        activeTrackId,
        spaceSeed: seed,
      }),
    [rootQuestionText, tracks, activeTrackId, seed]
  )

  const selectedStarId = selected ? `s_${selected.nodeId}` : null
  const showDetail = selected !== null

  return (
    <div className={cn("relative flex h-full w-full overflow-hidden bg-[#0a0a0c]", className)}>
      {/* canvas */}
      <div className="relative h-full min-h-0 flex-1">
        <StageRenderer
          scene={scene}
          seed={seed}
          selectedStarId={selectedStarId}
          onSelectStar={(star) => {
            if (star.trackId && star.nodeId) {
              setSelected({ trackId: star.trackId, nodeId: star.nodeId })
            }
          }}
        />

        {/* top-left subdued title — matches the reference */}
        <div className="pointer-events-none absolute left-8 top-7 select-none">
          <div className="text-[19px] font-medium tracking-[0.04em] text-[#EDE6D4]">思考星图</div>
          <div className="mt-1 text-[12px] tracking-[0.06em] text-[#7d7a72]">
            可视化你的思考轨迹与关联
          </div>
        </div>

        {frozen ? (
          <div className="pointer-events-none absolute right-6 top-7 text-[11px] tracking-[0.08em] text-[#5b584f]">
            已写入时间
          </div>
        ) : null}
      </div>

      {/* detail drawer (animated width to avoid layout pop) */}
      <div
        className="relative flex h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: showDetail ? 340 : 0 }}
      >
        <ThoughtDetailPanel
          selected={selected}
          tracks={tracks}
          onClose={() => setSelected(null)}
          onSelectNode={(trackId, nodeId) => setSelected({ trackId, nodeId })}
          onJumpToTrackNode={(trackId, nodeId) => {
            setSelected(null)
            onJumpToTrackNode(trackId, nodeId)
          }}
          onSubmitFromNode={
            composerEnabled && !frozen && onSubmitFromNode
              ? async (trackId, nodeId, rawInput) => {
                  await onSubmitFromNode(trackId, nodeId, rawInput)
                }
              : undefined
          }
          composerEnabled={Boolean(composerEnabled && !frozen)}
        />
      </div>
    </div>
  )
}

function hashTracks(tracks: ThinkingTrackView[]): string {
  return tracks.map((t) => t.id).join("|") || "default"
}
