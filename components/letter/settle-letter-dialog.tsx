"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LetterPaper, type PaperVariant } from "./letter-paper";
import { exportLetterPng } from "./export-letter-png";
import { describeSolarTerm, getCurrentSolarTerm, getMoonPhase } from "@/lib/solar-terms";
import { poetize } from "@/lib/letter-poetize";
import { suggestVariant } from "./letter-exporter-dialog";
import { saveLetterSealText, saveLetterVariant } from "@/lib/letter-variant-store";
import { cn } from "@/lib/utils";
import { loadAiApiSettings, loadAiRemoteProcessingConsent } from "@/lib/ai-settings";
import { useLetterAuthorName } from "@/lib/letter-settings";
import type { LetterCondenseRequest, LetterCondenseResponse } from "@/lib/letter-ai";

type Phase = "preview" | "sealing" | "sealed";
type AiStatus = "idle" | "loading" | "ready" | "error";

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
  const storedAuthorName = useLetterAuthorName();
  const [phase, setPhase] = useState<Phase>("preview");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<PaperVariant>(() => suggestVariant(writtenAt, false));
  const [ornamentSealText, setOrnamentSealText] = useState("知");
  const [paperTitle, setPaperTitle] = useState("");
  const [paperLines, setPaperLines] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [hasUserEditedLetter, setHasUserEditedLetter] = useState(false);
  const [remoteConsentGranted, setRemoteConsentGranted] = useState(false);
  const [useAiThisTime, setUseAiThisTime] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const condenseRequestIdRef = useRef(0);
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase("preview");
      setBusy(false);
      setErrMsg(null);
      setAiStatus("idle");
      setAiHint(null);
      setVariant(suggestVariant(writtenAt, false));
      setOrnamentSealText("知");
      setRemoteConsentGranted(loadAiRemoteProcessingConsent());
      setUseAiThisTime(false);
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

  const requestCondense = useCallback(
    async ({ overwrite, showFallbackHint = false }: { overwrite: boolean; showFallbackHint?: boolean }) => {
      const requestId = condenseRequestIdRef.current + 1;
      condenseRequestIdRef.current = requestId;
      setAiStatus("loading");
      setAiHint(null);

      const ai = loadAiApiSettings();
      const body: LetterCondenseRequest = {
        doubt: doubtText,
        nodes,
        closing: closingNote,
        allowRemoteProcessing: true
      };
      if (ai.apiKey) body.ai = ai;

      try {
        const response = await fetch("/v1/letter/condense", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = (await response.json().catch(() => null)) as LetterCondenseResponse | { error?: string } | null;
        if (condenseRequestIdRef.current !== requestId) return;
        if (!response.ok || !data || !Array.isArray((data as LetterCondenseResponse).lines)) {
          setAiStatus("error");
          setAiHint("AI 凝练暂不可用，已保留当前信笺。");
          return;
        }

        const result = data as LetterCondenseResponse;
        if (result.source !== "ai") {
          setAiStatus("idle");
          if (showFallbackHint) setAiHint("暂无可用 AI，已保留当前信笺。");
          return;
        }

        const shouldApply = overwrite || !userEditedRef.current;
        if (shouldApply) {
          setPaperTitle(result.title);
          setPaperLines(result.lines);
          userEditedRef.current = false;
          setHasUserEditedLetter(false);
        }
        setAiStatus("ready");
        setAiHint(shouldApply ? "已用 AI 凝练信笺。" : "AI 已凝练，手动编辑已保留。");
      } catch {
        if (condenseRequestIdRef.current !== requestId) return;
        setAiStatus("error");
        setAiHint("AI 凝练暂不可用，已保留当前信笺。");
      }
    },
    [closingNote, doubtText, nodes]
  );

  useEffect(() => {
    if (!open) {
      condenseRequestIdRef.current += 1;
      return;
    }
    userEditedRef.current = false;
    setHasUserEditedLetter(false);
    setAiStatus("idle");
    setAiHint(null);
    setPaperTitle(defaultPaperTitle);
    setPaperLines(defaultPaperLines);
  }, [open, defaultPaperTitle, defaultPaperLines, requestCondense]);

  const handleTitleChange = useCallback((value: string) => {
    userEditedRef.current = true;
    setHasUserEditedLetter(true);
    setPaperTitle(value);
  }, []);

  const handleLineChange = useCallback((index: number, value: string) => {
    userEditedRef.current = true;
    setHasUserEditedLetter(true);
    setPaperLines((current) => current.map((line, lineIndex) => (lineIndex === index ? value : line)));
  }, []);

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
    await exportLetterPng(paperRef.current, `zhihuo-jian-${writtenAt.getTime()}.png`);
  };

  const VARIANTS: { key: PaperVariant; label: string }[] = [
    { key: "plain", label: "素笺" },
    { key: "rice", label: "宣纸" },
    { key: "clay", label: "陶土" },
    { key: "tide", label: "潮汐" },
    { key: "ink", label: "夜墨" },
    { key: "vellum", label: "羊皮金" }
  ];

  if (!open) return null;

  return (
        <div
          data-settle-letter-dialog="true"
          data-settle-letter-phase={phase}
          role="dialog"
          aria-modal="true"
          aria-label="封存为信笺"
          className="absolute inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-[2px] animate-[zhDialogFadeIn_220ms_ease-out_1]"
          onClick={phase === "sealed" ? onClose : undefined}
        >
          <div
            className="relative grid max-h-[calc(100vh-2rem)] w-[1120px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-6 overflow-y-auto rounded-2xl bg-[#faf7f0] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.3)] animate-[zhDialogPanelIn_280ms_ease-out_1] md:grid-cols-[minmax(0,1fr)_320px]"
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
                  authorName={authorName ?? storedAuthorName}
                  ornamentSealText={ornamentSealText}
                  sealVisible={phase === "sealed"}
                  sealDateLabel={dateLabel}
                  sealSolarTerm={solarTermName}
                  size={useLongPaper ? "long" : "standard"}
                  editable={phase === "preview"}
                  onTitleChange={handleTitleChange}
                  onLineChange={handleLineChange}
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

                    <div className="mt-5 rounded-lg border border-slate-300 bg-white/70 p-3">
                      <label className="flex items-start gap-2 text-[13px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={useAiThisTime}
                          disabled={!remoteConsentGranted}
                          onChange={(event) => {
                            setUseAiThisTime(event.target.checked);
                            setAiHint(null);
                          }}
                          className="mt-0.5 h-4 w-4 accent-slate-900"
                        />
                        <span>
                          <span className="font-medium">{useAiThisTime ? "本次使用 AI 凝练" : "本次不用 AI"}</span>
                          <span className="mt-1 block text-[11px] leading-5 text-slate-600">
                            {remoteConsentGranted
                              ? "开启后，点击下方按钮才会把当前疑问、节点与札记发送给所选模型服务商。"
                              : "请先在设置 → AI 中允许按次使用第三方 AI；当前信笺完全在本机生成。"}
                          </span>
                        </span>
                      </label>
                    </div>

                    {errMsg ? (
                      <p className="mt-4 text-[12px] text-rose-500">{errMsg}</p>
                    ) : null}
                    {aiHint ? (
                      <p className="mt-4 text-[12px] text-slate-500">{aiHint}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                {phase === "preview" && (
                  <>
                    <button
                      type="button"
                      data-settle-letter-regenerate="true"
                      aria-label={hasUserEditedLetter ? "重新凝练并覆盖当前信笺" : "重新凝练信笺"}
                      onClick={() => void requestCondense({ overwrite: true, showFallbackHint: true })}
                      disabled={aiStatus === "loading" || !remoteConsentGranted || !useAiThisTime}
                      className="rounded-full border border-black/12 px-4 py-2 text-[13px] text-slate-700 hover:bg-black/5 disabled:opacity-60"
                    >
                      {aiStatus === "loading" ? "凝练中…" : hasUserEditedLetter ? "重新用 AI 凝练" : "用 AI 凝练"}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-black/12 px-4 py-2 text-[13px] text-slate-600 hover:bg-black/5"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      data-settle-letter-confirm="true"
                      onClick={handleConfirm}
                      disabled={busy}
                      className="rounded-full bg-slate-900 px-5 py-2 text-[13px] text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      封存
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
                      data-settle-letter-done="true"
                      onClick={onClose}
                      className="rounded-full bg-slate-900 px-5 py-2 text-[13px] text-white hover:bg-slate-800"
                    >
                      完成
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
  );
}

function sanitizeSealInput(value: string) {
  return Array.from(value.replace(/\s+/g, "")).slice(0, 4).join("");
}
