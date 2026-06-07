"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "@/lib/utils"
import type { Scene } from "./scene-types"
import { compileScene, type CompiledStar } from "./scene-compiler"

interface StageRendererProps {
  scene: Scene
  seed: string
  selectedStarId?: string | null
  onSelectStar?: (star: CompiledStar) => void
  onMoveStar?: (
    star: CompiledStar,
    position: { x: number; y: number; width: number; height: number }
  ) => void
  onCommitStarMove?: (
    star: CompiledStar,
    position: { x: number; y: number; width: number; height: number }
  ) => void
  className?: string
}

export function StageRenderer({
  scene,
  seed,
  selectedStarId,
  onSelectStar,
  onMoveStar,
  onCommitStarMove,
  className,
}: StageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    pointerId: number
    star: CompiledStar
    startX: number
    startY: number
    moved: boolean
    lastPosition: { x: number; y: number; width: number; height: number }
  } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1200, h: 720 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        if (width > 0 && height > 0) setSize({ w: width, h: height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const compiled = useMemo(
    () => compileScene(scene, size.w, size.h, seed),
    [scene, size.w, size.h, seed]
  )

  const coreLines = useMemo(
    () => softWrap(compiled.core.text, compiled.width < 560 ? 7 : 9),
    [compiled.core.text, compiled.width]
  )
  const visibleLabels = useMemo(
    () => buildVisibleLabels(compiled.stars, compiled.width, compiled.height, compiled.core, selectedStarId, hoverId),
    [compiled.core, compiled.height, compiled.stars, compiled.width, hoverId, selectedStarId]
  )

  function getLocalPointer(event: ReactPointerEvent<SVGElement>) {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * compiled.width
    const y = ((event.clientY - rect.top) / rect.height) * compiled.height
    return {
      x: clamp(x, 24, compiled.width - 24),
      y: clamp(y, 24, compiled.height - 24),
      width: compiled.width,
      height: compiled.height,
    }
  }

  function beginDrag(event: ReactPointerEvent<SVGCircleElement>, star: CompiledStar) {
    if (!onMoveStar) return
    const point = getLocalPointer(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      star,
      startX: point.x,
      startY: point.y,
      moved: false,
      lastPosition: point,
    }
    setDragId(star.id)
  }

  function moveDrag(event: ReactPointerEvent<SVGCircleElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !onMoveStar) return
    const point = getLocalPointer(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 3) drag.moved = true
    drag.lastPosition = point
    if (drag.moved) onMoveStar(drag.star, point)
  }

  function endDrag(event: ReactPointerEvent<SVGCircleElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // The browser may already release capture when the pointer is cancelled.
    }
    dragRef.current = null
    setDragId(null)
    if (drag.moved) onCommitStarMove?.(drag.star, drag.lastPosition)
    else onSelectStar?.(drag.star)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden",
        // deep dark canvas; intentionally not pure black, has a hint of cool warmth
              "bg-[#09090b]",
        className
      )}
    >
      {/* ambient vignette so the corners fade to true black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.62) 100%)",
        }}
      />

      <svg
        ref={svgRef}
        width={compiled.width}
        height={compiled.height}
        viewBox={`0 0 ${compiled.width} ${compiled.height}`}
        className="absolute inset-0 touch-none"
      >
        <defs>
          {/* core glow: three stacked radial gradients = no hard boundary */}
          <radialGradient id="sm-core-far" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245,232,194,0.035)" />
            <stop offset="55%" stopColor="rgba(220,200,150,0.012)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="sm-core-mid" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245,232,194,0.06)" />
            <stop offset="60%" stopColor="rgba(220,200,150,0.018)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="sm-core-near" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,243,210,0.085)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="sm-star-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(245,232,194,0.55)" />
            <stop offset="55%" stopColor="rgba(245,232,194,0.10)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* ambient noise stars (background depth) */}
        <g>
          {compiled.ambient.map((a, i) => (
            <circle
              key={i}
              cx={a.x}
              cy={a.y}
              r={a.r}
              fill="rgb(237,230,212)"
              opacity={a.opacity}
            />
          ))}
        </g>

        {/* strands (drawn under stars) */}
        <g>
          {compiled.strands.map((s) => {
            const d = `M ${s.fromXY.x} ${s.fromXY.y} Q ${s.control.x} ${s.control.y} ${s.toXY.x} ${s.toXY.y}`
            const lineOpacity = 0.08 + s.weight * 0.22
            const dustOpacity = 0.14 + s.weight * 0.24
            return (
              <g key={s.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="rgb(237,230,212)"
                  strokeWidth={0.5 + s.weight * 0.55}
                  strokeDasharray="1.2 5.5"
                  strokeLinecap="round"
                  opacity={lineOpacity}
                />
                {s.dustPoints.map((dp, i) => (
                  <circle
                    key={i}
                    cx={dp.x}
                    cy={dp.y}
                    r={0.55 + s.weight * 0.22}
                    fill="rgb(237,230,212)"
                    opacity={dustOpacity}
                  />
                ))}
              </g>
            )
          })}
        </g>

        {/* core glow (no hard edge) */}
        <g>
          <circle
            cx={compiled.core.x}
            cy={compiled.core.y}
            r={compiled.core.r * 3.6}
            fill="url(#sm-core-far)"
          />
          <circle
            cx={compiled.core.x}
            cy={compiled.core.y}
            r={compiled.core.r * 2.0}
            fill="url(#sm-core-mid)"
          />
          <circle
            cx={compiled.core.x}
            cy={compiled.core.y}
            r={compiled.core.r * 0.95}
            fill="url(#sm-core-near)"
          />
        </g>

        {/* stars */}
        <g>
          {compiled.stars.map((star) => {
            const isSelected = selectedStarId === star.id
            const isHover = hoverId === star.id
            const showHalo = star.halo || isSelected || isHover
            const hitRadius = Math.max(star.r * 4.2, compiled.width < 560 ? 18 : 12)
            return (
              <g key={star.id}>
                {showHalo && (
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.r * (isSelected ? 5.5 : isHover ? 4.6 : 3.8)}
                    fill="url(#sm-star-halo)"
                    opacity={isSelected ? 1 : isHover ? 0.9 : 0.66}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={star.r}
                  fill={isSelected ? "rgb(255,245,210)" : "rgb(245,232,194)"}
                  opacity={isSelected ? 1 : star.opacity}
                />
                {isSelected ? (
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.r + 4.5}
                    fill="none"
                    stroke="rgba(245,232,194,0.58)"
                    strokeWidth={0.8}
                    pointerEvents="none"
                  />
                ) : null}
                {/* invisible larger hit target for easy clicking */}
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={hitRadius}
                  fill="transparent"
                  className={cn(onMoveStar ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", dragId === star.id ? "cursor-grabbing" : null)}
                  style={{ touchAction: "none" }}
                  onMouseEnter={() => setHoverId(star.id)}
                  onMouseLeave={() => setHoverId((h) => (h === star.id ? null : h))}
                  onPointerDown={(event) => beginDrag(event, star)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => {
                    if (!onMoveStar) onSelectStar?.(star)
                  }}
                />
              </g>
            )
          })}
        </g>
      </svg>

      {/* HTML overlay for text labels — easier wrapping & alignment than SVG text */}
      <div className="pointer-events-none absolute inset-0">
        {/* core text */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{
            left: compiled.core.x,
            top: compiled.core.y,
            maxWidth: Math.min(compiled.width * (compiled.width < 560 ? 0.38 : 0.22), 220),
          }}
        >
          <div className="font-sans text-[13.5px] leading-[1.65] tracking-[0.04em] text-[#EDE6D4] sm:text-[14px]">
            {coreLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>

        {/* star labels: only stars carrying text */}
        {visibleLabels
          .map(({ star, style }) => {
            const isHero = star.role === "hero"
            const isSelected = selectedStarId === star.id
            return (
              <div
                key={`label-${star.id}`}
                className="pointer-events-auto absolute cursor-pointer select-none transition-opacity"
                style={style}
                onClick={() => onSelectStar?.(star)}
                onMouseEnter={() => setHoverId(star.id)}
                onMouseLeave={() => setHoverId((h) => (h === star.id ? null : h))}
              >
                <div
                  className={cn(
                    "font-sans leading-[1.55]",
                    isHero
                      ? "text-[13.5px] text-[#EDE6D4]"
                      : "text-[12px] text-[#b4ad9c]",
                    isSelected ? "text-[#F5E8C2]" : null
                  )}
                  style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
                >
                  {star.text}
                </div>
                {star.timestamp ? (
                  <div className="mt-1 font-sans text-[10.5px] tracking-[0.08em] text-[#6f6c66]">
                    {star.timestamp}
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}

// Soft text wrap by character count (handles CJK & latin without measuring DOM).
function softWrap(text: string, maxPerLine: number): string[] {
  const out: string[] = []
  let cur = ""
  for (const ch of text) {
    if (cur.length >= maxPerLine && (ch === " " || cur.length >= maxPerLine + 2)) {
      out.push(cur.trim())
      cur = ch === " " ? "" : ch
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type VisibleLabel = {
  star: CompiledStar
  style: CSSProperties
  box: { left: number; top: number; right: number; bottom: number }
}

function buildVisibleLabels(
  stars: CompiledStar[],
  width: number,
  height: number,
  core: { x: number; y: number; r: number },
  selectedStarId: string | null | undefined,
  hoverId: string | null
): VisibleLabel[] {
  const mobile = width < 560
  const compact = width < 760 || height < 520
  const labelBudget = mobile ? 3 : compact ? 5 : clamp(Math.round(width / 190), 5, 9)
  const edgePadding = mobile ? 14 : 22
  const minTop = mobile ? 58 : 42
  const maxBottom = height - (mobile ? 86 : 44)
  const labelMaxWidth = mobile ? Math.min(164, width - edgePadding * 2) : Math.min(210, Math.max(138, width * 0.26))
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [
    {
      left: core.x - core.r * 1.75,
      top: core.y - core.r * 1.15,
      right: core.x + core.r * 1.75,
      bottom: core.y + core.r * 1.15,
    },
  ]

  const candidates = stars
    .filter((star) => Boolean(star.text))
    .filter((star) => {
      if (star.id === selectedStarId || star.id === hoverId) return true
      if (mobile) return star.role === "hero"
      if (compact) return star.role === "hero" || star.role === "support"
      return star.role !== "ambient"
    })
    .sort((a, b) => {
      const aActive = a.id === selectedStarId ? 3 : a.id === hoverId ? 2 : 0
      const bActive = b.id === selectedStarId ? 3 : b.id === hoverId ? 2 : 0
      return bActive - aActive || b.labelPriority - a.labelPriority
    })

  const labels: VisibleLabel[] = []
  for (const star of candidates) {
    const forced = star.id === selectedStarId || star.id === hoverId
    if (!forced && labels.length >= labelBudget) continue
    const label = placeLabel(star, width, core, labelMaxWidth, edgePadding, minTop, maxBottom, occupied)
    if (!label) {
      if (!forced) continue
      const fallback = forcePlaceLabel(star, width, core, labelMaxWidth, edgePadding, minTop, maxBottom)
      labels.push(fallback)
      occupied.push(fallback.box)
      continue
    }
    labels.push(label)
    occupied.push(label.box)
  }

  return labels
}

function placeLabel(
  star: CompiledStar,
  width: number,
  core: { x: number; y: number },
  maxWidth: number,
  edgePadding: number,
  minTop: number,
  maxBottom: number,
  occupied: Array<{ left: number; top: number; right: number; bottom: number }>
): VisibleLabel | null {
  const estimate = estimateLabelSize(star, maxWidth)
  const labelOffset = Math.max(star.r * 3.4, width < 560 ? 18 : 15)
  const dx = star.x - core.x
  const wouldClipLeft = star.x - labelOffset - maxWidth < edgePadding
  const wouldClipRight = star.x + labelOffset + maxWidth > width - edgePadding
  const preferredRight = wouldClipLeft ? true : wouldClipRight ? false : dx >= 0
  const sides = preferredRight ? [true, false] : [false, true]
  const nudges = [0, -22, 22, -44, 44, -66, 66]

  for (const onRight of sides) {
    const left = onRight ? star.x + labelOffset : star.x - labelOffset - estimate.width
    const clampedLeft = clamp(left, edgePadding, width - edgePadding - estimate.width)
    for (const nudge of nudges) {
      const top = clamp(star.y - estimate.height / 2 + nudge, minTop, Math.max(minTop, maxBottom - estimate.height))
      const box = {
        left: clampedLeft,
        top,
        right: clampedLeft + estimate.width,
        bottom: top + estimate.height,
      }
      if (occupied.some((item) => boxesOverlap(box, item, 8))) continue
      return {
        star,
        box,
        style: {
          left: onRight ? clampedLeft : clampedLeft + estimate.width,
          top: top + estimate.height / 2,
          transform: onRight ? "translateY(-50%)" : "translate(-100%, -50%)",
          textAlign: onRight ? "left" : "right",
          maxWidth,
          opacity: star.role === "echo" ? 0.78 : 1,
        },
      }
    }
  }
  return null
}

function forcePlaceLabel(
  star: CompiledStar,
  width: number,
  core: { x: number; y: number },
  maxWidth: number,
  edgePadding: number,
  minTop: number,
  maxBottom: number
): VisibleLabel {
  const estimate = estimateLabelSize(star, maxWidth)
  const onRight = star.x < core.x || star.x - maxWidth < edgePadding
  const left = onRight
    ? clamp(star.x + 18, edgePadding, width - edgePadding - estimate.width)
    : clamp(star.x - 18 - estimate.width, edgePadding, width - edgePadding - estimate.width)
  const top = clamp(star.y - estimate.height / 2, minTop, Math.max(minTop, maxBottom - estimate.height))
  return {
    star,
    box: { left, top, right: left + estimate.width, bottom: top + estimate.height },
    style: {
      left: onRight ? left : left + estimate.width,
      top: top + estimate.height / 2,
      transform: onRight ? "translateY(-50%)" : "translate(-100%, -50%)",
      textAlign: onRight ? "left" : "right",
      maxWidth,
    },
  }
}

function estimateLabelSize(star: CompiledStar, maxWidth: number) {
  const text = star.text ?? ""
  const charsPerLine = Math.max(8, Math.floor(maxWidth / (containsWideGlyph(text) ? 13 : 7.2)))
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
  return {
    width: Math.min(maxWidth, Math.max(76, Math.min(text.length, charsPerLine) * (containsWideGlyph(text) ? 13 : 7.2))),
    height: lines * 19 + (star.timestamp ? 17 : 0),
  }
}

function containsWideGlyph(text: string) {
  return /[^\u0000-\u00ff]/.test(text)
}

function boxesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  gap: number
) {
  return !(a.right + gap < b.left || b.right + gap < a.left || a.bottom + gap < b.top || b.bottom + gap < a.top)
}
