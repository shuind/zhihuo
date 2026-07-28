"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { ThinkingTrackView } from "@/components/thinking-layer"
import { cn } from "@/lib/utils"
import { curateScene } from "./director/scene-curator"
import { buildFallbackScene } from "./director/scene-fallback"
import { validateScene } from "./director/scene-validator"
import type { Scene, StarPlacement } from "./stage/scene-types"
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
  onOpenSettings?: () => void

  composerEnabled?: boolean
  className?: string

  /** For rendering attached images inside hero cards. */
  mediaAssetSources?: Record<string, string>
  starMapState?: StarMapSyncedState | null
  onSaveStarMapState?: (patch: StarMapStatePatch) => Promise<unknown> | unknown

  // Kept so existing callsites can stay stable.
  mode?: "starmap" | "tracks"
  onModeChange?: (mode: "starmap" | "tracks") => void
}

export type StarMapSyncedState = {
  sceneSignature?: string | null
  curatedScene?: Scene | null
  curatedAt?: string | null
  placementsSignature?: string | null
  starPlacements?: Record<string, StarPlacement> | null
  placementsUpdatedAt?: string | null
}

export type StarMapStatePatch = {
  sceneSignature?: string | null
  curatedScene?: Scene | null
  curatedAt?: string | null
  placementsSignature?: string | null
  starPlacements?: Record<string, StarPlacement> | null
  placementsUpdatedAt?: string | null
}

type CurateStatus = "idle" | "loading" | "error"

const curatedSceneCache = new Map<string, Scene>()
const STAR_MAP_CURATED_STORAGE_KEY = "zhihuo_star_map_curated_scenes_v1"
const STAR_MAP_PLACEMENTS_STORAGE_KEY = "zhihuo_star_map_star_placements_v1"
const MAX_PERSISTED_CURATED_SCENES = 50
const MAX_PERSISTED_PLACEMENT_SCENES = 50

type PersistedCuratedScene = {
  signature: string
  scene: Scene
  updatedAt: string
}

type PersistedStarPlacements = {
  signature: string
  placements: Record<string, StarPlacement>
  updatedAt: string
}

