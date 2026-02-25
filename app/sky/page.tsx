"use client";

import { useMemo, useState } from "react";

import { ConstellationTooltip } from "@/components/constellation-tooltip";
import { DoubtClusterPanel } from "@/components/doubt-cluster-panel";
import { StarForestScene3D } from "@/components/star-forest-scene-3d";
import { emptyStateCopy } from "@/lib/mock-data";
import { useZhihuoStore } from "@/lib/store";

export default function SkyPage() {
  const doubts = useZhihuoStore((state) => state.doubts);
  const clusters = useZhihuoStore((state) => state.clusters);
  const links = useZhihuoStore((state) => state.candidateLinks);
  const settings = useZhihuoStore((state) => state.settings);
  const selectedClusterId = useZhihuoStore((state) => state.selectedClusterId);
  const selectCluster = useZhihuoStore((state) => state.selectCluster);

  const [showLinks, setShowLinks] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);
  const [longTermOnly, setLongTermOnly] = useState(false);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

  const visibleClusters = useMemo(
    () =>
      clusters.filter((cluster) => {
        if (cluster.id === "chaos-zone") {
          return false;
        }

        if (activeOnly && cluster.activeScore < 0.75) {
          return false;
        }

        if (longTermOnly && cluster.longTermScore < 0.8) {
          return false;
        }

        return true;
      }),
    [activeOnly, clusters, longTermOnly]
  );

  const focusedClusterId = hoveredClusterId ?? selectedClusterId;
  const focusedCluster = clusters.find((cluster) => cluster.id === focusedClusterId) ?? null;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-400">CLUSTER</p>
          <h1 className="text-2xl font-semibold text-starlight-white">聚集</h1>
          <p className="text-sm text-slate-400">疑惑会自然靠近，慢慢形成星群。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveOnly((value) => !value)}
            className={`rounded-md border px-2.5 py-1.5 ${
              activeOnly
                ? "border-starlight-blue bg-sky-400/10 text-sky-200"
                : "border-white/10 text-slate-300"
            }`}
          >
            活跃
          </button>
          <button
            type="button"
            onClick={() => setLongTermOnly((value) => !value)}
            className={`rounded-md border px-2.5 py-1.5 ${
              longTermOnly
                ? "border-starlight-violet bg-violet-400/10 text-violet-200"
                : "border-white/10 text-slate-300"
            }`}
          >
            长期
          </button>
          <button
            type="button"
            onClick={() => setShowLinks((value) => !value)}
            className={`rounded-md border px-2.5 py-1.5 ${
              showLinks ? "border-white/20 bg-white/10 text-slate-200" : "border-white/10 text-slate-300"
            }`}
          >
            连线
          </button>
        </div>
      </header>

      {visibleClusters.length ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <StarForestScene3D
            clusters={visibleClusters}
            doubts={doubts}
            links={settings.enableMeteorHints ? links : []}
            showLinks={showLinks}
            selectedClusterId={selectedClusterId}
            onHoverCluster={setHoveredClusterId}
            onSelectCluster={selectCluster}
          />

          <div className="space-y-3">
            <ConstellationTooltip cluster={focusedCluster} />
            <DoubtClusterPanel cluster={focusedCluster} doubts={doubts} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          {emptyStateCopy.sky}
        </div>
      )}
    </section>
  );
}
