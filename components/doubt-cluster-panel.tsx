"use client";

import Link from "next/link";

import { Doubt, DoubtCluster } from "@/lib/types";

interface DoubtClusterPanelProps {
  cluster: DoubtCluster | null;
  doubts: Doubt[];
}

export function DoubtClusterPanel({ cluster, doubts }: DoubtClusterPanelProps) {
  if (!cluster) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
        点击或悬停星座，查看这片疑惑林地的状态。
      </section>
    );
  }

  const latest = doubts
    .filter((doubt) => doubt.clusterId === cluster.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-starlight-white">{cluster.title}</h3>
        <Link
          href={`/forest/${cluster.id}`}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
        >
          进入森林
        </Link>
      </div>
      <p className="text-xs text-slate-400">{cluster.domain}</p>
      <p className="text-xs text-slate-300">最近活跃疑惑</p>
      <div className="space-y-2">
        {latest.map((doubt) => (
          <p key={doubt.id} className="rounded-md bg-black/20 px-2 py-1.5 text-xs text-slate-300">
            {doubt.rawText}
          </p>
        ))}
      </div>
    </section>
  );
}
