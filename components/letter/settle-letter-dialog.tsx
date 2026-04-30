"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LetterPaper, type PaperVariant } from "./letter-paper";
import { describeSolarTerm, getCurrentSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { poetize } from "@/lib/letter-poetize";
import { suggestVariant } from "./letter-exporter-dialog";
import { saveLetterSealText, saveLetterVariant } from "@/lib/letter-variant-store";
import { cn } from "@/lib/utils";

type Phase = "preview" | "sealing" | "sealed";

export type SettleLetterSnapshot = {
  title: string | null;
  lines: string[];
  variant: PaperVariant;
  sealText: string | null;
};

export type SettleLetterDialogProps = {
  open: boolean;
  doubtId?: string | null;
  doubtText: string;
  nodes: string[];
  closingNote?: string;
  writtenAt: Date;
  onConfirm: (snapshot: SettleLetterSnapshot) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
  authorName?: string;
};

export function SettleLetterDialog({
  open,
  doubtId,
  doubtText,
  nodes,
  closingNote,
  writtenAt,
  onConfirm,
  onClose,
  authorName
}: SettleLetterDialogProps) {
  const [phase, setPhase] = useState<Phase>("preview");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<PaperVariant>(() => suggestVariant(writtenAt, false));
  const [ornamentSealText, setOrnamentSealText] = useState("知");
  const [paperTitle, setPaperTitle] = useState("");
  const [paperLines, setPaperLines] = useState<string[]>([]);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setPhase("preview");
      setBusy(false);
      setErrMsg(null);
      setVariant(suggestVariant(writtenAt, false));
      setOrnamentSealText("知");
    }
  }, [open, writtenAt]);

  const dateLabel = `${writtenAt.getFullYear()} / ${writtenAt.getMonth() + 1} / ${writtenAt.getDate()}`;
  const solarTermLabel = describeSolarTerm(writtenAt);
  const solarTermName = getCurrentSolarTerm(writtenAt).name;
  const moon = getMoonPhase(writtenAt);
  const poetized = useMemo(
    () => poetize({ doubt: doubtText, nodes, closing: closingNote }),
    [doubtText, nodes, closingNote]
  );
  const fullLines = useMemo(() => nodes.map((node) => node.trim()).filter(Boolean), [nodes]);
  const useLongPaper = fullLines.length > 4 || fullLines.some((line) => line.length > 36);
  const defaultPaperTitle = poetized.title || doubtText;
  const defaultPaperLines = useMemo(
    () => (useLongPaper ? fullLines : poetized.lines),
    [fullLines, poetized.lines, useLongPaper]
  );
  const hasOrnamentSeal = variant === "rice" || variant === "clay";

  useEffect(() => {
    if (!open) return;
    setPaperTitle(defaultPaperTitle);
    setPaperLines(defaultPaperLines);
  }, [open, defaultPaperTitle, defaultPaperLines]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setErrMsg(null);
    setPhase("sealing");
    const res = await onConfirm({
      title: (paperTitle || defaultPaperTitle).trim() || null,
      lines: paperLines.map((line) => line.trim()).filter(Boolean),
      variant,
      sealText: ornamentSealText.trim() || null
    });
    setBusy(false);
    if (!res.ok) {
      setPhase("preview");
      setErrMsg(res.message ?? "写入失败，请稍后再试");
      return;
    }
    saveLetterVariant(doubtId, variant);
    saveLetterSealText(doubtId, ornamentSealText);
    setTimeout(() => setPhase("sealed"), 720);
  };

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

  const VARIANTS: { key: PaperVariant; label: string }[] = [
    { key: "plain", label: "素笺" },
    { key: "rice", label: "宣纸" },
    { key: "clay", label: "陶土" },
    { key: "tide", label: "潮汐" },
    { key: "ink", label: "夜墨" },
    { key: "vellum", label: "羊皮金" }
  ];

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="settle-dialog"
          className="absolute inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={phase === "sealed" ? onClose : undefined}
        >
          <motion.div
            className="relative grid max-h-[calc(100vh-2rem)] w-[1120px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-6 overflow-y-auto rounded-2xl bg-[#faf7f0] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.3)] md:grid-cols-[minmax(0,1fr)_320px]"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 左：笺预览 */}
            <div className="flex items-start justify-center">
              <div className={cn("w-full", useLongPaper ? "max-w-[640px]" : "max-w-[400px]")}>
                <LetterPaper
                  ref={paperRef}
                  variant={variant}
                  title={paperTitle || defaultPaperTitle}
                  lines={paperLines}
                  dateLabel={dateLabel}
                  solarTermLabel={solarTermLabel}
                  moon={moon}
                  authorName={authorName ?? "shuind"}
                  ornamentSealText={ornamentSealText}
                  sealVisible={phase === "sealed"}
                  sealDateLabel={dateLabel}
                  sealSolarTerm={solarTermName}
                  size={useLongPaper ? "long" : "standard"}
                  editable={phase === "preview"}
                  onTitleChange={setPaperTitle}
                  onLineChange={(index, value) =>
                    setPaperLines((current) => current.map((line, lineIndex) => (lineIndex === index ? value : line)))
                  }
                />
              </div>
            </div>

            {/* 右：说明 + 操作 */}
            <div className="flex flex-col">
              <div className="flex-1">
                {phase === "preview" ? (
                  <>
                    <div>
                      <p className="mb-2 text-[11px] tracking-[0.18em] text-slate-400">质感</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {VARIANTS.map((v) => (
                          <button
                            key={v.key}
                            type="button"
                            onClick={() => setVariant(v.key)}
                            className={
                              "rounded-md border px-2 py-1.5 text-[12px] transition-colors " +
                              (variant === v.key
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-black/10 bg-white/60 text-slate-600 hover:border-black/25")
                            }
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {hasOrnamentSeal ? (
                      <div className="mt-5">
                        <label className="mb-2 block text-[11px] tracking-[0.18em] text-slate-400" htmlFor="letter-seal-text">
                          印文
                        </label>
                        <input
                          id="letter-seal-text"
                          value={ornamentSealText}
                          maxLength={4}
                          onChange={(event) => setOrnamentSealText(sanitizeSealInput(event.target.value))}
                          className="h-10 w-28 rounded-md border border-black/10 bg-white/60 px-3 text-center text-[16px] text-slate-800 outline-none transition-colors focus:border-slate-500"
                        />
                      </div>
                    ) : null}

                    {errMsg ? (
                      <p className="mt-4 text-[12px] text-rose-500">{errMsg}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                {phase === "preview" && (
                  <>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-black/12 px-4 py-2 text-[13px] text-slate-600 hover:bg-black/5"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={busy}
                      className="rounded-full bg-slate-900 px-5 py-2 text-[13px] text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      写入时间
                    </button>
                  </>
                )}
                {phase === "sealing" && (
                  <span className="text-[13px] text-slate-400">封存中…</span>
                )}
                {phase === "sealed" && (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-full border border-black/12 px-4 py-2 text-[13px] text-slate-700 hover:bg-black/5"
                    >
                      保存这张笺
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full bg-slate-900 px-5 py-2 text-[13px] text-white hover:bg-slate-800"
                    >
                      完成
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function sanitizeSealInput(value: string) {
  return Array.from(value.replace(/\s+/g, "")).slice(0, 4).join("");
}
