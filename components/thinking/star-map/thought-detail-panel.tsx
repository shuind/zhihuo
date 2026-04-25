"use client";

import { useEffect, useRef, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { formatClock } from "./star-map-layout";
import type { StarMapMainOrbit, StarMapNode } from "./star-map-types";

type Props = {
  selectedNode: StarMapNode | null;
  mainOrbit: StarMapMainOrbit | null;
  onClose: () => void;
  onSelectMainNode: (nodeId: string) => void;
  onJumpToTrackNode: (trackId: string, nodeId: string) => void;
  onSubmitFromNode?: (
    trackId: string,
    nodeId: string,
    rawInput: string
  ) => Promise<void>;
  composerEnabled: boolean;
};

export function ThoughtDetailPanel({
  selectedNode,
  mainOrbit,
  onClose,
  onSelectMainNode,
  onJumpToTrackNode,
  onSubmitFromNode,
  composerEnabled,
}: Props) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 切换节点时清空输入框
  useEffect(() => {
    setInput("");
  }, [selectedNode?.id]);

  if (!selectedNode || !mainOrbit) return null;

  // 同主轨上的前后节点（最多各 1 个）
  const idx = mainOrbit.nodes.findIndex((n) => n.id === selectedNode.id);
  const neighbors: StarMapNode[] = [];
  if (idx > 0) neighbors.push(mainOrbit.nodes[idx - 1]);
  if (idx >= 0 && idx < mainOrbit.nodes.length - 1) {
    neighbors.push(mainOrbit.nodes[idx + 1]);
  }

  const fullText =
    (selectedNode.answerText && selectedNode.answerText.trim()) ||
    (selectedNode.noteText && selectedNode.noteText.trim()) ||
    "";

  async function handleSubmit() {
    const text = input.trim();
    if (!text || !selectedNode || !onSubmitFromNode) return;
    setSubmitting(true);
    try {
      await onSubmitFromNode(selectedNode.trackId, selectedNode.id, text);
      setInput("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside
      className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-white/[0.06]"
      style={{ backgroundColor: "rgba(10,10,12,0.96)" }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-[rgba(237,230,212,0.55)] transition-colors hover:bg-white/[0.04] hover:text-[rgba(237,230,212,0.85)]"
          aria-label="关闭详情"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
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
        {/* 选中节点 */}
        <div>
          <div
            className="text-[11px]"
            style={{
              color: "rgba(237,230,212,0.4)",
              letterSpacing: "0.06em",
            }}
          >
            {formatClock(selectedNode.createdAt)}
          </div>
          <div
            className="mt-1 text-[15px]"
            style={{
              color: "#EDE6D4",
              lineHeight: 1.6,
              letterSpacing: "0.005em",
            }}
          >
            {selectedNode.questionText}
          </div>
        </div>

        {/* 前后思路 */}
        {neighbors.length > 0 ? (
          <div>
            <div
              className="text-[11px]"
              style={{
                color: "rgba(237,230,212,0.42)",
                letterSpacing: "0.06em",
              }}
            >
              前后思路
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {neighbors.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectMainNode(n.id)}
                  className="group flex flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className="text-[11px]"
                    style={{
                      color: "rgba(237,230,212,0.4)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {formatClock(n.createdAt)}
                  </span>
                  <span
                    className="line-clamp-2 text-[13px]"
                    style={{
                      color: "rgba(237,230,212,0.78)",
                      lineHeight: 1.55,
                    }}
                  >
                    {n.questionText}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 完整内容 */}
        {fullText ? (
          <div>
            <div
              className="text-[11px]"
              style={{
                color: "rgba(237,230,212,0.42)",
                letterSpacing: "0.06em",
              }}
            >
              完整内容
            </div>
            <div
              className="mt-3 whitespace-pre-wrap text-[13.5px]"
              style={{
                color: "rgba(237,230,212,0.78)",
                lineHeight: 1.7,
              }}
            >
              {fullText}
            </div>
          </div>
        ) : null}

        <div className="flex-1" />

        {/* 跳回思路视图 */}
        <button
          type="button"
          onClick={() =>
            onJumpToTrackNode(selectedNode.trackId, selectedNode.id)
          }
          className="self-start rounded-full px-3 py-1 text-[11.5px] transition-colors"
          style={{
            color: "rgba(237,230,212,0.5)",
            border: "1px solid rgba(237,230,212,0.12)",
          }}
        >
          在思路视图中查看
        </button>
      </div>

      {/* 继续输入框 */}
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
                if (
                  (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ||
                  (e.key === "Enter" && !e.shiftKey && false)
                ) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="继续从这里展开思路…"
              rows={1}
              className="min-h-[28px] resize-none border-0 bg-transparent p-0 text-[13.5px] shadow-none focus-visible:ring-0"
              style={{
                color: "#EDE6D4",
              }}
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
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
  );
}
