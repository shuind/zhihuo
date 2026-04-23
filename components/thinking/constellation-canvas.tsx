"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ThinkingTrackNodeView, ThinkingTrackView } from "@/components/thinking-layer";
import { cn } from "@/lib/utils";

type ConstellationCanvasProps = {
  tracks: ThinkingTrackView[];
  activeTrackId: string | null;
  rootQuestionText: string;
  frozen: boolean;
  onSelectNode: (trackId: string, nodeId: string) => void;
  className?: string;
};

type NodeKind = "question" | "idea" | "hypothesis" | "link" | "retrace" | "result";

const KIND_META: Array<{ kind: NodeKind; label: string; color: string; filled: boolean }> = [
  { kind: "question",   label: "问题", color: "#B9AE92", filled: true  },
  { kind: "idea",       label: "想法", color: "#8E8672", filled: true  },
  { kind: "hypothesis", label: "假设", color: "#E4C98A", filled: true  },
  { kind: "link",       label: "关联", color: "#9AA3AE", filled: false },
  { kind: "retrace",    label: "回溯", color: "#A89B84", filled: false },
  { kind: "result",     label: "结果", color: "#FFE9AE", filled: true  },
];

type CanvasNode = {
  id: string;
  trackId: string;
  label: string;
  time: string;
  timeMs: number | null;
  kind: NodeKind;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  seed: number;
};

