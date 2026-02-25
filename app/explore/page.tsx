"use client";

import { useMemo, useState } from "react";

import { ExploreResultCard } from "@/components/explore-result-card";
import { emptyStateCopy } from "@/lib/mock-data";
import { useZhihuoStore } from "@/lib/store";
import { Doubt, ExploreResult } from "@/lib/types";

function buildPrompt(textA: string, textB: string): string {
  const shortA = textA.slice(0, 14).replace(/[？?]/g, "");
  const shortB = textB.slice(0, 14).replace(/[？?]/g, "");
  return `把「${shortA}」和「${shortB}」并看时，你最想守住什么？`;
}

export default function ExplorePage() {
  const doubts = useZhihuoStore((state) => state.doubts);
  const links = useZhihuoStore((state) => state.candidateLinks);
  const settings = useZhihuoStore((state) => state.settings);
  const saveBookmark = useZhihuoStore((state) => state.saveBookmark);

  const [result, setResult] = useState<ExploreResult | null>(null);
  const [hasTried, setHasTried] = useState(false);

  const doubtMap = useMemo(() => new Map(doubts.map((doubt) => [doubt.id, doubt])), [doubts]);

  function runExplore() {
    setHasTried(true);
    const strongest = links
      .filter((link) => !link.suppressed)
      .sort((left, right) => right.score - left.score)[0];

    if (!strongest || strongest.score < 0.62) {
      setResult(null);
      return;
    }

    const first = doubtMap.get(strongest.aDoubtId);
    const second = doubtMap.get(strongest.bDoubtId);
    if (!first || !second) {
      setResult(null);
      return;
    }

    const maybeThird = links
      .filter((link) => !link.suppressed && link.id !== strongest.id)
      .find((link) => link.aDoubtId === strongest.aDoubtId || link.bDoubtId === strongest.bDoubtId);

    const third =
      (maybeThird ? doubtMap.get(maybeThird.aDoubtId) ?? doubtMap.get(maybeThird.bDoubtId) : null) ?? null;

    const selectedDoubts = [first, second, third]
      .filter((item): item is Doubt => Boolean(item))
      .slice(0, 3);
    const questionPrompt = buildPrompt(first.rawText, second.rawText);

    setResult({
      selectedDoubts,
      questionPrompt,
      confidence: strongest.score
    });
  }

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs tracking-[0.2em] text-slate-400">EXPLORE</p>
        <h1 className="text-2xl font-semibold text-starlight-white">探索模式（主动触发）</h1>
        <p className="text-sm text-slate-400">
          一次只返回一组强并置，保留你的解释权，不给结论。
        </p>
      </header>

      {!settings.enableExploreMode ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
          探索模式已关闭，可在设置页重新开启。
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={runExplore}
            className="rounded-lg bg-starlight-violet px-4 py-2 text-sm font-medium text-night-950 hover:bg-violet-300"
          >
            探索这段时间
          </button>

          {result ? (
            <ExploreResultCard result={result} onSave={() => saveBookmark(result)} />
          ) : hasTried ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
              {emptyStateCopy.explore}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
              点击按钮后系统才会进行一次强连接筛选。
            </div>
          )}
        </>
      )}
    </section>
  );
}
