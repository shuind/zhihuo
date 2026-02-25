"use client";

import { ConstitutionSafeText } from "@/components/constitution-safe-text";
import { DoubtCluster } from "@/lib/types";

interface ConstellationTooltipProps {
  cluster: DoubtCluster | null;
}

export function ConstellationTooltip({ cluster }: ConstellationTooltipProps) {
  if (!cluster) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
        悬停一个星座，查看它当前的疑惑重心。
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="text-sm font-medium text-starlight-white">{cluster.title}</p>
      <ConstitutionSafeText
        scene="life_auto"
        text={cluster.summary}
        className="text-sm text-slate-300"
      />
      <p className="text-xs text-slate-400">核心未定：{cluster.unresolvedCoreQuestion}</p>
    </div>
  );
}
