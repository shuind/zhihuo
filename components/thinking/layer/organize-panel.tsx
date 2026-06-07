"use client";

import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OrganizeScope = "current" | "all";

export type OrganizeNodeEntry = {
  nodeId: string;
  questionText: string;
  fromTrackId: string;
  fromTrackTitle: string;
  createdAt?: string;
  fallbackOrder: number;
};

export type OrganizeTargetTrack = {
  id: string;
  title: string;
};

export function OrganizePanel(props: {
  open: boolean;
  activeTrackId: string | null;
  scope: OrganizeScope;
  onScopeChange: (scope: OrganizeScope) => void;
  currentCount: number;
  allCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  visibleNodes: OrganizeNodeEntry[];
  selectedSet: Set<string>;
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  allVisibleSelected: boolean;
  targetTrackId: string;
  onTargetTrackIdChange: (trackId: string) => void;
  targetTracks: OrganizeTargetTrack[];
  isApplying: boolean;
  onClose: () => void;
  onApply: () => void;
  formatRelativeTime: (createdAt?: string) => string;
}) {
  if (!props.open) return null;
  return (
    <div data-organize-panel="true" className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="w-[860px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-black/12 bg-white p-4 shadow-[0_20px_48px_rgba(15,23,42,0.22)] sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-slate-800">整理一下</p>
            <p className="mt-1 text-xs text-slate-500">选择���容并移动到目标思路线</p>
          </div>
          <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={props.onClose}>
            关闭
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-black/8 bg-[#f8f6f2] px-3 py-2">
          <div className="flex items-center gap-1 text-xs">
            {[
              { value: "current" as OrganizeScope, label: "当前线", count: props.currentCount, disabled: !props.activeTrackId },
              { value: "all" as OrganizeScope, label: "全部", count: props.allCount, disabled: false }
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={item.disabled}
                className={cn(
                  "rounded-full border px-2.5 py-1 transition-colors",
                  props.scope === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-black/12 bg-white text-slate-600 hover:text-slate-800",
                  item.disabled ? "cursor-not-allowed opacity-45 hover:text-slate-600" : ""
                )}
                onClick={() => props.onScopeChange(item.value)}
              >
                {item.label} {item.count}
              </button>
            ))}
          </div>
          <input
            value={props.query}
            placeholder="搜索内容或来源思路线"
            className="h-8 min-w-0 flex-1 rounded-full border border-black/12 bg-white px-3 text-xs text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          <button
            type="button"
            className="rounded-full border border-black/12 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:text-slate-800"
            onClick={() =>
              props.setSelectedNodeIds((prev) => {
                const visibleIds = props.visibleNodes.map((node) => node.nodeId);
                const visibleSet = new Set(visibleIds);
                if (props.allVisibleSelected) {
                  return prev.filter((id) => !visibleSet.has(id));
                }
                const nextSet = new Set(prev);
                for (const id of visibleIds) nextSet.add(id);
                return [...nextSet];
              })
            }
          >
            {props.allVisibleSelected ? "取消全选" : "全选当前结果"}
          </button>
        </div>
        <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {props.visibleNodes.length ? (
            props.visibleNodes.map((node) => (
              <label
                key={node.nodeId}
                className={cn(
                  "block rounded-xl border px-3 py-2 transition-colors",
                  props.selectedSet.has(node.nodeId) ? "border-slate-900/35 bg-slate-50" : "border-black/10 bg-[#fcfaf6] hover:border-black/15"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={props.selectedSet.has(node.nodeId)}
                    onChange={(event) =>
                      props.setSelectedNodeIds((prev) => {
                        if (event.target.checked) {
                          if (prev.includes(node.nodeId)) return prev;
                          return [...prev, node.nodeId];
                        }
                        return prev.filter((id) => id !== node.nodeId);
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-[1.55] text-slate-700 [overflow-wrap:anywhere]">
                      {node.questionText || `节点 ${node.nodeId.slice(0, 8)}`}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      来自：{node.fromTrackTitle || "未命名思路线"}
                      {node.createdAt ? ` · ${props.formatRelativeTime(node.createdAt)}` : ""}
                    </p>
                  </div>
                </div>
              </label>
            ))
          ) : (
            <p className="rounded-xl border border-black/8 bg-[#fcfaf6] px-3 py-6 text-center text-sm text-slate-500">
              当前范围没有待整理内容
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">已选 {props.selectedNodeIds.length} 条</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-slate-600">移动到</span>
            <select
              value={props.targetTrackId}
              className="h-8 max-w-[220px] rounded-full border border-black/12 bg-white px-3 text-xs text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              onChange={(event) => props.onTargetTrackIdChange(event.target.value)}
            >
              {props.targetTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title.slice(0, 24)}
                </option>
              ))}
              <option value="__new__">创建新方向</option>
            </select>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-black/12 text-slate-700"
              onClick={props.onClose}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              data-organize-apply="true"
              className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800 disabled:opacity-50"
              disabled={!props.selectedNodeIds.length || props.isApplying}
              onClick={props.onApply}
            >
              {props.isApplying ? "移动中..." : "移动"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
