"use client"

import { useEffect, useMemo, useState } from "react"
import type { ThinkingTrackView } from "@/components/thinking-layer"
import { cn } from "@/lib/utils"
import { curateScene } from "./director/scene-curator"
import { buildFallbackScene } from "./director/scene-fallback"
import type { Scene } from "./stage/scene-types"
import { StageRenderer } from "./stage/stage-renderer"
import { ThoughtDetailPanel } from "./thought-detail-panel"

export interface StarMapViewProps {
  rootQuestionText: string
  tracks: ThinkingTrackView[]
  activeTrackId?: string | null
  spaceId?: string
  frozen?: boolean

  /** Kept for API parity; the v1 stage does not render track pills. */
  onSelectTrack?: (trackId: string) => void
  onJumpToTrackNode: (trackId: string, nodeId: string) => void
  onSubmitFromNode?: (trackId: string, nodeId: string, rawInput: string) => Promise<void>

  composerEnabled?: boolean
  className?: string

  /** For rendering attached images inside hero cards. */
  mediaAssetSources?: Record<string, string>

  // Kept so existing callsites can stay stable.
  mode?: "starmap" | "tracks"
  onModeChange?: (mode: "starmap" | "tracks") => void
}

type CurateStatus = "idle" | "loading" | "error"

const curatedSceneCache = new Map<string, Scene>()

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
  mediaAssetSources,
}: StarMapViewProps) {
  const [selected, setSelected] = useState<{ trackId: string; nodeId: string } | null>(null)
  const [curatedScene, setCuratedScene] = useState<Scene | null>(null)
  const [curateStatus, setCurateStatus] = useState<CurateStatus>("idle")
  const [curateError, setCurateError] = useState<string | null>(null)

  const seed = useMemo(() => spaceId || hashTracks(tracks), [spaceId, tracks])
  const thoughtCount = useMemo(
    () => tracks.reduce((sum, track) => sum + track.nodes.length, 0),
    [tracks]
  )
  const cacheKey = spaceId ? `${spaceId}:${thoughtCount}` : null

  useEffect(() => {
    setCuratedScene(cacheKey ? curatedSceneCache.get(cacheKey) ?? null : null)
    setCurateStatus("idle")
    setCurateError(null)
  }, [cacheKey])

  useEffect(() => {
    if (!selected) return
    const exists = tracks.some((track) =>
      track.id === selected.trackId && track.nodes.some((node) => node.id === selected.nodeId)
    )
    if (!exists) setSelected(null)
  }, [selected, tracks])

  const fallbackScene = useMemo(
    () =>
      buildFallbackScene({
        rootText: rootQuestionText,
        tracks,
        activeTrackId,
        spaceSeed: seed,
      }),
    [rootQuestionText, tracks, activeTrackId, seed]
  )

  const scene = curatedScene ?? fallbackScene
  const selectedStarId = selected ? `s_${selected.nodeId}` : null
  const showDetail = selected !== null
  const canCurate = thoughtCount >= 2 && !frozen
  const isCurating = curateStatus === "loading"

  async function handleCurate() {
    if (!canCurate || isCurating) return
    setCurateStatus("loading")
    setCurateError(null)
    const result = await curateScene({ rootQuestionText, tracks })
    if (result.ok) {
      if (cacheKey) curatedSceneCache.set(cacheKey, result.scene)
      setCuratedScene(result.scene)
      setCurateStatus("idle")
      return
    }
    setCurateStatus("error")
    setCurateError(result.error)
    window.setTimeout(() => {
      setCurateStatus((prev) => (prev === "error" ? "idle" : prev))
      setCurateError(null)
    }, 2600)
  }

  function resetToFallback() {
    if (cacheKey) curatedSceneCache.delete(cacheKey)
    setCuratedScene(null)
    setCurateStatus("idle")
    setCurateError(null)
  }

  return (
    <div className={cn("relative flex h-full w-full overflow-hidden bg-[#0a0a0c]", className)}>
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

        <div className="pointer-events-none absolute left-8 top-7 select-none">
          <div className="text-[19px] font-medium tracking-[0.04em] text-[#EDE6D4]">思考星图</div>
          <div className="mt-1 text-[12px] tracking-[0.06em] text-[#7d7a72]">
            {curatedScene ? "AI 已为你重新策展" : "可视化你的思考轨迹与关联"}
          </div>
        </div>

        {frozen ? (
          <div className="pointer-events-none absolute right-6 top-7 text-[11px] tracking-[0.08em] text-[#5b584f]">
            已写入时间
          </div>
        ) : null}

        {canCurate ? (
          <div className="pointer-events-auto absolute bottom-6 right-6 flex items-center gap-3">
            {curatedScene ? (
              <button
                type="button"
                disabled={isCurating}
                className="text-[11px] tracking-[0.08em] text-[#5b584f] transition hover:text-[#9a978d] disabled:opacity-40"
                onClick={resetToFallback}
              >
                返回原貌
              </button>
            ) : null}
            <button
              type="button"
              disabled={isCurating}
              className={cn(
                "group flex items-center gap-2 rounded-full border border-[#1f1d18] bg-[#0f0e0b]/60 px-3.5 py-1.5 text-[12px] tracking-[0.06em] text-[#bdb6a4] backdrop-blur-sm transition",
                "hover:border-[#3a352a] hover:bg-[#171511]/70 hover:text-[#EDE6D4]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              onClick={handleCurate}
            >
              <SparkleIcon spinning={isCurating} />
              <span>{isCurating ? "正在策展…" : curatedScene ? "再策展一次" : "让 AI 策展"}</span>
            </button>
          </div>
        ) : null}

        {curateStatus === "error" && curateError ? (
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[#3a2a2a] bg-[#0f0e0b]/80 px-4 py-1.5 text-[11px] tracking-[0.06em] text-[#c9a89a] backdrop-blur-sm">
            策展失败 · 已恢复原貌
          </div>
        ) : null}
      </div>

      <div
        className="relative flex h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: showDetail ? "min(100vw, 440px)" : 0 }}
      >
        <ThoughtDetailPanel
          selected={selected}
          tracks={tracks}
          mediaAssetSources={mediaAssetSources}
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
  return tracks.map((track) => track.id).join("|") || "default"
}

function SparkleIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      className={cn("opacity-80", spinning ? "animate-spin" : "")}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.5 5.5l2 2" />
      <path d="M16.5 16.5l2 2" />
      <path d="M5.5 18.5l2-2" />
      <path d="M16.5 7.5l2-2" />
    </svg>
  )
}
