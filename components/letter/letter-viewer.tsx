"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LetterPaper, type PaperVariant, VARIANT_META } from "./letter-paper";
import { describeSolarTerm, getCurrentSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { poetize } from "@/lib/letter-poetize";
import { suggestVariant } from "./letter-exporter-dialog";

export type LetterViewerProps = {
  open: boolean;
  doubtText: string;
  lines: string[];
  writtenAt: Date;
  frozen?: boolean;
  authorName?: string;
  onClose: () => void;
};

export function LetterViewer({
  open,
  doubtText,
  lines,
  writtenAt,
  frozen = true,
  authorName,
  onClose
}: LetterViewerProps) {
  const [variant, setVariant] = useState<PaperVariant>(() => suggestVariant(writtenAt, frozen));
  const paperRef = useRef<HTMLDivElement>(null);

  const dateLabel = `${writtenAt.getFullYear()} / ${writtenAt.getMonth() + 1} / ${writtenAt.getDate()}`;
  const solarTermLabel = describeSolarTerm(writtenAt);
  const solarTermName = getCurrentSolarTerm(writtenAt).name;
  const moon = getMoonPhase(writtenAt);
  const fallback = poetize({ doubt: doubtText, nodes: lines });
  const title = fallback.title || doubtText;
  const bodyLines = lines.length ? lines : fallback.lines;

  const handleSave = async () => {
    if (!paperRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(paperRef.current, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: "transparent"
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `zhihuo-jian-${writtenAt.getTime()}.png`;
    a.click();
  };

  const VARIANTS: { key: PaperVariant; label: string }[] = Object.entries(VARIANT_META).map(
    ([key, meta]) => ({ key: key as PaperVariant, label: meta.label })
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/75 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative flex flex-col items-center gap-4"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[min(calc(100vw-2rem),440px)]">
              <LetterPaper
                ref={paperRef}
                variant={variant}
                title={title}
                lines={bodyLines}
                dateLabel={dateLabel}
                solarTermLabel={solarTermLabel}
                moon={moon}
                authorName={authorName ?? "shuind"}
                sealVisible={frozen}
                sealDateLabel={dateLabel}
                sealSolarTerm={solarTermName}
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {VARIANTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVariant(v.key)}
                  className={
                    "rounded-full border px-3 py-1 text-[12px] transition-colors " +
                    (variant === v.key
                      ? "border-white/70 bg-white/15 text-white"
                      : "border-white/20 text-white/60 hover:border-white/50 hover:text-white/90")
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-full border border-white/25 px-5 py-2 text-[13px] text-white/90 hover:bg-white/10"
              >
                保存这张笺
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-white/90 px-5 py-2 text-[13px] text-black hover:bg-white"
              >
                合上
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
