"use client";

import { useMemo, useRef, useState } from "react";
import { LetterPaper, type PaperVariant } from "./letter-paper";
import { poetize } from "@/lib/letter-poetize";
import { describeSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { cn } from "@/lib/utils";

const SAMPLE = {
  doubt: "为什么我总是在夜里想明白白天的事？",
  nodes: [
    "白天的我在回应世界，夜里的我才在回应自己。",
    "安静不是答案，但它让答案有地方落下来。",
    "或许困住我的从来不是问题，而是必须立刻回答的那种压力。",
    "所以夜晚像一种缓慢的透光"
  ].join("\n"),
  closing: "不着急结论。"
};

const VARIANTS: Array<{ key: PaperVariant; label: string; hint: string }> = [
  { key: "plain", label: "素笺", hint: "米色虚线 · 白日疑问" },
  { key: "vellum", label: "羊皮金", hint: "深褐金字 · 冻结的思路" },
  { key: "ink", label: "夜墨", hint: "深灰银蓝 · 夜里写的" }
];

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
    const nodeList = nodes
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return poetize({ doubt, nodes: nodeList, closing: closing || undefined });
  }, [doubt, nodes, closing]);

  async function handleExport() {
    if (!paperRef.current) return;
    setExporting(true);
    try {
      // 动态 import，避免 SSR
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(paperRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "transparent"
      });
      const link = document.createElement("a");
      link.download = `zhihuo-笺-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[v0] export failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="h-screen w-full overflow-auto bg-[#e9e4d7] text-[#3d3427]">
      <div className="mx-auto grid min-h-full max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[1fr_460px]">
        {/* 左：输入区 */}
        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="font-serif text-2xl text-[#2a241a]" style={{ fontFamily: "var(--font-time-serif), serif" }}>
              笺 · 把一条疑问凝成一张纸
            </h1>
            <p className="text-[13px] leading-relaxed text-[#6b5e48]">
              一次性的诗化导出。不强制、不打卡。想分享时再做。
            </p>
          </header>

          <Field label="疑问 / 念头">
            <textarea
              value={doubt}
              onChange={(e) => setDoubt(e.target.value)}
              rows={2}
              className="w-full resize-none border-0 border-b border-[#bfb39a] bg-transparent py-2 text-[15px] leading-relaxed text-[#2a241a] outline-none focus:border-[#8a7b5e]"
              placeholder="你在问自己什么？"
            />
          </Field>

          <Field label="思考节点" hint="每行一句，Studio 会自动挑出信息密度较高的几句">
            <textarea
              value={nodes}
              onChange={(e) => setNodes(e.target.value)}
              rows={6}
              className="w-full resize-none border border-[#c8bca3] bg-[#f1ebd9]/60 p-3 text-[14px] leading-relaxed text-[#3d3427] outline-none focus:border-[#8a7b5e]"
            />
          </Field>

          <Field label="落笔一句（可选）" hint="写回时间时留下的那一句">
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
            <div className="flex flex-wrap gap-2">
              {VARIANTS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setVariant(v.key)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-sm border px-3 py-2 text-left transition-colors",
                    variant === v.key
                      ? "border-[#3d3427] bg-[#3d3427] text-[#f1ebd9]"
                      : "border-[#c8bca3] bg-transparent text-[#3d3427] hover:border-[#8a7b5e]"
                  )}
                >
                  <span className="text-[13px] leading-none">{v.label}</span>
                  <span
                    className={cn(
                      "text-[10px] leading-none",
                      variant === v.key ? "text-[#d4c9a8]" : "text-[#8a7b5e]"
                    )}
                  >
                    {v.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-sm border border-[#3d3427] bg-[#3d3427] px-5 py-2.5 text-[13px] tracking-[0.15em] text-[#f1ebd9] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {exporting ? "正在落墨…" : "导出笺纸"}
            </button>
            <span className="text-[11px] text-[#8a7b5e]">输出为 PNG · 3 倍像素 · 适合分享</span>
          </div>
        </section>

        {/* 右：预览 */}
        <section className="flex items-start justify-center">
          <div className="w-full max-w-[460px]">
            <div className="mb-3 flex items-center justify-between text-[11px] tracking-[0.2em] text-[#8a7b5e]">
              <span>预览 · {VARIANTS.find((v) => v.key === variant)?.label}</span>
              <span>3 : 4</span>
            </div>
            <div
              className="relative"
              style={{
                filter:
                  variant === "vellum"
                    ? "drop-shadow(0 24px 48px rgba(50,30,10,0.25))"
                    : variant === "ink"
                      ? "drop-shadow(0 24px 48px rgba(10,15,25,0.35))"
                      : "drop-shadow(0 18px 36px rgba(90,74,50,0.18))"
              }}
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

            <div className="mt-4 rounded-sm border border-[#c8bca3]/60 bg-[#f1ebd9]/40 p-3 text-[11px] leading-relaxed text-[#6b5e48]">
              <p className="mb-1 font-medium tracking-[0.15em] text-[#3d3427]">设计意图</p>
              <p>
                正文非 AI 原句引用，而是由"诗化凝练"算法从你的节点中挑出密度最高的几行。
                题图的节气与月相由当前日期自动对应。小动物仅在此处出现一次——沉默的在场。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] tracking-[0.2em] text-[#8a7b5e]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#a59a80]">{hint}</span>}
    </label>
  );
}
