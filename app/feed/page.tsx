"use client";

import { useEffect, useState } from "react";

import { DoubtComposer } from "@/components/doubt-composer";
import { DoubtNodeCard } from "@/components/doubt-node-card";
import { emptyStateCopy } from "@/lib/mock-data";
import { useZhihuoStore } from "@/lib/store";

const heroLines = ["此刻疑惑，交给夜空", "梳理问题，拨开迷雾"];

export default function FeedPage() {
  const doubts = useZhihuoStore((state) => state.doubts);
  const clusters = useZhihuoStore((state) => state.clusters);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    let fadeTimer: number | null = null;

    const intervalTimer = window.setInterval(() => {
      setHeroVisible(false);
      fadeTimer = window.setTimeout(() => {
        setHeroIndex((previous) => (previous + 1) % heroLines.length);
        setHeroVisible(true);
      }, 500);
    }, 6500);

    return () => {
      window.clearInterval(intervalTimer);
      if (fadeTimer) {
        window.clearTimeout(fadeTimer);
      }
    };
  }, []);

  const latest = [...doubts]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8);

  return (
    <section className="space-y-7">
      <header className="space-y-2 pt-6 text-center">
        <h1 className="text-4xl font-semibold tracking-wide text-starlight-white">知惑</h1>
        <p
          className={`text-2xl text-slate-300 transition-all duration-700 ease-in-out ${
            heroVisible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
        >
          {heroLines[heroIndex]}
        </p>
      </header>

      <div className="mx-auto w-full max-w-3xl">
        <DoubtComposer />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-200">最近投喂</h2>
          <p className="text-xs text-slate-500">原文保留</p>
        </div>
        {latest.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {latest.map((doubt) => (
              <DoubtNodeCard
                key={doubt.id}
                doubt={doubt}
                compact
                cluster={clusters.find((cluster) => cluster.id === doubt.clusterId)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            {emptyStateCopy.feed}
          </div>
        )}
      </section>
    </section>
  );
}
