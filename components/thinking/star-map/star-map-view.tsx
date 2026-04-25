"use client";

import { useEffect, useMemo, useState } from "react";

import type { ThinkingTrackView } from "@/components/thinking-layer";
import { cn } from "@/lib/utils";

import { StarMapCanvas } from "./star-map-canvas";
import { computeStarMapLayout } from "./star-map-layout";
import { ThoughtDetailPanel } from "./thought-detail-panel";

type Mode = "tracks" | "starmap";

export type StarMapViewProps = {
  rootQuestionText: string;
  tracks: ThinkingTrackView[];
  activeTrackId: string | null;
  frozen: boolean;
  /** 顶部 tab 当前激活的视图 */
  mode: Mode;
  /** 切换 tab。"tracks" 时调用方负责切回线性思路视图 */
  onModeChange: (mode: Mode) => void;
  /** 点击外围星团时，把对应思路设为主轨 */
  onSelectTrack: (trackId: string) => void;
  /** 在思路视图中查看某节点（关闭星图、回到线性视图、滚动定位） */
  onJumpToTrackNode: (trackId: string, nodeId: string) => void;
  /** 详情面板里继续从某节点展开思路 */
  onSubmitFromNode?: (
    trackId: string,
    nodeId: string,
    rawInput: string
  ) => Promise<void>;
  composerEnabled: boolean;
  className?: string;
};

export function StarMapView({
  rootQuestionText,
  tracks,
  activeTrackId,
  frozen,
  mode,
  onModeChange,
  onSelectTrack,
  onJumpToTrackNode,
  onSubmitFromNode,
  composerEnabled,
  className,
}: StarMapViewProps) {
  // 用一个独立的 layout 算 mainOrbit/nodes（用于详情面板和选中态），
  // 但 canvas 内部会自己根据真实尺寸再算一遍。这一份只用作"列表层数据"。
  const orbitData = useMemo(() => {
    const dryLayout = computeStarMapLayout({
      width: 1000,
      height: 700,
      rootQuestionText,
      tracks,
      activeTrackId,
    });
    return dryLayout.mainOrbit;
  }, [tracks, activeTrackId, rootQuestionText]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 切换主轨或没有节点时，清掉选中
  useEffect(() => {
    if (!orbitData) {
      setSelectedNodeId(null);
      return;
    }
    if (
      selectedNodeId &&
      !orbitData.nodes.some((n) => n.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [orbitData, selectedNodeId]);

  const selectedNode =
    (selectedNodeId && orbitData?.nodes.find((n) => n.id === selectedNodeId)) ||
    null;

  const showDetail = selectedNode !== null;

  return (
    <div
      className={cn(
        "relative flex h-full w-full overflow-hidden rounded-[20px]",
        className
      )}
      style={{ backgroundColor: "#0a0a0c" }}
    >
      {/* 主区：画布 */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* 顶部 tabs */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center px-6 pt-5">
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-full px-1 py-1"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(237,230,212,0.08)",
            }}
          >
            <ModeButton
              active={mode === "tracks"}
              onClick={() => onModeChange("tracks")}
              label="思路"
            />
            <ModeButton
              active={mode === "starmap"}
              onClick={() => onModeChange("starmap")}
              label="星图"
            />
          </div>
        </div>

        {/* 画布 */}
        <StarMapCanvas
          input={{ rootQuestionText, tracks, activeTrackId }}
          selectedNodeId={selectedNodeId}
          onSelectMainNode={(id) => setSelectedNodeId(id)}
          onSelectCluster={(trackId) => {
            setSelectedNodeId(null);
            onSelectTrack(trackId);
          }}
        />

        {/* 冻结提示（写入时间后） */}
        {frozen ? (
          <div
            className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px]"
            style={{
              color: "rgba(237,230,212,0.55)",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(237,230,212,0.08)",
            }}
          >
            已写入时间 · 仅供回看
          </div>
        ) : null}
      </div>

      {/* 详情面板（动态宽度，避免布局跳变） */}
      <div
        className="relative flex shrink-0 overflow-hidden transition-[width] duration-300 ease-out"
        style={{ width: showDetail ? 340 : 0 }}
      >
        <ThoughtDetailPanel
          selectedNode={selectedNode}
          mainOrbit={orbitData}
          onClose={() => setSelectedNodeId(null)}
          onSelectMainNode={(id) => setSelectedNodeId(id)}
          onJumpToTrackNode={(trackId, nodeId) => {
            setSelectedNodeId(null);
            onJumpToTrackNode(trackId, nodeId);
          }}
          onSubmitFromNode={
            composerEnabled && !frozen ? onSubmitFromNode : undefined
          }
          composerEnabled={composerEnabled && !frozen}
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1 text-[12.5px] transition-colors",
        active
          ? "text-[#F5E8C2]"
          : "text-[rgba(237,230,212,0.5)] hover:text-[rgba(237,230,212,0.8)]"
      )}
      style={
        active
          ? {
              backgroundColor: "rgba(245,232,194,0.1)",
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}
