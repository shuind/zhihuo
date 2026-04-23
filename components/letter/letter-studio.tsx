"use client";

import { useMemo, useRef, useState } from "react";
import { LetterPaper, VARIANT_META, type PaperVariant } from "./letter-paper";
import { poetize } from "@/lib/letter-poetize";
import { describeSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { cn } from "@/lib/utils";

const SAMPLE = {
  doubt: "为什么我总是在夜里想明白白天的事？",
  nodes: [
    "白天的我在回应世界，夜里的我才在回应自己。",
    "安静不是答案，但它让答案有地方落下来。",
    "或许困住我的从来不是问题，而是必须立刻回答的那种压力。",
    "夜晚像一种缓慢的透光。"
  ].join("\n"),
  closing: "不着急结论。"
};

const VARIANT_ORDER: PaperVariant[] = ["plain", "rice", "clay", "tide", "ink", "vellum"];

export function LetterStudio() {
  const [variant, setVariant] = useState<PaperVariant>("plain");
  const [doubt, setDoubt] = useState(SAMPLE.doubt);
  const [nodes, setNodes] = useState(SAMPLE.nodes);
  const [closing, setClosing] = useState(SAMPLE.closing);
  const [author, setAuthor] = useState("shuind");
  const [exporting, setExporting] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);
  const dateLabel = `${now.getFullYear()} / ${now.getMonth() + 1} / ${now.getDate()}`;
  const solarTermLabel = describeSolarTerm(now);
  const moon = getMoonPhase(now);

  const poetized = useMemo(() => {
    const list = nodes.split(/\n/).map((s) => s.trim()).filter(Boolean);
    return poetize({ doubt, nodes: list, closing: closing || undefined });
  }, [doubt, nodes, closing]);

  async function handleExport() {
    if (!paperRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(paperRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "transparent"
      });
      const link = document.createElement("a");
      link.download = `zhihuo-jian-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[v0] export failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#e9e4d7] text-[#3d3427]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[1fr_460px]">
        <section className="flex flex-col gap-6">
          <header className="flex items-baseline justify-between gap-4">
            <h1
              className="text-2xl text-[#2a241a]"
              style={{ fontFamily: "var(--font-time-serif), serif" }}
            >
              笺
            </h1>
            <span className="text-[11px] tracking-[0.25em] text-[#8a7b5e]">
              {solarTermLabel} · {dateLabel}
            </span>
          </header>

          <Field label="疑问 / 念头">
            <textarea
              value={doubt}
              onChange={(e) => setDoubt(e.target.value)}
              rows={2}
              className="w-full resize-none border-0 border-b border-[#bfb39a] bg-transparent py-2 text-[15px] leading-relaxed text-[#2a241a] outline-none focus:border-[#8a7b5e]"
            />
          </Field>

          <Field label="思考节点">
            <textarea
              value={nodes}
              onChange={(e) => setNodes(e.target.value)}
              rows={6}
              className="w-full resize-none border border-[#c8bca3] bg-[#f1ebd9]/60 p-3 text-[14px] leading-relaxed text-[#3d3427] outline-none focus:border-[#8a7b5e]"
            />
          </Field>

          <Field label="落笔一句">
            <input
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              className="w-full border-0 border-b border-[#bfb39a] bg-transparent py-2 text-[14px] text-[#2a241a] outline-none focus:border-[#8a7b5e]"
            />
          </Field>

          <Field label="署名">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-40 border-0 border-b border-[#bfb39a] bg-transparent py-2 text-[14px] text-[#2a241a] outline-none focus:border-[#8a7b5e]"
            />
          </Field>

          <div>
            <div className="mb-2 text-[11px] tracking-[0.2em] text-[#8a7b5e]">质感</div>
            <div className="grid grid-cols-3 gap-2">
              {VARIANT_ORDER.map((key) => {
                const meta = VARIANT_META[key];
                const active = variant === key;
                return (
                  <button
                    key={key}
                    onClick={() => setVariant(key)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-sm border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-[#3d3427] bg-[#3d3427] text-[#f1ebd9]"
                        : "border-[#c8bca3] bg-transparent text-[#3d3427] hover:border-[#8a7b5e]"
                    )}
                  >
                    <span className="text-[13px] leading-none">{meta.label}</span>
                    <span
                      className={cn(
                        "text-[10px] leading-none",
                        active ? "text-[#d4c9a8]" : "text-[#8a7b5e]"
                      )}
                    >
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-sm border border-[#3d3427] bg-[#3d3427] px-5 py-2.5 text-[13px] tracking-[0.15em] text-[#f1ebd9] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {exporting ? "正在落墨" : "导出笺纸"}
            </button>
            <span className="text-[11px] text-[#8a7b5e]">PNG · 3x</span>
          </div>
        </section>

        <section className="flex items-start justify-center">
          <div className="w-full max-w-[460px]">
            <div
              className="relative"
              style={{ filter: getShadow(variant) }}
            >
              <LetterPaper
                ref={paperRef}
                variant={variant}
                title={poetized.title}
                lines={poetized.lines}
                dateLabel={dateLabel}
                solarTermLabel={solarTermLabel}
                moon={moon}
                authorName={author}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function getShadow(v: PaperVariant) {
  switch (v) {
    case "vellum": return "drop-shadow(0 24px 48px rgba(50,30,10,0.25))";
    case "ink": return "drop-shadow(0 24px 48px rgba(10,15,25,0.35))";
    case "tide": return "drop-shadow(0 24px 48px rgba(10,30,40,0.3))";
    case "clay": return "drop-shadow(0 22px 42px rgba(80,30,20,0.28))";
    case "rice": return "drop-shadow(0 18px 36px rgba(60,50,40,0.18))";
    default: return "drop-shadow(0 18px 36px rgba(90,74,50,0.18))";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-[0.2em] text-[#8a7b5e]">{label}</span>
      {children}
    </label>
  );
}
