"use client";

import { useMemo, useState } from "react";

import { DoubtNodeCard } from "@/components/doubt-node-card";
import { EvolutionTimeline } from "@/components/evolution-timeline";
import { emptyStateCopy } from "@/lib/mock-data";
import { useZhihuoStore } from "@/lib/store";

export default function TimelinePage() {
  const doubts = useZhihuoStore((state) => state.doubts);
  const clusters = useZhihuoStore((state) => state.clusters);

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null);

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          doubts
            .map((doubt) => new Date(doubt.createdAt).getFullYear().toString())
            .sort((left, right) => Number(right) - Number(left))
        )
      ),
    [doubts]
  );

  const filtered = useMemo(
    () =>
      doubts.filter((doubt) => {
        if (selectedYear !== "all" && new Date(doubt.createdAt).getFullYear().toString() !== selectedYear) {
          return false;
        }

        if (selectedClusterId && doubt.clusterId !== selectedClusterId) {
          return false;
        }

        return true;
      }),
    [doubts, selectedClusterId, selectedYear]
  );

  const selectedDoubt = filtered.find((doubt) => doubt.id === selectedDoubtId) ?? filtered.at(-1) ?? null;

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs tracking-[0.2em] text-slate-400">REVIEW</p>
        <h1 className="text-2xl font-semibold text-starlight-white">回看</h1>
        <p className="text-sm text-slate-400">看见一段时间里，你如何提问。</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedYear("all")}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            selectedYear === "all"
              ? "border-starlight-blue bg-sky-400/10 text-sky-200"
              : "border-white/10 text-slate-300"
          }`}
        >
          全部
        </button>
        {years.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setSelectedYear(year)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              selectedYear === year
                ? "border-starlight-blue bg-sky-400/10 text-sky-200"
                : "border-white/10 text-slate-300"
            }`}
          >
            {year}
          </button>
        ))}

        <select
          value={selectedClusterId ?? ""}
          onChange={(event) => setSelectedClusterId(event.target.value || null)}
          className="rounded-md border border-white/10 bg-night-900 px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">全部主题</option>
          {clusters
            .filter((cluster) => cluster.id !== "chaos-zone")
            .map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.title}
              </option>
            ))}
        </select>
      </div>

      {filtered.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <EvolutionTimeline
            doubts={filtered}
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onSelectDoubt={setSelectedDoubtId}
          />

          <aside className="space-y-3">
            <h2 className="text-sm font-medium text-slate-200">当前节点</h2>
            {selectedDoubt ? (
              <DoubtNodeCard
                doubt={selectedDoubt}
                cluster={clusters.find((cluster) => cluster.id === selectedDoubt.clusterId)}
              />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                点击时间轴节点，查看原样疑惑。
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          {emptyStateCopy.timeline}
        </div>
      )}
    </section>
  );
}
