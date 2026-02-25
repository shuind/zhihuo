"use client";

import { useZhihuoStore } from "@/lib/store";
import { SmartSettings } from "@/lib/types";

const toggleRows: Array<{
  key: keyof SmartSettings;
  title: string;
  desc: string;
}> = [
  {
    key: "enableExploreMode",
    title: "探索模式",
    desc: "仅在你主动触发时返回一次强并置。"
  },
  {
    key: "enableMeteorHints",
    title: "并置提示",
    desc: "在星空中展示低频流星并置提醒。"
  },
  {
    key: "enableLearningAutoSort",
    title: "学习层自动归位",
    desc: "将学习层疑惑自动分配到主题桶。"
  },
  {
    key: "enableSemanticDerivation",
    title: "语义派生",
    desc: "允许生成向量与派生结构（可关闭）。"
  }
];

export function SmartFeatureToggles() {
  const settings = useZhihuoStore((state) => state.settings);
  const toggleSetting = useZhihuoStore((state) => state.toggleSetting);

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {toggleRows.map((row) => {
        const enabled = settings[row.key];
        return (
          <div key={row.key} className="flex items-center justify-between rounded-lg border border-white/5 p-3">
            <div>
              <p className="text-sm font-medium text-slate-100">{row.title}</p>
              <p className="text-xs text-slate-400">{row.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSetting(row.key)}
              aria-pressed={enabled}
              className={`relative h-6 w-11 rounded-full transition ${
                enabled ? "bg-starlight-blue" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-night-950 transition ${
                  enabled ? "left-[1.45rem]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        );
      })}
    </section>
  );
}
