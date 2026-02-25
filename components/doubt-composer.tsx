"use client";

import { FormEvent, useMemo, useState } from "react";

import { useZhihuoStore } from "@/lib/store";

type InputMode = "chaos" | "note";

export function DoubtComposer() {
  const [rawText, setRawText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mode, setMode] = useState<InputMode>("chaos");
  const addDoubt = useZhihuoStore((state) => state.addDoubt);

  const canSubmit = useMemo(() => rawText.trim().length > 0, [rawText]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = rawText.trim();
    if (!trimmed) {
      return;
    }

    addDoubt({ rawText: trimmed, layer: "life" });
    setRawText("");
    setFeedback("我先替你记住它。");
    window.setTimeout(() => setFeedback(null), 2200);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <textarea
        id="doubt-input"
        value={rawText}
        onChange={(event) => setRawText(event.target.value)}
        rows={7}
        placeholder="此刻，你在想什么……"
        className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-starlight-blue focus:outline-none"
      />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("chaos")}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                mode === "chaos"
                  ? "bg-sky-400/12 text-sky-200"
                  : "bg-transparent text-slate-300 hover:bg-white/5"
              }`}
            >
              我很乱
            </button>
            <button
              type="button"
              onClick={() => setMode("note")}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                mode === "note"
                  ? "bg-sky-400/12 text-sky-200"
                  : "bg-transparent text-slate-300 hover:bg-white/5"
              }`}
            >
              只是记下
            </button>
          </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
            canSubmit
              ? "bg-sky-400/14 text-starlight-blue hover:bg-sky-400/20"
              : "cursor-not-allowed bg-transparent text-slate-600"
          }`}
        >
          种下
        </button>
      </div>

      {feedback ? <p className="mt-3 text-sm text-starlight-white">{feedback}</p> : null}
    </form>
  );
}