function seededRandom(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function formatClock(iso?: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toMs(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function inferKind(node: ThinkingTrackNodeView, seed: number): NodeKind {
  if (node.answerText && node.answerText.trim().length > 0) return "result";
  if (node.isSuggested) return "hypothesis";
  if (node.echoTrackId || node.echoNodeId) return "link";
  if (node.noteText && node.noteText.trim().length > 0) return "idea";
  return seed > 0.82 ? "retrace" : "question";
}

function truncate(text: string, max = 22) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapLabel(text: string, perLine = 10) {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += perLine) {
    result.push(text.slice(i, i + perLine));
  }
  return result.slice(0, 3);
}

export function ConstellationCanvas({
  tracks,
  activeTrackId,
  rootQuestionText,
  frozen,
  onSelectNode,
  className,
}: ConstellationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeKinds, setActiveKinds] = useState<Set<NodeKind>>(() => new Set(KIND_META.map((k) => k.kind)));
  const [zoom, setZoom] = useState(1);
  const [timeIndex, setTimeIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const { nodes, sortedTimes, centerLinks, neighborLinks, starfield } = useMemo(() => {
    const visibleTracks = tracks.filter((track) => !track.isEmpty && track.nodes.length > 0);
    const flattened: Array<{ node: ThinkingTrackNodeView; trackId: string; order: number }> = [];

    visibleTracks.forEach((track) => {
      track.nodes.forEach((node, i) => {
        flattened.push({ node, trackId: track.id, order: i });
      });
    });

    flattened.sort((a, b) => {
      const ta = toMs(a.node.createdAt) ?? a.order;
      const tb = toMs(b.node.createdAt) ?? b.order;
      return ta - tb;
    });

    const total = flattened.length;
    const canvasNodes: CanvasNode[] = flattened.map((entry, index) => {
      const seed = seededRandom(entry.node.id || `n-${index}`);
      const seed2 = seededRandom(`${entry.node.id || index}-r`);
      const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
      const angle = baseAngle + (seed - 0.5) * 0.55;
      const radius = 24 + seed2 * 16;
      const x = 50 + Math.cos(angle) * radius;
      const y = 50 + Math.sin(angle) * radius * 0.62;
      const kind = inferKind(entry.node, seed);
      const timeMs = toMs(entry.node.createdAt);
      return {
        id: entry.node.id,
        trackId: entry.trackId,
        label: truncate(entry.node.questionText),
        time: formatClock(entry.node.createdAt),
        timeMs,
        kind,
        x: clamp(x, 8, 92),
        y: clamp(y, 12, 86),
        radius,
        active: entry.trackId === activeTrackId,
        seed,
      };
    });

    const links = canvasNodes.map((n) => {
      const dx = n.x - 50;
      const dy = n.y - 50;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const mx = 50 + dx * 0.5;
      const my = 50 + dy * 0.5;
      const curveAmp = 6 + n.seed * 8;
      const dir = n.seed > 0.5 ? 1 : -1;
      const cx = mx + px * curveAmp * dir;
      const cy = my + py * curveAmp * dir;
      return { id: n.id, d: `M 50 50 Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${n.x.toFixed(2)} ${n.y.toFixed(2)}`, active: n.active, kind: n.kind };
    });

    const neighbors: Array<{ id: string; d: string }> = [];
    for (let i = 0; i < canvasNodes.length - 1; i++) {
      const a = canvasNodes[i];
      const b = canvasNodes[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const seed = seededRandom(`${a.id}-${b.id}`);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const amp = 3 + seed * 5;
      const dir = seed > 0.5 ? 1 : -1;
      const cx = mx + px * amp * dir;
      const cy = my + py * amp * dir;
      neighbors.push({ id: `${a.id}-${b.id}`, d: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}` });
    }

    const stars = Array.from({ length: 90 }, (_, i) => {
      const s1 = seededRandom(`star-${i}-x`);
      const s2 = seededRandom(`star-${i}-y`);
      const s3 = seededRandom(`star-${i}-r`);
      return {
        id: i,
        x: s1 * 100,
        y: s2 * 100,
        r: 0.08 + s3 * 0.22,
        o: 0.12 + s3 * 0.4,
      };
    });

    const times = canvasNodes
      .map((n) => ({ id: n.id, ms: n.timeMs, label: n.time }))
      .filter((t): t is { id: string; ms: number; label: string } => t.ms !== null)
      .sort((a, b) => a.ms - b.ms);

    return { nodes: canvasNodes, sortedTimes: times, centerLinks: links, neighborLinks: neighbors, starfield: stars };
  }, [tracks, activeTrackId]);

  useEffect(() => {
    if (sortedTimes.length === 0) {
      setTimeIndex(null);
      return;
    }
    setTimeIndex((prev) => {
      if (prev === null) return sortedTimes.length - 1;
      return Math.min(prev, sortedTimes.length - 1);
    });
  }, [sortedTimes.length]);

  useEffect(() => {
    if (!playing || sortedTimes.length === 0) return;
    const id = window.setInterval(() => {
      setTimeIndex((prev) => {
        const next = (prev ?? -1) + 1;
        if (next >= sortedTimes.length) {
          setPlaying(false);
          return sortedTimes.length - 1;
        }
        return next;
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [playing, sortedTimes.length]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  const toggleKind = useCallback((kind: NodeKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const currentCutoffMs = useMemo(() => {
    if (timeIndex === null || sortedTimes.length === 0) return null;
    return sortedTimes[Math.min(timeIndex, sortedTimes.length - 1)]?.ms ?? null;
  }, [timeIndex, sortedTimes]);

  const nodeVisible = useCallback(
    (node: CanvasNode) => {
      if (!activeKinds.has(node.kind)) return false;
      if (currentCutoffMs !== null && node.timeMs !== null && node.timeMs > currentCutoffMs) return false;
      return true;
    },
    [activeKinds, currentCutoffMs]
  );

  const rootLines = wrapLabel(rootQuestionText, 8);
  const nowLabel = currentCutoffMs !== null ? formatClock(new Date(currentCutoffMs).toISOString()) : "--:--";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-[520px] flex-col overflow-hidden rounded-[28px] border border-black/40",
        "bg-[#0b0a08]",
        frozen ? "opacity-90" : "",
        className
      )}
      style={{ color: "#E8DFC8" }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 46%, rgba(244,223,172,0.18) 0%, rgba(196,160,92,0.08) 22%, rgba(20,18,14,0.0) 55%), radial-gradient(ellipse at 50% 50%, #13110d 0%, #0b0a08 75%)",
        }}
      />

      {/* Header */}
      <div className="relative z-20 flex shrink-0 items-start justify-between gap-6 px-8 pt-7">
        <div className="min-w-0">
          <h3 className="text-[20px] font-medium tracking-wide text-[#EFE6CE]">思考星图</h3>
          <p className="mt-1 text-[12px] text-[#8c8570]">可视化你的思考轨迹与关联</p>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative z-10 flex min-h-0 flex-1 items-stretch px-6 pt-2">
        <div className="relative mx-auto h-full w-full max-w-[1280px]">
          <div
            className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* SVG links + stars */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label="思考星图"
            >
              <defs>
                <radialGradient id="cc-center-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(248,228,170,0.55)" />
                  <stop offset="35%" stopColor="rgba(232,200,130,0.22)" />
                  <stop offset="75%" stopColor="rgba(120,90,50,0.04)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
                <linearGradient id="cc-link-amber" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(232,200,130,0.6)" />
                  <stop offset="100%" stopColor="rgba(232,200,130,0.1)" />
                </linearGradient>
              </defs>

              {/* Starfield */}
              {starfield.map((s) => (
                <circle
                  key={s.id}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill="#f5e9c8"
                  opacity={s.o}
                />
              ))}

              {/* Central glow disc */}
              <circle cx="50" cy="50" r="26" fill="url(#cc-center-glow)" />
              <circle
                cx="50"
                cy="50"
                r="8.8"
                fill="rgba(248,232,186,0.08)"
                stroke="rgba(248,232,186,0.35)"
                strokeWidth="0.18"
                vectorEffect="non-scaling-stroke"
              />

              {/* Neighbor (timeline) curves */}
              {neighborLinks.map((l) => {
                const [aId, bId] = l.id.split("-");
                const a = nodes.find((n) => n.id === aId);
                const b = nodes.find((n) => n.id === bId);
                if (!a || !b) return null;
                const visible = nodeVisible(a) && nodeVisible(b);
                return (
                  <path
                    key={l.id}
                    d={l.d}
                    fill="none"
                    stroke="rgba(232,223,200,0.14)"
                    strokeWidth="0.45"
                    strokeDasharray="0.6 1.2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={visible ? 1 : 0.15}
                  />
                );
              })}

              {/* Center -> node curves */}
              {centerLinks.map((l) => {
                const node = nodes.find((n) => n.id === l.id);
                if (!node) return null;
                const visible = nodeVisible(node);
                const active = l.active || hoveredNodeId === l.id;
                return (
                  <path
                    key={l.id}
                    d={l.d}
                    fill="none"
                    stroke={active ? "rgba(248,228,170,0.72)" : "rgba(210,190,150,0.3)"}
                    strokeWidth={active ? 0.6 : 0.35}
                    strokeDasharray="0.9 1.6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={visible ? 1 : 0.18}
                  />
                );
              })}

              {/* Node dots inside SVG (crisp on zoom) */}
              {nodes.map((n) => {
                const meta = KIND_META.find((k) => k.kind === n.kind)!;
                const visible = nodeVisible(n);
                const isActive = n.active || hoveredNodeId === n.id;
                const r = isActive ? 1.2 : 0.9;
                return (
                  <g key={`dot-${n.id}`} opacity={visible ? 1 : 0.18}>
                    {isActive ? (
                      <circle cx={n.x} cy={n.y} r={r * 3} fill={meta.color} opacity={0.18} />
                    ) : null}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={meta.filled ? meta.color : "#0b0a08"}
                      stroke={meta.color}
                      strokeWidth={meta.filled ? 0 : 0.28}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Central glowing question */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative grid h-[148px] w-[148px] place-items-center rounded-full">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(250,232,182,0.32) 0%, rgba(210,170,100,0.12) 50%, rgba(0,0,0,0) 75%)",
                    boxShadow: "inset 0 0 28px rgba(250,232,182,0.14)",
                  }}
                />
                <div className="relative px-5 text-center">
                  <p className="whitespace-pre-line text-[13px] font-medium leading-[1.55] text-[#F2E6C0]">
                    {rootLines.join("\n")}
                  </p>
                </div>
              </div>
            </div>

            {/* Node labels + click targets */}
            {nodes.map((n) => {
              const visible = nodeVisible(n);
              const dx = n.x - 50;
              const dy = n.y - 50;
              const len = Math.hypot(dx, dy) || 1;
              const ox = (dx / len) * 6.2;
              const oy = (dy / len) * 4;
              const lx = clamp(n.x + ox, 2, 98);
              const ly = clamp(n.y + oy, 4, 96);
              const leftSide = dx < 0;
              const meta = KIND_META.find((k) => k.kind === n.kind)!;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectNode(n.trackId, n.id)}
                  onMouseEnter={() => setHoveredNodeId(n.id)}
                  onMouseLeave={() => setHoveredNodeId((prev) => (prev === n.id ? null : prev))}
                  onFocus={() => setHoveredNodeId(n.id)}
                  onBlur={() => setHoveredNodeId((prev) => (prev === n.id ? null : prev))}
                  className={cn(
                    "group absolute -translate-y-1/2 text-left outline-none transition-opacity",
                    leftSide ? "-translate-x-full pr-3" : "translate-x-0 pl-3",
                    frozen ? "cursor-default" : "cursor-pointer"
                  )}
                  style={{
                    left: `${lx}%`,
                    top: `${ly}%`,
                    opacity: visible ? 1 : 0.25,
                  }}
                  aria-label={n.label}
                  title={n.label}
                >
                  <span
                    className={cn(
                      "block max-w-[168px] text-[12px] leading-[1.45] transition-colors",
                      n.active || hoveredNodeId === n.id ? "text-[#F2E6C0]" : "text-[#B8AE90]"
                    )}
                    style={{ textAlign: leftSide ? "right" : "left" }}
                  >
                    {n.label}
                  </span>
                  <span
                    className="mt-1 block text-[10.5px] tracking-wide text-[#6c6752]"
                    style={{ textAlign: leftSide ? "right" : "left" }}
                  >
                    {n.time !== "--:--" ? n.time : meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline + filters + zoom */}
      <div className="relative z-20 shrink-0 px-8 pb-5 pt-3">
        <TimelineBar
          times={sortedTimes}
          currentIndex={timeIndex}
          onChange={(idx) => setTimeIndex(idx)}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          nowLabel={nowLabel}
          disabled={frozen || sortedTimes.length === 0}
        />

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {KIND_META.map((k) => {
              const active = activeKinds.has(k.kind);
              return (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => toggleKind(k.kind)}
                  className={cn(
                    "flex items-center gap-2 text-[12px] transition-colors",
                    active ? "text-[#D8CCA8]" : "text-[#5a5645]"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-[9px] w-[9px] rounded-full"
                    style={{
                      background: k.filled ? k.color : "transparent",
                      border: k.filled ? "none" : `1.2px solid ${k.color}`,
                      opacity: active ? 1 : 0.35,
                    }}
                  />
                  <span>{k.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-1 py-1 text-[12px] text-[#B8AE90]">
            <button
              type="button"
              aria-label="缩小"
              className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-[#EFE6CE]"
              onClick={() => setZoom((z) => clamp(+(z - 0.1).toFixed(2), 0.5, 2))}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </button>
            <span className="min-w-[44px] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="放大"
              className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-[#EFE6CE]"
              onClick={() => setZoom((z) => clamp(+(z + 0.1).toFixed(2), 0.5, 2))}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                <line x1="6" y1="2.5" x2="6" y2="9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </button>
            <span className="mx-1 h-4 w-px bg-white/[0.08]" />
            <button
              type="button"
              aria-label={isFullscreen ? "退出全屏" : "全屏"}
              className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-[#EFE6CE]"
              onClick={toggleFullscreen}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
                <path d="M2 4.5 V2 H4.5" />
                <path d="M10 4.5 V2 H7.5" />
                <path d="M2 7.5 V10 H4.5" />
                <path d="M10 7.5 V10 H7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineBar({
  times,
  currentIndex,
  onChange,
  playing,
  onTogglePlay,
  nowLabel,
  disabled,
}: {
  times: Array<{ id: string; ms: number; label: string }>;
  currentIndex: number | null;
  onChange: (idx: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  nowLabel: string;
  disabled: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const count = times.length;
  const hasRange = count > 1;

  const handlePointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !hasRange) return;
      const rect = el.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      const idx = Math.round(pct * (count - 1));
      onChange(idx);
    },
    [hasRange, count, onChange]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointer(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.buttons !== 1) return;
    handlePointer(e.clientX);
  };

  const currentPct =
    hasRange && currentIndex !== null ? (currentIndex / (count - 1)) * 100 : 0;

  const tickIndexes = useMemo(() => {
    if (count === 0) return [] as number[];
    const maxTicks = 8;
    if (count <= maxTicks) return times.map((_, i) => i);
    const step = (count - 1) / (maxTicks - 1);
    return Array.from({ length: maxTicks }, (_, i) => Math.round(i * step));
  }, [count, times]);

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label={playing ? "暂停" : "播放"}
        onClick={onTogglePlay}
        disabled={disabled}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[#E8DFC8] transition-colors",
          disabled ? "opacity-40" : "hover:bg-white/[0.08]"
        )}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            <rect x="3" y="2.5" width="2" height="7" rx="0.5" />
            <rect x="7" y="2.5" width="2" height="7" rx="0.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            <path d="M3.5 2.5 L9.5 6 L3.5 9.5 Z" />
          </svg>
        )}
      </button>

      <div className="relative flex-1">
        <div
          ref={trackRef}
          role="slider"
          aria-label="时间轴"
          aria-valuemin={0}
          aria-valuemax={Math.max(count - 1, 0)}
          aria-valuenow={currentIndex ?? 0}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={(e) => {
            if (disabled || !hasRange) return;
            if (e.key === "ArrowLeft" && currentIndex !== null) onChange(Math.max(0, currentIndex - 1));
            if (e.key === "ArrowRight" && currentIndex !== null) onChange(Math.min(count - 1, currentIndex + 1));
          }}
          className={cn(
            "relative h-8 cursor-pointer select-none",
            disabled ? "cursor-default" : ""
          )}
        >
          {/* base line */}
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" />
          {/* filled */}
          <div
            className="pointer-events-none absolute left-0 top-1/2 h-px -translate-y-1/2"
            style={{
              width: `${currentPct}%`,
              background: "linear-gradient(90deg, rgba(232,200,130,0.1), rgba(248,228,170,0.55))",
            }}
          />
          {/* ticks */}
          {times.map((t, i) => {
            const pct = hasRange ? (i / (count - 1)) * 100 : 50;
            const passed = currentIndex !== null && i <= currentIndex;
            return (
              <span
                key={t.id}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${pct}%`,
                  background: passed ? "#E8C882" : "rgba(232,223,200,0.25)",
                }}
              />
            );
          })}
          {/* handle */}
          {hasRange && currentIndex !== null ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f4dca0] bg-[#f4dca0]"
              style={{
                left: `${currentPct}%`,
                boxShadow: "0 0 12px rgba(244,220,160,0.6)",
              }}
            />
          ) : null}
        </div>
        {/* tick labels */}
        <div className="mt-1 flex justify-between px-[2px] text-[10.5px] text-[#6b6651]">
          {tickIndexes.map((idx) => {
            const t = times[idx];
            if (!t) return null;
            const active = currentIndex !== null && Math.abs(idx - currentIndex) < 0.5;
            return (
              <span
                key={`label-${t.id}`}
                className={cn("tabular-nums", active ? "text-[#EFE6CE]" : "")}
              >
                {t.label}
              </span>
            );
          })}
        </div>
      </div>

      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[#B8AE90]"
        aria-hidden="true"
        title={nowLabel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <rect x="2.5" y="3" width="9" height="8.5" rx="1.2" />
          <line x1="2.5" y1="5.5" x2="11.5" y2="5.5" />
          <line x1="5" y1="2" x2="5" y2="4" />
          <line x1="9" y1="2" x2="9" y2="4" />
        </svg>
      </div>
    </div>
  );
}
