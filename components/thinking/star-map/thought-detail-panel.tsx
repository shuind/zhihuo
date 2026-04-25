"use client"

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type {
  ThinkingTrackNodeView,
  ThinkingTrackView,
} from "@/components/thinking-layer"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface SelectedRef {
  trackId: string
  nodeId: string
}

interface Props {
  selected: SelectedRef | null
  tracks: ThinkingTrackView[]
  mediaAssetSources?: Record<string, string>
  onClose: () => void
  onSelectNode: (trackId: string, nodeId: string) => void
  onJumpToTrackNode: (trackId: string, nodeId: string) => void
  onSubmitFromNode?: (trackId: string, nodeId: string, rawInput: string) => Promise<void>
  composerEnabled: boolean
}

export function ThoughtDetailPanel({
  selected,
  tracks,
  mediaAssetSources,
  onClose,
  onSelectNode,
  onJumpToTrackNode,
  onSubmitFromNode,
  composerEnabled,
}: Props) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLDivElement | null>(null)

  const resolved = useMemo(() => {
    if (!selected) return null
    const track = tracks.find((t) => t.id === selected.trackId)
    if (!track) return null
    const idx = track.nodes.findIndex((n) => n.id === selected.nodeId)
    if (idx < 0) return null
    return { track, node: track.nodes[idx], idx }
  }, [selected, tracks])

  // clear input when switching nodes
  useEffect(() => {
    setInput("")
  }, [selected?.nodeId])

  // ESC closes
  useEffect(() => {
    if (!resolved) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [resolved, onClose])

  // center the hero card whenever selection or track changes
  useLayoutEffect(() => {
    if (!resolved) return
    const scroller = scrollerRef.current
    const hero = heroRef.current
    if (!scroller || !hero) return
    const target =
      hero.offsetTop - scroller.clientHeight / 2 + hero.offsetHeight / 2
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" })
  }, [resolved?.node.id, resolved?.track.id])

  if (!resolved) return null

  const { track, node: heroNode } = resolved

  async function handleSubmit() {
    const text = input.trim()
    if (!text || !onSubmitFromNode) return
    setSubmitting(true)
    try {
      await onSubmitFromNode(track.id, heroNode.id, text)
      setInput("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside
      className="relative flex h-full w-[440px] shrink-0 flex-col border-l border-white/[0.06]"
      style={{ backgroundColor: "rgba(10,10,12,0.96)" }}
    >
      <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-[rgba(237,230,212,0.55)] transition-colors hover:bg-white/[0.04] hover:text-[rgba(237,230,212,0.85)]"
          aria-label="关闭详情"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3 3 L9 9 M9 3 L3 9"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          关闭
        </button>
        <button
          type="button"
          onClick={() => onJumpToTrackNode(track.id, heroNode.id)}
          className="rounded-full px-2 py-1 text-[11.5px] text-[rgba(237,230,212,0.45)] transition-colors hover:bg-white/[0.04] hover:text-[rgba(237,230,212,0.85)]"
        >
          在思路视图打开
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-8 pt-2 [scrollbar-width:thin]"
      >
        {/* tall top spacer so the first card can scroll to vertical center */}
        <div className="h-[40vh] shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-3">
          {track.nodes.map((n) => {
            const isHero = n.id === heroNode.id
            return (
              <NodeCard
                key={n.id}
                ref={isHero ? heroRef : undefined}
                node={n}
                hero={isHero}
                mediaAssetSources={mediaAssetSources}
                onClick={() => {
                  if (!isHero) onSelectNode(track.id, n.id)
                }}
              />
            )
          })}
        </div>
        <div className="h-[40vh] shrink-0" aria-hidden="true" />
      </div>

      {composerEnabled ? (
        <div
          className="shrink-0 border-t border-white/[0.05] px-5 py-3"
          style={{ backgroundColor: "rgba(10,10,12,0.98)" }}
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border px-3 py-2",
              "border-white/[0.08]"
            )}
            style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder="继续从这里展开思路…"
              rows={1}
              className="min-h-[28px] resize-none border-0 bg-transparent p-0 text-[13.5px] shadow-none focus-visible:ring-0"
              style={{ color: "#EDE6D4" }}
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || submitting}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30"
              style={{
                color: "rgba(237,230,212,0.65)",
                backgroundColor: "rgba(237,230,212,0.08)",
              }}
              aria-label="提交"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M3 11 L11 3 M6 3 H11 V8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}

interface NodeCardProps {
  node: ThinkingTrackNodeView
  hero: boolean
  mediaAssetSources?: Record<string, string>
  onClick: () => void
}

const NodeCard = forwardRef<HTMLDivElement, NodeCardProps>(function NodeCard(
  { node, hero, mediaAssetSources, onClick },
  ref,
) {
  const imageSrc = node.imageAssetId
    ? mediaAssetSources?.[node.imageAssetId] ?? null
    : null
  const note = (node.noteText ?? "").trim()
  const answer = (node.answerText ?? "").trim()
  const time = hhmm(node.createdAt)

  if (hero) {
    return (
      <div
        ref={ref}
        className="rounded-[20px] border px-5 py-5 transition-colors"
        style={{
          backgroundColor: "rgba(255,255,255,0.035)",
          borderColor: "rgba(237,230,212,0.10)",
        }}
      >
        <div
          className="text-[11px]"
          style={{ color: "rgba(237,230,212,0.45)", letterSpacing: "0.06em" }}
        >
          {time}
        </div>
        <div
          className="mt-2 text-[16.5px] [overflow-wrap:anywhere]"
          style={{ color: "#EDE6D4", lineHeight: 1.65, letterSpacing: "0.005em" }}
        >
          {node.questionText}
        </div>

        {imageSrc ? (
          <div className="mt-4 overflow-hidden rounded-[14px] border border-white/[0.04]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc || "/placeholder.svg"}
              alt=""
              className="block h-auto max-h-[260px] w-full object-cover"
            />
          </div>
        ) : null}

        {note ? (
          <p
            className="mt-4 text-[13px] [overflow-wrap:anywhere]"
            style={{ color: "rgba(237,230,212,0.55)", lineHeight: 1.7 }}
          >
            {note}
          </p>
        ) : null}

        {answer ? (
          <div
            className="mt-4 rounded-[14px] px-4 py-3"
            style={{ backgroundColor: "rgba(255,255,255,0.025)" }}
          >
            <div
              className="text-[10.5px]"
              style={{ color: "rgba(237,230,212,0.4)", letterSpacing: "0.08em" }}
            >
              我的回应
            </div>
            <p
              className="mt-1.5 whitespace-pre-wrap text-[13.5px] [overflow-wrap:anywhere]"
              style={{ color: "rgba(237,230,212,0.82)", lineHeight: 1.75 }}
            >
              {answer}
            </p>
          </div>
        ) : null}
      </div>
    )
  }

  // dim sibling card
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className="group relative w-full cursor-pointer rounded-[14px] px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
    >
      <div
        className="text-[10.5px]"
        style={{ color: "rgba(237,230,212,0.32)", letterSpacing: "0.06em" }}
      >
        {time}
      </div>
      <div
        className="mt-1 line-clamp-2 text-[13px] [overflow-wrap:anywhere] transition-colors group-hover:text-[rgba(237,230,212,0.82)]"
        style={{ color: "rgba(237,230,212,0.55)", lineHeight: 1.65 }}
      >
        {node.questionText}
      </div>
      {imageSrc || answer ? (
        <div
          className="mt-1 text-[10.5px]"
          style={{ color: "rgba(237,230,212,0.28)", letterSpacing: "0.04em" }}
        >
          {[imageSrc ? "图片" : null, answer ? "已记录" : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  )
})

function hhmm(input?: string): string {
  if (!input) return ""
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ""
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
