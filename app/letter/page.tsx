"use client";

import { useState } from "react";
import { LetterStudio } from "@/components/letter/letter-studio";
import { LetterExporterDialog } from "@/components/letter/letter-exporter-dialog";

export default function LetterPage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LetterStudio />
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        <span className="rounded-sm bg-[#3d3427]/85 px-3 py-1 text-[10px] tracking-[0.2em] text-[#f1ebd9]">
          接入主流程预览
        </span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-sm border border-[#3d3427] bg-[#efe9d8] px-4 py-2 text-[12px] tracking-[0.2em] text-[#2a241a] shadow-md hover:bg-[#e1dbc8]"
        >
          模拟 · 写回时间后弹出
        </button>
      </div>
      <LetterExporterDialog
        open={open}
        onOpenChange={setOpen}
        doubtText="为什么我总是在夜里想明白白天的事？"
        nodes={[
          "白天的我在回应世界，夜里的我才在回应自己。",
          "安静不是答案，但它让答案有地方落下来。",
          "或许困住我的从来不是问题，而是必须立刻回答的那种压力。",
          "夜晚像一种缓慢的透光。"
        ]}
        closingNote="不着急结论。"
        writtenAt={new Date()}
        frozen={false}
      />
    </>
  );
}
