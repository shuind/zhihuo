"use client"

import { useEffect, useMemo, useState } from "react"
import type { ThinkingTrackView } from "@/components/thinking-layer"
import { cn } from "@/lib/utils"
import { buildFallbackScene } from "./director/scene-fallback"
import { curateScene } from "./director/scene-curator"
import type { Scene } from "./stage/scene-types"
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

  /** for rendering attached images inside hero cards */
  mediaAssetSources?: Record<string, string>

  // mode props kept so existing callsites don't break; we intentionally
  // do not render any in-canvas tabs (extreme minimalism).
  mode?: "starmap" | "tracks"
  onModeChange?: (mode: "starmap" | "tracks") => void
}

type CurateStatus = "idle" | "loading" | "error"

// Per-spaceId in-memory cache so re-entering the view restores the AI scene
// without another network call. Resets on full reload — that's intentional.
const aiSceneCache = new Map<string, Scene>()

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

  // stable seed per space so the layout doesn't twitch on rerender
  const seed = useMemo(() => spaceId || hashTracks(tracks), [spaceId, tracks])

  // total thought count — used to hide the curator button when empty,
  // and to invalidate the cached AI scene when new thoughts arrive.
  const thoughtCount = useMemo(
    () => tracks.reduce((sum, t) => sum + t.nodes.length, 0),
    [tracks]
  )

  const cacheKey = spaceId ? `${spaceId}:${thoughtCount}` : null
  const [aiScene, setAiScene] = useState<Scene | null>(() =>
    cacheKey ? aiSceneCache.get(cacheKey) ?? null : null
  )
  const [curateStatus, setCurateStatus] = useState<CurateStatus>("idle")
  const [curateError, setCurateError] = useState<string | null>(null)

  // when space or thought count changes, drop stale AI scene
  useEffect(() => {
    if (!cacheKey) {
      setAiScene(null)
      return
    }
    setAiScene(aiSceneCache.get(cacheKey) ?? null)
  }, [cacheKey])

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

  const scene = aiScene ?? fallbackScene
  const selectedStarId = selected ? `s_${selected.nodeId}` : null
  const showDetail = selected !== null

  const canCurate = thoughtCount >= 2 && !frozen
  const isLoading = curateStatus === "loading"

  const handleCurate = async () => {
    if (!canCurate || isLoading) return
    setCurateStatus("loading")
    setCurateError(null)
    const result = await curateScene({ rootQuestionText, tracks })
    if (result.ok && result.scene) {
      if (cacheKey) aiSceneCache.set(cacheKey, result.scene)
      setAiScene(result.scene)
      setCurateStatus("idle")
    } else {
      setCurateError(result.error ?? "unknown")
      setCurateStatus("error")
      // auto-clear error after a moment so the toast doesn't linger
      setTimeout(() => {
        setCurateStatus((prev) => (prev === "error" ? "idle" : prev))
        setCurateError(null)
      }, 2400)
    }
  }

  const handleResetToFallback = () => {
    if (cacheKey) aiSceneCache.delete(cacheKey)
    setAiScene(null)
  }

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
            {aiScene ? "AI 已为你重新策展" : "可视化你的思考轨迹与关联"}
          </div>
        </div>

        {frozen ? (
          <div className="pointer-events-none absolute right-6 top-7 text-[11px] tracking-[0.08em] text-[#5b584f]">
            已写入时间
          </div>
        ) : null}

        {/* curator trigger — extremely subdued, bottom-right */}
        {canCurate ? (
          <div className="pointer-events-auto absolute bottom-6 right-6 flex items-center gap-3">
            {aiScene ? (
              <button
                type="button"
                onClick={handleResetToFallback}
                disabled={isLoading}
                className="text-[11px] tracking-[0.08em] text-[#5b584f] transition hover:text-[#9a978d] disabled:opacity-40"
              >
                返回原貌
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCurate}
              disabled={isLoading}
              className={cn(
                "group flex items-center gap-2 rounded-full border border-[#1f1d18] bg-[#0f0e0b]/60 px-3.5 py-1.5 text-[12px] tracking-[0.06em] text-[#bdb6a4] backdrop-blur-sm transition",
                "hover:border-[#3a352a] hover:bg-[#171511]/70 hover:text-[#EDE6D4]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              aria-label="让 AI 重新策展星图"
            >
              <SparkleIcon spinning={isLoading} />
              <span>{isLoading ? "正在策展…" : aiScene ? "再策展一次" : "让 AI 策展"}</span>
            </button>
          </div>
        ) : null}

        {/* error toast — subtle, bottom-center */}
        {curateStatus === "error" && curateError ? (
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[#3a2a2a] bg-[#0f0e0b]/80 px-4 py-1.5 text-[11px] tracking-[0.06em] text-[#c9a89a] backdrop-blur-sm">
            策展失败 · 已恢复原貌
          </div>
        ) : null}
      </div>

      {/* detail drawer (animated width to avoid layout pop) */}
      <div
        className="relative flex h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: showDetail ? 440 : 0 }}
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
  return tracks.map((t) => t.id).join("|") || "default"
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
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
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