export function StarMapView({
  rootQuestionText,
  tracks,
  activeTrackId,
  spaceId,
  frozen,
  onJumpToTrackNode,
  onSubmitFromNode,
  onOpenSettings,
  composerEnabled = true,
  className,
  mediaAssetSources,
  starMapState,
  onSaveStarMapState,
}: StarMapViewProps) {
  const [selected, setSelected] = useState<{ trackId: string; nodeId: string } | null>(null)
  const [curatedScene, setCuratedScene] = useState<Scene | null>(null)
  const [curateStatus, setCurateStatus] = useState<CurateStatus>("idle")
  const [curateError, setCurateError] = useState<string | null>(null)
  const [starPlacements, setStarPlacements] = useState<Record<string, StarPlacement>>({})
  const [dragPreviewPlacements, setDragPreviewPlacements] = useState<Record<string, StarPlacement> | null>(null)
  const [loadedPlacementScope, setLoadedPlacementScope] = useState<string | null>(null)
  const migratedLocalSceneRef = useRef<string | null>(null)
  const migratedLocalPlacementsRef = useRef<string | null>(null)

  const seed = useMemo(() => spaceId || hashTracks(tracks), [spaceId, tracks])
  const thoughtCount = useMemo(
    () => tracks.reduce((sum, track) => sum + track.nodes.length, 0),
    [tracks]
  )
  const sceneSignature = useMemo(
    () => buildSceneSignature(rootQuestionText, tracks),
    [rootQuestionText, tracks]
  )
  const cacheKey = spaceId ? `${spaceId}:${sceneSignature}` : null
  const placementScope = spaceId ? `${spaceId}:${sceneSignature}` : null

  useEffect(() => {
    const syncedScene =
      starMapState?.sceneSignature === sceneSignature && starMapState.curatedScene
        ? validateScene(starMapState.curatedScene)
        : null
    const cached = !syncedScene && cacheKey ? curatedSceneCache.get(cacheKey) ?? null : null
    const persisted = spaceId && !syncedScene && !cached ? loadPersistedCuratedScene(spaceId, sceneSignature) : null
    const nextScene = syncedScene ?? cached ?? persisted
    if (nextScene && cacheKey) curatedSceneCache.set(cacheKey, nextScene)
    setCuratedScene(nextScene)
    setCurateStatus("idle")
    setCurateError(null)
    if (
      persisted &&
      spaceId &&
      onSaveStarMapState &&
      migratedLocalSceneRef.current !== cacheKey &&
      starMapState?.sceneSignature !== sceneSignature
    ) {
      migratedLocalSceneRef.current = cacheKey
      void onSaveStarMapState({
        sceneSignature,
        curatedScene: persisted,
        curatedAt: new Date().toISOString(),
      })
    }
  }, [cacheKey, onSaveStarMapState, sceneSignature, spaceId, starMapState?.curatedScene, starMapState?.sceneSignature])

  useEffect(() => {
    const syncedPlacements =
      starMapState?.placementsSignature === sceneSignature
        ? normalizePlacements(starMapState.starPlacements)
        : {}
    const persisted =
      spaceId && !Object.keys(syncedPlacements).length
        ? loadPersistedStarPlacements(spaceId, sceneSignature)
        : {}
    const nextPlacements = Object.keys(syncedPlacements).length ? syncedPlacements : persisted
    setStarPlacements(nextPlacements)
    setDragPreviewPlacements(null)
    setLoadedPlacementScope(placementScope)
    if (
      Object.keys(persisted).length &&
      spaceId &&
      onSaveStarMapState &&
      migratedLocalPlacementsRef.current !== placementScope &&
      starMapState?.placementsSignature !== sceneSignature
    ) {
      migratedLocalPlacementsRef.current = placementScope
      void onSaveStarMapState({
        placementsSignature: sceneSignature,
        starPlacements: persisted,
        placementsUpdatedAt: new Date().toISOString(),
      })
    }
  }, [
    onSaveStarMapState,
    placementScope,
    sceneSignature,
    spaceId,
    starMapState?.placementsSignature,
    starMapState?.starPlacements,
  ])

  useEffect(() => {
    if (!spaceId || loadedPlacementScope !== placementScope) return
    if (Object.keys(starPlacements).length) {
      savePersistedStarPlacements(spaceId, sceneSignature, starPlacements)
    } else {
      deletePersistedStarPlacements(spaceId)
    }
  }, [loadedPlacementScope, placementScope, sceneSignature, spaceId, starPlacements])

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
  const renderedPlacements = dragPreviewPlacements ?? starPlacements
  const positionedScene = useMemo(
    () => applyStarPlacements(scene, renderedPlacements),
    [scene, renderedPlacements]
  )
  const curationTrace = useMemo(
    () => (curatedScene ? buildCurationTrace(curatedScene, fallbackScene) : null),
    [curatedScene, fallbackScene]
  )
  const selectedStarId = selected ? `s_${selected.nodeId}` : null
  const showDetail = selected !== null
  const canCurate = thoughtCount >= 2 && !frozen
  const isCurating = curateStatus === "loading"
  const hasManualPlacements = Object.keys(starPlacements).length > 0
  const showControls = canCurate || hasManualPlacements
  const curateErrorLabel = curateError ? getCurateErrorLabel(curateError) : null

  function saveSyncedStarMapPatch(patch: StarMapStatePatch) {
    if (!onSaveStarMapState) return
    void onSaveStarMapState(patch)
  }

  async function handleCurate() {
    if (!canCurate || isCurating) return
    setCurateStatus("loading")
    setCurateError(null)
    const result = await curateScene({ rootQuestionText, tracks })
    if (result.ok) {
      const curatedAt = new Date().toISOString()
      if (cacheKey) curatedSceneCache.set(cacheKey, result.scene)
      if (spaceId) savePersistedCuratedScene(spaceId, sceneSignature, result.scene)
      setCuratedScene(result.scene)
      saveSyncedStarMapPatch({
        sceneSignature,
        curatedScene: result.scene,
        curatedAt,
      })
      setCurateStatus("idle")
      return
    }
    setCurateStatus("error")
    setCurateError(result.error)
    if (!isCurateSettingsError(result.error)) {
      window.setTimeout(() => {
        setCurateStatus((prev) => (prev === "error" ? "idle" : prev))
        setCurateError(null)
      }, 5000)
    }
  }

  function resetToFallback() {
    if (cacheKey) curatedSceneCache.delete(cacheKey)
    if (spaceId) deletePersistedCuratedScene(spaceId)
    if (spaceId) deletePersistedStarPlacements(spaceId)
    setStarPlacements({})
    setDragPreviewPlacements(null)
    setLoadedPlacementScope(placementScope)
    setCuratedScene(null)
    setCurateStatus("idle")
    setCurateError(null)
    saveSyncedStarMapPatch({
      sceneSignature: null,
      curatedScene: null,
      curatedAt: null,
      placementsSignature: null,
      starPlacements: null,
      placementsUpdatedAt: null,
    })
  }

  function resetStarPlacements() {
    if (spaceId) deletePersistedStarPlacements(spaceId)
    setStarPlacements({})
    setDragPreviewPlacements(null)
    setLoadedPlacementScope(placementScope)
    saveSyncedStarMapPatch({
      placementsSignature: null,
      starPlacements: null,
      placementsUpdatedAt: null,
    })
  }

  function handleMoveStar(
    star: { id: string },
    position: { x: number; y: number; width: number; height: number }
  ) {
    if (frozen) return
    const placement = pointToPlacement(position)
    setDragPreviewPlacements({
      ...starPlacements,
      [star.id]: placement,
    })
  }

  function handleCommitStarMove(
    star: { id: string },
    position: { x: number; y: number; width: number; height: number }
  ) {
    if (frozen) return
    const placement = pointToPlacement(position)
    const nextPlacements = {
      ...starPlacements,
      [star.id]: placement,
    }
    setLoadedPlacementScope(placementScope)
    setDragPreviewPlacements(null)
    setStarPlacements(nextPlacements)
    if (spaceId) savePersistedStarPlacements(spaceId, sceneSignature, nextPlacements)
    saveSyncedStarMapPatch({
      placementsSignature: sceneSignature,
      starPlacements: nextPlacements,
      placementsUpdatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className={cn("relative flex h-full w-full overflow-hidden bg-[#0a0a0c]", className)}>
      <div className="relative h-full min-h-0 flex-1">
        <StageRenderer
          scene={positionedScene}
          seed={seed}
          selectedStarId={selectedStarId}
          onMoveStar={frozen ? undefined : handleMoveStar}
          onCommitStarMove={frozen ? undefined : handleCommitStarMove}
          onSelectStar={(star) => {
            if (star.trackId && star.nodeId) {
              setSelected({ trackId: star.trackId, nodeId: star.nodeId })
            }
          }}
        />

        <div className="pointer-events-none absolute left-5 top-5 select-none sm:left-8 sm:top-7">
          <div className="text-[17px] font-medium tracking-[0.04em] text-[#EDE6D4] sm:text-[19px]">思考星图</div>
          <div className="mt-1 text-[11px] tracking-[0.06em] text-[#7d7a72] sm:text-[12px]">
            {curatedScene ? "AI 已为你重新策展" : "星图已生成，可视化你的思考轨迹"}
          </div>
        </div>

        {curationTrace ? (
          <div className="pointer-events-none absolute left-5 top-[76px] hidden max-w-[300px] select-none rounded-[8px] border border-[#242016] bg-[#0f0e0b]/42 px-3.5 py-3 shadow-[0_18px_46px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:block md:left-8 md:top-[88px]">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#706b5f]">策展痕迹</div>
            <div className="mt-2 space-y-1.5">
              {curationTrace.lines.map((line) => (
                <div key={line} className="text-[11.5px] leading-[1.55] tracking-[0.03em] text-[#bdb6a4]">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {frozen ? (
          <div className="pointer-events-none absolute right-5 top-5 text-[11px] tracking-[0.08em] text-[#5b584f] sm:right-6 sm:top-7">
            已封存
          </div>
        ) : null}

        {showControls ? (
          <div className="pointer-events-auto absolute bottom-5 right-4 flex max-w-[calc(100vw-32px)] items-center gap-2 sm:bottom-6 sm:right-6 sm:gap-3">
            {curatedScene ? (
              <button
                type="button"
                disabled={isCurating}
                className="rounded-full px-2 py-1 text-[11px] tracking-[0.08em] text-[#67635a] transition hover:bg-white/[0.035] hover:text-[#aaa499] disabled:opacity-40"
                onClick={resetToFallback}
              >
                返回原貌
              </button>
            ) : null}
            {!curatedScene && hasManualPlacements ? (
              <button
                type="button"
                disabled={isCurating}
                className="rounded-full px-2 py-1 text-[11px] tracking-[0.08em] text-[#67635a] transition hover:bg-white/[0.035] hover:text-[#aaa499] disabled:opacity-40"
                onClick={resetStarPlacements}
              >
                重置星位
              </button>
            ) : null}
            {canCurate ? (
              <button
                type="button"
                disabled={isCurating}
                className={cn(
                  "group flex min-w-0 items-center gap-2 rounded-full border border-[#1f1d18] bg-[#0f0e0b]/72 px-3.5 py-1.5 text-[12px] tracking-[0.06em] text-[#bdb6a4] backdrop-blur-sm transition",
                  "hover:border-[#3a352a] hover:bg-[#171511]/70 hover:text-[#EDE6D4]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
                onClick={handleCurate}
              >
                <SparkleIcon spinning={isCurating} />
                <span className="whitespace-nowrap">{isCurating ? "正在策展…" : curatedScene ? "再策展一次" : "AI 策展"}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {curateStatus === "error" && curateErrorLabel ? (
          <div
            role="alert"
            className="pointer-events-auto absolute bottom-20 left-1/2 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-[#3a2a2a] bg-[#0f0e0b]/92 px-4 py-2 text-center text-[11px] tracking-[0.04em] text-[#d9b8aa] backdrop-blur-sm"
          >
            <span>{curateErrorLabel}</span>
            {curateError && isCurateSettingsError(curateError) && onOpenSettings ? (
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#76594c] px-2.5 py-1 text-[#f0d4c5] hover:bg-white/[0.06]"
                onClick={onOpenSettings}
              >
                前往设置
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex h-[var(--star-map-detail-height)] w-full max-h-[72%] overflow-hidden border-t border-white/[0.06] transition-[height,opacity] duration-300 ease-out md:relative md:inset-auto md:h-full md:w-[var(--star-map-detail-width)] md:max-h-none md:shrink-0 md:border-l md:border-t-0 md:transition-[width]",
          showDetail ? "opacity-100" : "pointer-events-none opacity-0 md:opacity-100"
        )}
        style={
          {
            "--star-map-detail-height": showDetail ? "min(72vh, 560px)" : "0px",
            "--star-map-detail-width": showDetail ? "min(100vw, 440px)" : "0px",
          } as CSSProperties
        }
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

function buildCurationTrace(curated: Scene, fallback: Scene) {
  const fallbackById = new Map(fallback.stars.map((star) => [star.id, star]))
  const realStars = curated.stars.filter((star) => star.nodeId)
  const heroes = realStars.filter((star) => star.role === "hero")
  const labeledCount = realStars.filter((star) => Boolean(star.text)).length
  const silentCount = Math.max(0, realStars.length - labeledCount)
  const movedCount = realStars.filter((star) => {
    const before = fallbackById.get(star.id)
    if (!before) return true
    return before.role !== star.role || before.ring !== star.ring || angleDistance(before.angle, star.angle) > 28
  }).length
  const heroText = heroes
    .map((star) => star.text?.trim())
    .filter((text): text is string => Boolean(text))
    .slice(0, 2)
    .map((text) => (text.length > 22 ? `${text.slice(0, 21)}…` : text))
    .join(" / ")

  const lines: string[] = []
  if (heroText) lines.push(`主星：${heroText}`)
  lines.push(`压暗 ${silentCount} 条想法，只点亮 ${labeledCount} 条`)
  lines.push(`重排 ${movedCount} 颗星，留下 ${curated.strands.length} 条牵引`)
  return { lines }
}

function angleDistance(a: number, b: number) {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180)
  return Number.isFinite(delta) ? delta : 0
}

function hashTracks(tracks: ThinkingTrackView[]): string {
  return tracks.map((track) => track.id).join("|") || "default"
}

function buildSceneSignature(rootQuestionText: string, tracks: ThinkingTrackView[]) {
  const payload = {
    root: rootQuestionText.trim(),
    tracks: tracks.map((track) => ({
      id: track.id,
      nodes: track.nodes.map((node) => ({
        id: node.id,
        text: node.questionText ?? "",
        note: node.noteText ?? "",
        answer: node.answerText ?? "",
        image: node.imageAssetId ?? null,
        createdAt: node.createdAt ?? null,
      })),
    })),
  }
  return `v1_${hashText(JSON.stringify(payload))}`
}

function hashText(value: string) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function getCurateErrorLabel(error: string) {
  if (/允许按次使用第三方 AI/i.test(error)) {
    return "AI 策展尚未获授权"
  }
  if (/api key|apikey|请先在设置里填写/i.test(error)) {
    return "请先在设置里填写 AI API Key"
  }
  if (/未授权|unauthorized|http_401|deepseek|network|fetch/i.test(error)) {
    return "AI 策展暂不可用 · 已保留当前星图"
  }
  return "策展失败 · 已保留当前星图"
}

function isCurateSettingsError(error: string) {
  return /允许按次使用第三方 AI|api key|apikey|请先在设置里填写/i.test(error)
}

function loadPersistedCuratedScene(spaceId: string, signature: string): Scene | null {
  if (typeof window === "undefined") return null
  try {
    const store = readPersistedCuratedStore()
    const item = store[spaceId]
    if (!item || item.signature !== signature) return null
    return validateScene(item.scene)
  } catch {
    return null
  }
}

function savePersistedCuratedScene(spaceId: string, signature: string, scene: Scene) {
  if (typeof window === "undefined") return
  try {
    const store = readPersistedCuratedStore()
    store[spaceId] = { signature, scene, updatedAt: new Date().toISOString() }
    const entries = Object.entries(store).sort(
      (a, b) => new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime()
    )
    window.localStorage.setItem(
      STAR_MAP_CURATED_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries.slice(0, MAX_PERSISTED_CURATED_SCENES)))
    )
  } catch {
    // Persistence is opportunistic; rendering should keep working if storage is full.
  }
}

function deletePersistedCuratedScene(spaceId: string) {
  if (typeof window === "undefined") return
  try {
    const store = readPersistedCuratedStore()
    delete store[spaceId]
    window.localStorage.setItem(STAR_MAP_CURATED_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore local storage failures.
  }
}

function readPersistedCuratedStore(): Record<string, PersistedCuratedScene> {
  if (typeof window === "undefined") return {}
  const raw = window.localStorage.getItem(STAR_MAP_CURATED_STORAGE_KEY)
  if (!raw) return {}
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  const store: Record<string, PersistedCuratedScene> = {}
  for (const [spaceId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    if (typeof item.signature !== "string" || typeof item.updatedAt !== "string") continue
    const scene = validateScene(item.scene)
    if (!scene) continue
    store[spaceId] = {
      signature: item.signature,
      scene,
      updatedAt: item.updatedAt,
    }
  }
  return store
}

function applyStarPlacements(scene: Scene, placements: Record<string, StarPlacement>): Scene {
  if (!Object.keys(placements).length) return scene
  return {
    ...scene,
    stars: scene.stars.map((star) => {
      const placement = placements[star.id]
      if (!placement) return star
      return {
        ...star,
        ring: placement.ring,
        angle: placement.angle,
        drift: placement.drift,
        pinned: true,
      }
    }),
  }
}

function pointToPlacement(position: { x: number; y: number; width: number; height: number }): StarPlacement {
  const cx = position.width / 2
  const cy = position.height / 2
  const minDim = Math.min(position.width, position.height)
  const narrow = position.width < 640
  const short = position.height < 520
  const edgePadding = clamp(minDim * 0.07, narrow ? 38 : 46, short ? 64 : 86)
  const outerLimit = Math.max(96, minDim / 2 - edgePadding)
  const aspect = position.width / Math.max(1, position.height)
  const aspectTightening = aspect < 0.82 ? 0.88 : aspect > 2.2 ? 0.94 : 1
  const dx = position.x - cx
  const dy = position.y - cy
  const distance = Math.hypot(dx, dy)
  const rings: Record<StarPlacement["ring"], number> = {
    1: outerLimit * 0.32 * aspectTightening,
    2: outerLimit * 0.54 * aspectTightening,
    3: outerLimit * 0.76 * aspectTightening,
    4: outerLimit * 0.96 * aspectTightening,
  }
  const ring = ([1, 2, 3, 4] as const).reduce((best, candidate) =>
    Math.abs(distance - rings[candidate]) < Math.abs(distance - rings[best]) ? candidate : best
  )
  const driftScale = outerLimit * 0.045
  const drift = clamp((distance - rings[ring]) / driftScale, -2, 2)
  return {
    ring,
    angle: wrapDegrees((Math.atan2(dy, dx) * 180) / Math.PI),
    drift,
  }
}

function loadPersistedStarPlacements(spaceId: string, signature: string): Record<string, StarPlacement> {
  if (typeof window === "undefined") return {}
  try {
    const store = readPersistedPlacementStore()
    const item = store[spaceId]
    if (!item || item.signature !== signature) return {}
    return item.placements
  } catch {
    return {}
  }
}

function savePersistedStarPlacements(
  spaceId: string,
  signature: string,
  placements: Record<string, StarPlacement>
) {
  if (typeof window === "undefined") return
  try {
    const store = readPersistedPlacementStore()
    store[spaceId] = { signature, placements, updatedAt: new Date().toISOString() }
    const entries = Object.entries(store).sort(
      (a, b) => new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime()
    )
    window.localStorage.setItem(
      STAR_MAP_PLACEMENTS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries.slice(0, MAX_PERSISTED_PLACEMENT_SCENES)))
    )
  } catch {
    // Persistence is opportunistic; dragging should keep working if storage is full.
  }
}

function deletePersistedStarPlacements(spaceId: string) {
  if (typeof window === "undefined") return
  try {
    const store = readPersistedPlacementStore()
    delete store[spaceId]
    window.localStorage.setItem(STAR_MAP_PLACEMENTS_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore local storage failures.
  }
}

function readPersistedPlacementStore(): Record<string, PersistedStarPlacements> {
  if (typeof window === "undefined") return {}
  const raw = window.localStorage.getItem(STAR_MAP_PLACEMENTS_STORAGE_KEY)
  if (!raw) return {}
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  const store: Record<string, PersistedStarPlacements> = {}
  for (const [spaceId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    if (typeof item.signature !== "string" || typeof item.updatedAt !== "string") continue
    const placements = normalizePlacements(item.placements)
    if (!Object.keys(placements).length) continue
    store[spaceId] = {
      signature: item.signature,
      placements,
      updatedAt: item.updatedAt,
    }
  }
  return store
}

function normalizePlacements(value: unknown): Record<string, StarPlacement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const placements: Record<string, StarPlacement> = {}
  for (const [starId, rawPlacement] of Object.entries(value as Record<string, unknown>)) {
    if (!rawPlacement || typeof rawPlacement !== "object" || Array.isArray(rawPlacement)) continue
    const item = rawPlacement as Record<string, unknown>
    const ringValue = Number(item.ring)
    if (ringValue !== 1 && ringValue !== 2 && ringValue !== 3 && ringValue !== 4) continue
    placements[starId] = {
      ring: ringValue,
      angle: wrapDegrees(Number(item.angle)),
      drift: clamp(Number(item.drift), -2, 2),
    }
  }
  return placements
}

function wrapDegrees(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
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
