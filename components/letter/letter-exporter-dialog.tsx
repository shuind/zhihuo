"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LetterPaper, VARIANT_META, type PaperVariant } from "./letter-paper";
import { poetize } from "@/lib/letter-poetize";
import { describeSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { cn } from "@/lib/utils";

export type LetterExporterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 疑问/念头的原文 */
  doubtText: string;
  /** 思考节点（按顺序） */
  nodes: string[];
  /** 写回时间留下的那一句（可选） */
  closingNote?: string;
  /** 写入时刻（缺省用 now） */
  writtenAt?: Date;
  /** 是否冻结的思路（来自 space 的 frozen_at 判断） */
  frozen?: boolean;
  /** 署名 */
  authorName?: string;
};

const VARIANT_ORDER: PaperVariant[] = ["plain", "rice", "clay", "tide", "ink", "vellum"];

/** 按写入时境推荐质感：冻结→羊皮金；深夜→夜墨；凌晨→潮汐；其余按节气落回素/宣/陶 */
export function suggestVariant(writtenAt: Date, frozen = false): PaperVariant {
  if (frozen) return "vellum";
  const h = writtenAt.getHours();
  if (h >= 22 || h < 2) return "ink";
  if (h >= 2 && h < 6) return "tide";
  const m = writtenAt.getMonth();
  if (m >= 2 && m <= 4) return "rice";
  if (m >= 8 && m <= 10) return "clay";
  return "plain";
}

export function LetterExporterDialog({
  open,
  onOpenChange,
  doubtText,
  nodes,
  closingNote,
  writtenAt,
  frozen = false,
  authorName = "shuind"
}: LetterExporterDialogProps) {
  const when = writtenAt ?? new Date();
  const [variant, setVariant] = useState<PaperVariant>(() => suggestVariant(when, frozen));
  const [ornamentSealText, setOrnamentSealText] = useState("知");
  const [exporting, setExporting] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setVariant(suggestVariant(when, frozen));
      setOrnamentSealText("知");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  const dateLabel = `${when.getFullYear()} / ${when.getMonth() + 1} / ${when.getDate()}`;
  const solarTermLabel = describeSolarTerm(when);
  const moon = getMoonPhase(when);
  const hasOrnamentSeal = variant === "rice" || variant === "clay";

  const poetized = useMemo(
    () => poetize({ doubt: doubtText, nodes, closing: closingNote }),
    [doubtText, nodes, closingNote]
  );

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
      link.download = `zhihuo-jian-${when.getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[v0] export failed", err);
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      <div className="relative z-10 flex max-h-[92vh] w-[min(960px,94vw)] flex-col overflow-hidden rounded-sm bg-[#efe9d8] shadow-2xl md:flex-row">
        {/* 预览 */}
        <div className="flex flex-1 items-center justify-center bg-[#e1dbc8] p-8">
          <div
            className="w-full max-w-[360px]"
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
              authorName={authorName}
              ornamentSealText={ornamentSealText}
            />
          </div>
        </div>

        {/* 控制 */}
        <aside className="flex w-full shrink-0 flex-col gap-5 border-t border-[#c8bca3] bg-[#efe9d8] p-6 md:w-[300px] md:border-l md:border-t-0">
          <header className="flex items-baseline justify-between">
            <span
              className="text-lg text-[#2a241a]"
              style={{ fontFamily: "var(--font-time-serif), serif" }}
            >
              落成一张笺
            </span>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="text-[11px] tracking-[0.2em] text-[#8a7b5e] hover:text-[#3d3427]"
            >
              关闭
            </button>
          </header>

          <div className="text-[11px] leading-relaxed tracking-[0.15em] text-[#6b5e48]">
            {solarTermLabel} · {dateLabel}
          </div>

          <div>
            <div className="mb-2 text-[11px] tracking-[0.2em] text-[#8a7b5e]">质感</div>
            <div className="grid grid-cols-2 gap-1.5">
              {VARIANT_ORDER.map((key) => {
                const meta = VARIANT_META[key];
                const active = variant === key;
                return (
                  <button
                    key={key}
                    onClick={() => setVariant(key)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-sm border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-[#3d3427] bg-[#3d3427] text-[#f1ebd9]"
                        : "border-[#c8bca3] bg-transparent text-[#3d3427] hover:border-[#8a7b5e]"
                    )}
                  >
                    <span className="text-[12px] leading-none">{meta.label}</span>
                    <span
                      className={cn(
                        "text-[9px] leading-none",
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

          {hasOrnamentSeal ? (
            <div>
              <label className="mb-2 block text-[11px] tracking-[0.2em] text-[#8a7b5e]" htmlFor="export-letter-seal-text">
                印文
              </label>
              <input
                id="export-letter-seal-text"
                value={ornamentSealText}
                maxLength={4}
                onChange={(event) => setOrnamentSealText(sanitizeSealInput(event.target.value))}
                className="h-10 w-24 rounded-sm border border-[#c8bca3] bg-transparent px-3 text-center text-[16px] text-[#2a241a] outline-none focus:border-[#8a7b5e]"
              />
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-sm border border-[#3d3427] bg-[#3d3427] px-4 py-2.5 text-[12px] tracking-[0.2em] text-[#f1ebd9] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {exporting ? "正在落墨" : "导出笺纸 PNG"}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm border border-[#c8bca3] bg-transparent px-4 py-2 text-[11px] tracking-[0.2em] text-[#6b5e48] hover:border-[#8a7b5e]"
            >
              之后再说
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function sanitizeSealInput(value: string) {
  return Array.from(value.replace(/\s+/g, "")).slice(0, 4).join("");
}

function getShadow(v: PaperVariant) {
  switch (v) {
    case "vellum": return "drop-shadow(0 24px 48px rgba(50,30,10,0.35))";
    case "ink": return "drop-shadow(0 24px 48px rgba(10,15,25,0.45))";
    case "tide": return "drop-shadow(0 24px 48px rgba(10,30,40,0.4))";
    case "clay": return "drop-shadow(0 22px 42px rgba(80,30,20,0.35))";
    case "rice": return "drop-shadow(0 18px 36px rgba(60,50,40,0.22))";
    default: return "drop-shadow(0 18px 36px rgba(90,74,50,0.22))";
  }
}
