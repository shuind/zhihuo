"use client";

import { useMemo } from "react";

import type { ThinkingTrackView } from "@/components/thinking-layer";
import { cn } from "@/lib/utils";

type ConstellationCanvasProps = {
  tracks: ThinkingTrackView[];
  activeTrackId: string | null;
  rootQuestionText: string;
  frozen: boolean;
  onSelectNode: (trackId: string, nodeId: string) => void;
  className?: string;
};

type CanvasNode = {
  id: string;
  trackId: string;
  label: string;
  x: number;
  y: number;
  active: boolean;
  suggested: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nodeLabel(text: string) {
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}

export function ConstellationCanvas({
  tracks,
  activeTrackId,
  rootQuestionText,
  frozen,
  onSelectNode,
  className,
}: ConstellationCanvasProps) {
  const { nodes, links } = useMemo(() => {
    const visibleTracks = tracks.filter((track) => !track.isEmpty && track.nodes.length > 0);
    const trackCount = Math.max(visibleTracks.length, 1);
    const center = { x: 50, y: 50 };
    const canvasNodes: CanvasNode[] = [];
    const canvasLinks: Array<{ from: CanvasNode; to: CanvasNode; active: boolean }> = [];

    visibleTracks.forEach((track, trackIndex) => {
      const angle = -Math.PI / 2 + (trackIndex / trackCount) * Math.PI * 2;
      const active = track.id === activeTrackId;
      const orbitRadius = active ? 30 : 34;
      const baseX = center.x + Math.cos(angle) * orbitRadius;
      const baseY = center.y + Math.sin(angle) * orbitRadius * 0.72;
      const nodesForTrack = track.nodes.slice(0, 8);

      nodesForTrack.forEach((node, nodeIndex) => {
        const spread = (nodeIndex - (nodesForTrack.length - 1) / 2) * 5.6;
        const tangentX = Math.cos(angle + Math.PI / 2) * spread;
        const tangentY = Math.sin(angle + Math.PI / 2) * spread * 0.74;
        const depth = Math.min(nodeIndex, 5) * (active ? 1.9 : 1.35);
        const canvasNode: CanvasNode = {
          id: node.id,
          trackId: track.id,
          label: nodeLabel(node.questionText),
          x: clamp(baseX + tangentX + Math.cos(angle) * depth, 8, 92),
          y: clamp(baseY + tangentY + Math.sin(angle) * depth * 0.6, 10, 90),
          active,
          suggested: node.isSuggested,
        };

        if (nodeIndex > 0) {
          canvasLinks.push({
            from: canvasNodes[canvasNodes.length - 1],
            to: canvasNode,
            active,
          });
        }

        canvasNodes.push(canvasNode);
      });
    });

    return { nodes: canvasNodes, links: canvasLinks };
  }, [activeTrackId, tracks]);

  return (
    <div
      className={cn(
        "relative min-h-[420px] overflow-hidden rounded-[28px] border border-black/[0.06] bg-white/30 shadow-[0_22px_70px_rgba(17,24,39,0.08)] backdrop-blur-md",
        frozen ? "saturate-75" : "",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-6 z-10 flex items-center justify-between gap-5">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">
            Constellation
          </p>
          <h3 className="mt-1 line-clamp-1 text-[15px] font-medium text-slate-800">
            {rootQuestionText}
          </h3>
        </div>
        <div className="shrink-0 rounded-full border border-black/[0.06] bg-white/55 px-3 py-1 text-[11px] text-slate-500">
          {nodes.length} nodes
        </div>
      </div>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" role="img" aria-label="Thinking constellation">
        <defs>
          <radialGradient id="constellation-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.88)" />
            <stop offset="54%" stopColor="rgba(248,250,252,0.42)" />
            <stop offset="100%" stopColor="rgba(226,232,240,0.1)" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#constellation-glow)" />
        <circle cx="50" cy="50" r="2.7" fill="rgba(15,23,42,0.78)" />
        <circle cx="50" cy="50" r="8.5" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.35" />
        <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(15,23,42,0.05)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(15,23,42,0.045)" strokeWidth="0.22" />

        {links.map((link) => (
          <line
            key={`${link.from.id}-${link.to.id}`}
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            stroke={link.active ? "rgba(15,23,42,0.26)" : "rgba(100,116,139,0.18)"}
            strokeWidth={link.active ? 0.34 : 0.24}
            strokeLinecap="round"
          />
        ))}
        {nodes.map((node) => (
          <line
            key={`root-${node.id}`}
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke={node.active ? "rgba(15,23,42,0.1)" : "rgba(100,116,139,0.055)"}
            strokeWidth="0.18"
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div className="absolute inset-0">
        {nodes.length ? (
          nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              title={node.label}
              className={cn(
                "group absolute -translate-x-1/2 -translate-y-1/2 text-left outline-none",
                frozen ? "cursor-default" : "cursor-pointer"
              )}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onClick={() => onSelectNode(node.trackId, node.id)}
            >
              <span
                className={cn(
                  "block rounded-full border shadow-sm transition-transform group-hover:scale-110 group-focus-visible:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-slate-500/30",
                  node.active
                    ? "h-4 w-4 border-slate-900/20 bg-slate-900"
                    : "h-3 w-3 border-white/85 bg-slate-500/70",
                  node.suggested ? "ring-4 ring-amber-200/55" : ""
                )}
              />
              <span
                className={cn(
                  "pointer-events-none absolute left-1/2 top-5 hidden w-max max-w-[180px] -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/86 px-2.5 py-1 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm group-hover:block group-focus-visible:block",
                  node.active ? "font-medium" : ""
                )}
              >
                {node.label}
              </span>
            </button>
          ))
        ) : (
          <div className="grid h-full place-items-center px-8 text-center text-sm text-slate-500">
            No nodes yet.
          </div>
        )}
      </div>
    </div>
  );
}
