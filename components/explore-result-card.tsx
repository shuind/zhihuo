"use client";

import { ConstitutionSafeText } from "@/components/constitution-safe-text";
import { formatDateTime } from "@/lib/store";
import { ExploreResult } from "@/lib/types";

interface ExploreResultCardProps {
  result: ExploreResult;
  onSave?: () => void;
}

export function ExploreResultCard({ result, onSave }: ExploreResultCardProps) {
  return (
    <article className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-starlight-white">本次强并置</p>
        <p className="text-xs text-slate-400">置信度 {Math.round(result.confidence * 100)}%</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {result.selectedDoubts.map((doubt) => (
          <div key={doubt.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-sm text-slate-100">{doubt.rawText}</p>
            <p className="mt-2 text-[11px] text-slate-500">{formatDateTime(doubt.createdAt)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        {result.questionPrompt ? (
          <ConstitutionSafeText
            scene="explore_prompt"
            text={result.questionPrompt}
            fallback="这次只保留并置，不附加问句。"
            className="text-sm text-slate-200"
          />
        ) : (
          <p className="text-sm text-slate-400">这次只保留并置，不附加问句。</p>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onSave}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
        >
          保存为标记
        </button>
      </div>
    </article>
  );
}
