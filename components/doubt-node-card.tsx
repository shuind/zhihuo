"use client";

import { formatDateTime } from "@/lib/store";
import { Doubt, DoubtCluster } from "@/lib/types";

interface DoubtNodeCardProps {
  doubt: Doubt;
  cluster?: DoubtCluster;
  compact?: boolean;
}

export function DoubtNodeCard({ doubt, cluster, compact = false }: DoubtNodeCardProps) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-glow transition hover:border-white/20">
      <p className={compact ? "text-sm text-slate-100" : "text-base text-slate-100"}>
        {doubt.rawText}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{formatDateTime(doubt.createdAt)}</span>
        {cluster ? <span>· {cluster.title}</span> : null}
        <span>· 原样存档</span>
      </div>
    </article>
  );
}
