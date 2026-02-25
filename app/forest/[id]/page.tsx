"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";

import { DoubtNodeCard } from "@/components/doubt-node-card";
import { formatDateTime } from "@/lib/store";
import { useZhihuoStore } from "@/lib/store";

export default function ForestDetailPage() {
  const params = useParams<{ id: string }>();
  const clusterId = params?.id;

  const doubts = useZhihuoStore((state) => state.doubts);
  const clusters = useZhihuoStore((state) => state.clusters);
  const links = useZhihuoStore((state) => state.candidateLinks);

  const cluster = clusters.find((item) => item.id === clusterId);
  const clusterDoubts = useMemo(
    () =>
      doubts
        .filter((doubt) => doubt.clusterId === clusterId)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [clusterId, doubts]
  );

  const relationLinks = links
    .filter((link) => !link.suppressed)
    .filter((link) => {
      const source = clusterDoubts.find((doubt) => doubt.id === link.aDoubtId);
      const target = clusterDoubts.find((doubt) => doubt.id === link.bDoubtId);
      return source && target;
    })
    .slice(0, 20);

  if (!cluster) {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-400">没有找到这片森林分支。</p>
        <Link href="/sky" className="text-sm text-starlight-blue">
          返回星空总览
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-slate-400">FOREST</p>
        <h1 className="text-2xl font-semibold text-starlight-white">{cluster.title}</h1>
        <p className="text-sm text-slate-400">{cluster.summary}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-slate-200">簇概览</p>
          <p className="text-xs text-slate-400">领域：{cluster.domain}</p>
          <p className="text-xs text-slate-400">活跃度：{Math.round(cluster.activeScore * 100)}%</p>
          <p className="text-xs text-slate-400">长期性：{Math.round(cluster.longTermScore * 100)}%</p>
          <p className="rounded-md bg-black/20 p-2 text-xs text-slate-300">
            核心未定问题：{cluster.unresolvedCoreQuestion}
          </p>
          <Link
            href="/timeline"
            className="inline-flex rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/5"
          >
            跳转时间轴
          </Link>
        </aside>

        <section className="rounded-2xl border border-white/10 bg-night-900/70 p-4">
          <p className="text-sm font-medium text-slate-200">关系流（只显示连接，不命名关系）</p>
          <div className="scroll-soft mt-4 overflow-x-auto pb-2">
            <div className="min-w-[720px]">
              <div className="relative h-44 rounded-xl border border-white/5 bg-black/20">
                {clusterDoubts.map((doubt, index) => {
                  const left = (index / Math.max(clusterDoubts.length - 1, 1)) * 100;
                  return (
                    <div
                      key={doubt.id}
                      style={{ left: `calc(${left}% - 6px)` }}
                      className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/25 bg-starlight-blue"
                    />
                  );
                })}

                {clusterDoubts.map((doubt, index) => {
                  const next = clusterDoubts[index + 1];
                  if (!next) {
                    return null;
                  }

                  const start = (index / Math.max(clusterDoubts.length - 1, 1)) * 100;
                  const end = ((index + 1) / Math.max(clusterDoubts.length - 1, 1)) * 100;

                  return (
                    <div
                      key={`${doubt.id}-${next.id}`}
                      style={{ left: `${start}%`, width: `${Math.max(end - start, 0)}%` }}
                      className="absolute top-1/2 h-[1px] -translate-y-1/2 bg-slate-500/50"
                    />
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                {clusterDoubts.slice(-4).map((doubt) => (
                  <p key={doubt.id} className="rounded-md bg-black/20 px-2 py-1">
                    {formatDateTime(doubt.createdAt)}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">内部连接数：{relationLinks.length}</p>
        </section>

        <aside className="space-y-3">
          <p className="text-sm font-medium text-slate-200">原文时间流</p>
          <div className="scroll-soft max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {clusterDoubts.map((doubt) => (
              <DoubtNodeCard key={doubt.id} doubt={doubt} compact />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
