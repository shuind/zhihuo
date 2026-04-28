"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import type { Scene } from "./scene-types"
import { compileScene, type CompiledStar } from "./scene-compiler"

interface StageRendererProps {
  scene: Scene
  seed: string
  selectedStarId?: string | null
  onSelectStar?: (star: CompiledStar) => void
  className?: string
}

export function StageRenderer({
  scene,
  seed,
  selectedStarId,
  onSelectStar,
  className,
}: StageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1200, h: 720 })
  const [hoverId, setHoverId] = useState<string | null>(null)

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
    () => softWrap(compiled.core.text, 9),
    [compiled.core.text]
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden",
        // deep dark canvas; intentionally not pure black, has a hint of cool warmth
        "bg-[#0a0a0c]",
        className
      )}
    >
      {/* ambient vignette so the corners fade to true black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <svg
        width={compiled.width}
        height={compiled.height}
        viewBox={`0 0 ${compiled.width} ${compiled.height}`}
        className="absolute inset-0"
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
            const lineOpacity = 0.10 + s.weight * 0.18
            const dustOpacity = 0.18 + s.weight * 0.25
            return (
              <g key={s.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="rgb(237,230,212)"
                  strokeWidth={0.55 + s.weight * 0.45}
                  strokeDasharray="1.4 5"
                  strokeLinecap="round"
                  opacity={lineOpacity}
                />
                {s.dustPoints.map((dp, i) => (
                  <circle
                    key={i}
                    cx={dp.x}
                    cy={dp.y}
                    r={0.7}
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
            return (
              <g key={star.id}>
                {showHalo && (
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.r * (isSelected ? 5 : 3.8)}
                    fill="url(#sm-star-halo)"
                    opacity={isSelected ? 1 : isHover ? 0.85 : 0.7}
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
                {/* invisible larger hit target for easy clicking */}
                <circle
                  cx={star.x}
                  cy={star.y}
                  r={Math.max(star.r * 3, 10)}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverId(star.id)}
                  onMouseLeave={() => setHoverId((h) => (h === star.id ? null : h))}
                  onClick={() => onSelectStar?.(star)}
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
            maxWidth: Math.min(compiled.width * 0.22, 220),
          }}
        >
          <div className="font-sans text-[14px] leading-[1.65] tracking-[0.04em] text-[#EDE6D4]">
            {coreLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>

        {/* star labels: only stars carrying text */}
        {compiled.stars
          .filter((s) =>
            s.text && shouldShowStarLabel(s, compiled.width, selectedStarId)
          )
          .map((star) => {
            const dx = star.x - compiled.core.x
            const labelOffset = Math.max(star.r * 3, 14)
            const isHero = star.role === "hero"
            const labelMaxWidth = Math.min(200, Math.max(128, compiled.width * 0.36))
            const edgePadding = 18
            const wouldClipLeft = star.x - labelOffset - labelMaxWidth < edgePadding
            const wouldClipRight = star.x + labelOffset + labelMaxWidth > compiled.width - edgePadding
            const onRight = wouldClipLeft ? true : wouldClipRight ? false : dx >= 0
            const labelStyle: CSSProperties = {
              left: onRight ? star.x + labelOffset : star.x - labelOffset,
              top: clamp(star.y, 48, compiled.height - 48),
              transform: onRight ? "translateY(-50%)" : "translate(-100%, -50%)",
              textAlign: onRight ? "left" : "right",
              maxWidth: labelMaxWidth,
            }
            const isSelected = selectedStarId === star.id
            return (
              <div
                key={`label-${star.id}`}
                className="pointer-events-auto absolute cursor-pointer select-none transition-opacity"
                style={labelStyle}
                onClick={() => onSelectStar?.(star)}
                onMouseEnter={() => setHoverId(star.id)}
                onMouseLeave={() => setHoverId((h) => (h === star.id ? null : h))}
              >
                <div
                  className={cn(
                    "font-sans leading-[1.55]",
                    isHero
                      ? "text-[13.5px] text-[#EDE6D4]"
                      : "text-[12.5px] text-[#b4ad9c]",
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

function shouldShowStarLabel(
  star: CompiledStar,
  width: number,
  selectedStarId: string | null | undefined
) {
  if (selectedStarId === star.id) return true
  if (width < 560) return false
  return true
}
