"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { computeStarMapLayout, formatClock } from "./star-map-layout";
import type { StarMapInput, StarMapLayout } from "./star-map-types";

type Props = {
  input: Omit<StarMapInput, "width" | "height">;
  selectedNodeId: string | null;
  onSelectMainNode: (nodeId: string) => void;
  onSelectCluster: (trackId: string) => void;
  className?: string;
};

const TRUNCATE_MAIN = 14; // 主轨标签每行字数
const TRUNCATE_MAIN_LINES = 2;
const TRUNCATE_CLUSTER_TITLE = 10;

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out: string[] = [];
  for (let i = 0; i < t.length; i += perLine) {
    if (out.length >= maxLines) {
      // 最后一行加省略号
      const last = out[maxLines - 1];
      if (last.length > perLine - 1) {
        out[maxLines - 1] = last.slice(0, perLine - 1) + "…";
      } else {
        out[maxLines - 1] = last + "…";
      }
      break;
    }
    out.push(t.slice(i, i + perLine));
  }
  return out;
}

export function StarMapCanvas({
  input,
  selectedNodeId,
  onSelectMainNode,
  onSelectCluster,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout: StarMapLayout | null = useMemo(() => {
    if (size.w < 200 || size.h < 200) return null;
    return computeStarMapLayout({ ...input, width: size.w, height: size.h });
  }, [input, size.w, size.h]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ backgroundColor: "#0a0a0c" }}
    >
      {/* 极淡的星尘底纹（CSS 渐变模拟，不放任何主元素） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(40,38,32,0.55) 0%, rgba(10,10,12,0) 70%)",
        }}
      />

      {layout ? (
        <>
          {/* SVG 几何层 */}
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="pointer-events-none absolute inset-0"
          >
            <defs>
              <radialGradient id="starmap-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245,232,194,0.42)" />
                <stop offset="35%" stopColor="rgba(235,220,180,0.18)" />
                <stop offset="70%" stopColor="rgba(235,220,180,0.06)" />
                <stop offset="100%" stopColor="rgba(235,220,180,0)" />
              </radialGradient>
              <radialGradient id="starmap-core-inner" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,243,210,0.55)" />
                <stop offset="60%" stopColor="rgba(245,232,194,0.10)" />
                <stop offset="100%" stopColor="rgba(245,232,194,0)" />
              </radialGradient>
              <filter id="starmap-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <filter id="starmap-soft" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.2" />
              </filter>
            </defs>

            {/* 中心问题场（多层叠加，无硬边） */}
            <circle
              cx={layout.centerX}
              cy={layout.centerY}
              r={layout.centerR * 2.2}
              fill="url(#starmap-core)"
            />
            <circle
              cx={layout.centerX}
              cy={layout.centerY}
              r={layout.centerR * 0.9}
              fill="url(#starmap-core-inner)"
            />

            {/* 外围星团：连线 */}
            {layout.clusters.map((cluster) => (
              <g key={`cluster-lines-${cluster.trackId}`}>
                {cluster.links.map((link, i) => {
                  const a = cluster.stars[link.fromIndex];
                  const b = cluster.stars[link.toIndex];
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`cl-${cluster.trackId}-${i}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="rgba(235,220,180,0.10)"
                      strokeWidth={0.6}
                    />
                  );
                })}
              </g>
            ))}

            {/* 外围星团：星点 */}
            {layout.clusters.map((cluster) => (
              <g key={`cluster-stars-${cluster.trackId}`}>
                {cluster.stars.map((s) => (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r={s.size}
                    fill="rgba(237,230,212,1)"
                    opacity={s.alpha}
                  />
                ))}
              </g>
            ))}

            {/* 主轨曲线 */}
            {layout.mainOrbit ? (
              <path
                d={layout.mainOrbit.pathD}
                fill="none"
                stroke="rgba(235,220,180,0.45)"
                strokeWidth={1.1}
                strokeLinecap="round"
              />
            ) : null}

            {/* 主轨节点 */}
            {layout.mainOrbit?.nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <g key={`mn-${node.id}`}>
                  {isSelected ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={11}
                      fill="rgba(245,232,194,0.22)"
                      filter="url(#starmap-glow)"
                    />
                  ) : null}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 4.2 : 2.6}
                    fill="#EDE6D4"
                    opacity={isSelected ? 1 : Math.max(0.55, node.brightness)}
                    filter={isSelected ? undefined : "url(#starmap-soft)"}
                  />
                </g>
              );
            })}
          </svg>

          {/* HTML 文本 / 命中层 */}
          <div className="pointer-events-none absolute inset-0">
            {/* 中心标题 */}
            <div
              className="absolute select-none text-center"
              style={{
                left: layout.centerX,
                top: layout.centerY,
                transform: "translate(-50%, -50%)",
                width: layout.centerR * 2.4,
                color: "rgba(237,230,212,0.92)",
                fontSize: "15px",
                lineHeight: 1.6,
                letterSpacing: "0.02em",
                textShadow:
                  "0 0 22px rgba(245,232,194,0.35), 0 0 6px rgba(245,232,194,0.25)",
              }}
            >
              {layout.rootQuestionText}
            </div>

            {/* 主轨节点：标签 + 命中区 */}
            {layout.mainOrbit?.nodes.map((node, idx) => {
              const isSelected = node.id === selectedNodeId;
              // 标签放在节点的"远离中心"一侧
              const dx = node.x - layout.centerX;
              const dy = node.y - layout.centerY;
              const labelOnLeft = dx < 0;
              const labelOnTop = dy < 0;
              const offsetX = 14;
              const offsetY = -2;
              const lines = wrap(
                node.questionText,
                TRUNCATE_MAIN,
                TRUNCATE_MAIN_LINES
              );
              const time = formatClock(node.createdAt);

              return (
                <div key={`ml-${node.id}`}>
                  {/* 命中区（圆形点击范围） */}
                  <button
                    type="button"
                    onClick={() => onSelectMainNode(node.id)}
                    aria-label={node.questionText}
                    className="pointer-events-auto absolute rounded-full"
                    style={{
                      left: node.x - 18,
                      top: node.y - 18,
                      width: 36,
                      height: 36,
                    }}
                  />
                  {/* 文本标签 */}
                  <div
                    className="pointer-events-none absolute select-none"
                    style={{
                      left: node.x,
                      top: node.y,
                      transform: `translate(${
                        labelOnLeft ? "calc(-100% - 14px)" : `${offsetX}px`
                      }, ${labelOnTop ? "calc(-100% - 6px)" : `${offsetY}px`})`,
                      maxWidth: 190,
                      textAlign: labelOnLeft ? "right" : "left",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(237,230,212,0.55)",
                        letterSpacing: "0.06em",
                        marginBottom: 2,
                      }}
                    >
                      {time}
                    </div>
                    {lines.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.55,
                          color: isSelected
                            ? "rgba(245,232,194,1)"
                            : "rgba(237,230,212,0.9)",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* 外围星团：标签 + 命中区 */}
            {layout.clusters.map((cluster) => {
              const titleLines = wrap(
                cluster.titleQuestionText,
                TRUNCATE_CLUSTER_TITLE,
                2
              );
              const meta = `${cluster.nodeCount} 条想法${
                cluster.relativeTimeText ? ` · ${cluster.relativeTimeText}` : ""
              }`;
              return (
                <div key={`cl-${cluster.trackId}`}>
                  {/* 命中区（覆盖整个星团区域） */}
                  <button
                    type="button"
                    onClick={() => onSelectCluster(cluster.trackId)}
                    aria-label={cluster.titleQuestionText}
                    className="pointer-events-auto absolute rounded-full transition-colors hover:bg-white/[0.02]"
                    style={{
                      left: cluster.cx - cluster.radius - 6,
                      top: cluster.cy - cluster.radius - 6,
                      width: (cluster.radius + 6) * 2,
                      height: (cluster.radius + 6) * 2,
                    }}
                  />
                  {/* 标签 */}
                  <div
                    className="pointer-events-none absolute select-none"
                    style={{
                      left: cluster.labelX,
                      top: cluster.labelY,
                      transform: `translate(${
                        cluster.labelAnchor === "left"
                          ? "0"
                          : "calc(-100% - 0px)"
                      }, -50%)`,
                      maxWidth: 180,
                      textAlign:
                        cluster.labelAnchor === "left" ? "left" : "right",
                    }}
                  >
                    {titleLines.map((line, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          color: "rgba(237,230,212,0.7)",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {line}
                      </div>
                    ))}
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        color: "rgba(237,230,212,0.35)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {meta}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
