"use client"

import { useEffect, useRef, useState } from "react"
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
  onClose: () => void
  onSelectNode: (trackId: string, nodeId: string) => void
  onJumpToTrackNode: (trackId: string, nodeId: string) => void
  onSubmitFromNode?: (trackId: string, nodeId: string, rawInput: string) => Promise<void>
  composerEnabled: boolean
}

export function ThoughtDetailPanel({
  selected,
  tracks,
  onClose,
  onSelectNode,
  onJumpToTrackNode,
  onSubmitFromNode,
  composerEnabled,
}: Props) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // resolve selected node from tracks
  const resolved = (() => {
    if (!selected) return null
    const track = tracks.find((t) => t.id === selected.trackId)
    if (!track) return null
    const idx = track.nodes.findIndex((n) => n.id === selected.nodeId)
    if (idx < 0) return null
    return { track, node: track.nodes[idx], idx }
  })()

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

  if (!resolved) return null

  const { track, node, idx } = resolved
  const prev = idx > 0 ? track.nodes[idx - 1] : null
  const next = idx < track.nodes.length - 1 ? track.nodes[idx + 1] : null
  const neighbors: ThinkingTrackNodeView[] = []
  if (prev) neighbors.push(prev)
  if (next) neighbors.push(next)

  const fullText =
    (node.answerText && node.answerText.trim()) ||
    (node.noteText && node.noteText.trim()) ||
    ""

  async function handleSubmit() {
    const text = input.trim()
    if (!text || !onSubmitFromNode) return
    setSubmitting(true)
    try {
      await onSubmitFromNode(track.id, node.id, text)
      setInput("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside
      className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-white/[0.06]"
      style={{ backgroundColor: "rgba(10,10,12,0.96)" }}
    >
      <div className="flex items-center justify-between px-6 pt-6">
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pb-6 pt-5">
        {/* selected */}
        <div>
          <div
            className="text-[11px]"
            style={{ color: "rgba(237,230,212,0.4)", letterSpacing: "0.06em" }}
          >
            {hhmm(node.createdAt)}
          </div>
          <div
            className="mt-1 text-[15px]"
            style={{ color: "#EDE6D4", lineHeight: 1.6, letterSpacing: "0.005em" }}
          >
            {node.questionText}
          </div>
        </div>

        {/* neighbors */}
        {neighbors.length > 0 ? (
          <div>
            <div
              className="text-[11px]"
              style={{ color: "rgba(237,230,212,0.42)", letterSpacing: "0.06em" }}
            >
              前后思路
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {neighbors.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectNode(track.id, n.id)}
                  className="group flex flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className="text-[11px]"
                    style={{ color: "rgba(237,230,212,0.4)", letterSpacing: "0.06em" }}
                  >
                    {hhmm(n.createdAt)}
                  </span>
                  <span
                    className="line-clamp-2 text-[13px]"
                    style={{ color: "rgba(237,230,212,0.78)", lineHeight: 1.55 }}
                  >
                    {n.questionText}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* full content */}
        {fullText ? (
          <div>
            <div
              className="text-[11px]"
              style={{ color: "rgba(237,230,212,0.42)", letterSpacing: "0.06em" }}
            >
              完整内容
            </div>
            <div
              className="mt-3 whitespace-pre-wrap text-[13.5px]"
              style={{ color: "rgba(237,230,212,0.78)", lineHeight: 1.7 }}
            >
              {fullText}
            </div>
          </div>
        ) : null}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => onJumpToTrackNode(track.id, node.id)}
          className="self-start rounded-full px-3 py-1 text-[11.5px] transition-colors"
          style={{
            color: "rgba(237,230,212,0.5)",
            border: "1px solid rgba(237,230,212,0.12)",
          }}
        >
          在思路视图中查看
        </button>
      </div>

      {composerEnabled ? (
        <div
          className="border-t border-white/[0.05] px-5 py-4"
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

function hhmm(input?: string): string {
  if (!input) return ""
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ""
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
