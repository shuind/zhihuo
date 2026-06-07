"use client";

import type { ThinkingScratchItem, ThinkingSpace } from "@/components/zhihuo-model";

export function ScratchDrawer(props: {
  open: boolean;
  items: ThinkingScratchItem[];
  spaces: ThinkingSpace[];
  onClose: () => void;
  onOpenSpace: (spaceId: string) => void;
  onTurnScratchIntoSpace: (scratchId: string) => void;
  onFeedScratchToTime: (scratchId: string) => Promise<boolean>;
  onDeleteScratch: (scratchId: string) => Promise<boolean>;
  showNotice: (message: string) => void;
  formatRelativeTime: (createdAt?: string) => string;
}) {
  if (!props.open) return null;
  return (
    <div className="absolute inset-0 z-40 bg-black/15 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label="关闭随记列表"
        className="absolute inset-0"
        onClick={props.onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-black/[0.08] bg-[#faf7f2] px-6 pb-6 pt-5 shadow-[0_-18px_40px_rgba(43,38,33,0.12)]">
        <div className="mx-auto w-full max-w-[920px]">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-black/[0.08]" />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[15px] text-slate-800">随记</p>
            <span className="text-[11px] text-slate-400">{props.items.length} 条</span>
          </div>
          <div className="mt-4 max-h-[62vh] overflow-y-auto pr-1">
            <div className="space-y-3 pb-1">
              {props.items.map((item) => {
                const linkedSpace = item.derivedSpaceId
                  ? props.spaces.find((space) => space.id === item.derivedSpaceId) ?? null
                  : null;
                return (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-black/[0.05] bg-white/34 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-[1.7] text-slate-800 [overflow-wrap:anywhere]">{item.rawText}</p>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{props.formatRelativeTime(item.updatedAt)}</span>
                          {linkedSpace ? <span>已进入思路</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {linkedSpace ? (
                          <button
                            type="button"
                            className="rounded-full border border-black/[0.06] bg-white/72 px-3 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white hover:text-slate-800"
                            onClick={() => {
                              props.onClose();
                              props.onOpenSpace(linkedSpace.id);
                            }}
                          >
                            进入
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-full border border-black/[0.06] bg-white/72 px-3 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white hover:text-slate-800"
                            onClick={() => props.onTurnScratchIntoSpace(item.id)}
                          >
                            转为空间
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-700"
                          onClick={() =>
                            void (async () => {
                              const ok = await props.onFeedScratchToTime(item.id);
                              if (!ok) {
                                props.showNotice("放入时间失败，请稍后再试");
                                return;
                              }
                              props.showNotice("已放入时间层");
                            })()
                          }
                        >
                          放入时间
                        </button>
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-700"
                          onClick={() =>
                            void (async () => {
                              const ok = await props.onDeleteScratch(item.id);
                              if (!ok) props.showNotice("随记删除失败，请稍后再试");
                            })()
                          }
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
