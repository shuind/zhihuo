"use client";

import { formatMonthLabel } from "@/lib/store";
import { Doubt, DoubtCluster } from "@/lib/types";

interface EvolutionTimelineProps {
  doubts: Doubt[];
  clusters: DoubtCluster[];
  selectedClusterId?: string | null;
  onSelectDoubt?: (doubtId: string) => void;
}

function getPositionPercent(
  current: number,
  minTimestamp: number,
  maxTimestamp: number
): number {
  if (maxTimestamp <= minTimestamp) {
    return 0;
  }

  return ((current - minTimestamp) / (maxTimestamp - minTimestamp)) * 100;
}

export function EvolutionTimeline({
  doubts,
  clusters,
  selectedClusterId,
  onSelectDoubt
}: EvolutionTimelineProps) {
  const filtered = selectedClusterId
    ? doubts.filter((doubt) => doubt.clusterId === selectedClusterId)
    : doubts;

  if (!filtered.length) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
        这条时间线上还没有疑惑节点。
      </section>
    );
  }

  const sorted = [...filtered].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );

  const minTimestamp = new Date(sorted[0].createdAt).getTime();
  const maxTimestamp = new Date(sorted[sorted.length - 1].createdAt).getTime();

  const months = new Set<string>();
  sorted.forEach((doubt) => months.add(formatMonthLabel(doubt.createdAt)));

  const tracks = clusters
    .filter((cluster) =>
      selectedClusterId ? cluster.id === selectedClusterId : cluster.id !== "chaos-zone"
    )
    .map((cluster) => ({
      cluster,
      doubts: sorted.filter((doubt) => doubt.clusterId === cluster.id)
    }))
    .filter((track) => track.doubts.length > 0);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-night-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-starlight-white">回看时间轴</h2>
        <p className="text-xs text-slate-400">按时间看，不做结论</p>
      </div>

      <div className="scroll-soft overflow-x-auto pb-2">
        <div className="min-w-[850px]">
          <div className="mb-3 flex justify-between text-[11px] text-slate-500">
            {[...months].map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>

          <div className="space-y-3">
            {tracks.map((track) => (
              <div
                key={track.cluster.id}
                className="rounded-xl border border-white/5 bg-black/20 px-3 py-2"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-200">{track.cluster.title}</p>
                  <p className="text-[11px] text-slate-500">{track.doubts.length} 条节点</p>
                </div>

                <div className="relative h-14 rounded-lg bg-night-950/70">
                  {track.doubts.map((doubt, index) => {
                    const timestamp = new Date(doubt.createdAt).getTime();
                    const left = getPositionPercent(timestamp, minTimestamp, maxTimestamp);
                    const recencyOpacity = 0.35 + doubt.recency * 0.65;

                    return (
                      <button
                        key={doubt.id}
                        type="button"
                        onClick={() => onSelectDoubt?.(doubt.id)}
                        title={doubt.rawText}
                        style={{ left: `calc(${left}% - 7px)`, opacity: recencyOpacity }}
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-white/30 bg-starlight-blue transition hover:scale-110"
                      />
                    );
                  })}

                  {track.doubts.map((doubt, index) => {
                    const next = track.doubts[index + 1];
                    if (!next) {
                      return null;
                    }

                    const start = getPositionPercent(
                      new Date(doubt.createdAt).getTime(),
                      minTimestamp,
                      maxTimestamp
                    );
                    const end = getPositionPercent(
                      new Date(next.createdAt).getTime(),
                      minTimestamp,
                      maxTimestamp
                    );

                    return (
                      <div
                        key={`${doubt.id}-${next.id}`}
                        style={{
                          left: `calc(${start}% + 1px)`,
                          width: `calc(${Math.max(end - start, 0)}% - 2px)`
                        }}
                        className="absolute top-1/2 h-[1px] -translate-y-1/2 bg-slate-500/50"
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
