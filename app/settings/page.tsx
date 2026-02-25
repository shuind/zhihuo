"use client";

import { SmartFeatureToggles } from "@/components/smart-feature-toggles";
import { useZhihuoStore } from "@/lib/store";

const constitutionRows = [
  "原始疑惑不可改写（raw_text immutable）",
  "人生层只并置不解释，不输出心理断言",
  "学习层只梳理不讲课，不默认给答案",
  "探索模式必须主动触发，结果可为空",
  "所有智能能力都可随时关闭"
];

export default function SettingsPage() {
  const bookmarks = useZhihuoStore((state) => state.bookmarks);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-slate-400">SETTINGS</p>
        <h1 className="text-2xl font-semibold text-starlight-white">系统开关与宪法边界</h1>
        <p className="text-sm text-slate-400">关闭全部智能后，知惑仍可作为纯时间流记录使用。</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SmartFeatureToggles />

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-slate-100">知惑系统宪法（前端可见版）</p>
          <div className="mt-3 space-y-2">
            {constitutionRows.map((row) => (
              <p key={row} className="rounded-md bg-black/20 px-3 py-2 text-xs text-slate-300">
                {row}
              </p>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-medium text-slate-100">已保存的探索标记</p>
        {bookmarks.length ? (
          <div className="mt-3 space-y-2">
            {bookmarks.slice(0, 5).map((bookmark, index) => (
              <p key={`${bookmark.confidence}-${index}`} className="rounded-md bg-black/20 px-3 py-2 text-xs text-slate-300">
                {bookmark.questionPrompt ?? "这次只保留并置，不附加问句。"}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">还没有保存的探索标记。</p>
        )}
      </section>
    </section>
  );
}
