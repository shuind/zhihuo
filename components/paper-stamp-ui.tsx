"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { LifePaper, ThinkingStamp } from "@/components/decor-store";

export type PaperPreset = {
  id: LifePaper;
  name: string;
  desc: string;
  /** swatch background used in preview tiles */
  swatch: string;
  /** border accent for the preview chip */
  ring: string;
};

export type StampPreset = {
  id: ThinkingStamp;
  name: string;
  desc: string;
  color: string;
  shape: "circle" | "triangle" | "diamond" | "square" | "double-ring";
};

export const PAPER_PRESETS: PaperPreset[] = [
  { id: "plain", name: "素笺", desc: "默认 · 中性", swatch: "rgba(232,226,216,0.14)", ring: "rgba(232,226,216,0.22)" },
  { id: "songyan", name: "松烟", desc: "沉重 · 执念", swatch: "rgba(40,38,42,0.92)", ring: "rgba(70,68,72,0.55)" },
  { id: "xuetao", name: "薛涛", desc: "悸动 · 情感", swatch: "rgba(178,116,120,0.72)", ring: "rgba(196,134,138,0.58)" },
  { id: "shuangye", name: "霜叶", desc: "冷静 · 抽离", swatch: "rgba(150,162,170,0.62)", ring: "rgba(170,182,190,0.52)" },
  { id: "feihong", name: "飞鸿", desc: "回忆 · 远意", swatch: "rgba(132,158,172,0.66)", ring: "rgba(152,178,192,0.52)" },
  { id: "zhishi", name: "赭石", desc: "警醒 · 决断", swatch: "rgba(178,98,60,0.72)", ring: "rgba(198,118,80,0.55)" },
  { id: "liuhuang", name: "流黄", desc: "岁月 · 旧事", swatch: "rgba(206,176,114,0.62)", ring: "rgba(218,190,132,0.52)" },
  { id: "leitie", name: "雷帖", desc: "短促 · 刻意", swatch: "rgba(108,118,122,0.74)", ring: "rgba(128,138,142,0.55)" }
];

export const STAMP_PRESETS: StampPreset[] = [
  { id: "pending", name: "未决", desc: "还没想清楚", color: "rgba(128,136,144,0.95)", shape: "circle" },
  { id: "pain", name: "痛点", desc: "这里刺痛", color: "rgba(188,66,54,0.95)", shape: "triangle" },
  { id: "spark", name: "灵光", desc: "有东西", color: "rgba(196,150,74,0.98)", shape: "diamond" },
  { id: "archived", name: "存档", desc: "先封起来", color: "rgba(54,60,66,0.95)", shape: "square" },
  { id: "echo", name: "回声", desc: "与别的相关", color: "rgba(72,114,150,0.96)", shape: "double-ring" }
];

export function getPaperPreset(id: LifePaper): PaperPreset {
  return PAPER_PRESETS.find((item) => item.id === id) ?? PAPER_PRESETS[0];
}

export function getStampPreset(id: ThinkingStamp): StampPreset {
  return STAMP_PRESETS.find((item) => item.id === id) ?? STAMP_PRESETS[0];
}

export function StampGlyph(props: { shape: StampPreset["shape"]; color: string; size?: number; strokeWidth?: number }) {
  const size = props.size ?? 14;
  const sw = props.strokeWidth ?? 1.6;
  switch (props.shape) {
    case "circle":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5" fill="none" stroke={props.color} strokeWidth={sw} />
        </svg>
      );
    case "triangle":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3 L13 12.5 L3 12.5 Z" fill="none" stroke={props.color} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case "diamond":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.2 L13.8 8 L8 13.8 L2.2 8 Z" fill="none" stroke={props.color} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case "square":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" fill="none" stroke={props.color} strokeWidth={sw} />
        </svg>
      );
    case "double-ring":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.2" fill="none" stroke={props.color} strokeWidth={sw * 0.85} />
          <circle cx="8" cy="8" r="2.4" fill="none" stroke={props.color} strokeWidth={sw * 0.85} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * A tiny decorative glyph that renders the current paper as a 14px swatch.
 * Used for inline entry points (e.g. "current paper" chip in detail panels).
 */
export function PaperGlyph(props: { paper: LifePaper; size?: number }) {
  const preset = getPaperPreset(props.paper);
  const size = props.size ?? 14;
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-[3px]"
      style={{
        width: size,
        height: size,
        background: preset.swatch,
        boxShadow: `inset 0 0 0 1px ${preset.ring}`
      }}
    />
  );
}

type Anchor = { top: number; left: number } | null;

function usePortal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

function useOutsideClose(open: boolean, ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current) return;
      if (event.target instanceof Node && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, ref]);
}

function positionFromAnchor(anchor: Anchor, width: number, height: number): { top: number; left: number } {
  if (!anchor) return { top: 80, left: 80 };
  if (typeof window === "undefined") return anchor;
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - width - 12);
  const top = Math.min(Math.max(12, anchor.top), window.innerHeight - height - 12);
  return { top, left };
}

export function PaperPickerPopover(props: {
  open: boolean;
  anchor: Anchor;
  currentPaper: LifePaper;
  onPick: (paper: LifePaper) => void;
  onClose: () => void;
  /** light when hosted on a light surface (detail panel), dark for the life timeline */
  variant?: "light" | "dark";
}) {
  const mounted = usePortal();
  const ref = useRef<HTMLDivElement | null>(null);
  useOutsideClose(props.open, ref, props.onClose);

  if (!mounted) return null;
  const variant = props.variant ?? "dark";
  const pos = positionFromAnchor(props.anchor, 308, 280);

  return createPortal(
    <AnimatePresence>
      {props.open ? (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="选择笺纸"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.24, 0.61, 0.35, 1] }}
          className={cn(
            "fixed z-[90] w-[308px] rounded-[18px] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.36)]",
            variant === "dark"
              ? "border border-white/[0.06] bg-[rgba(14,15,18,0.96)] text-[rgba(220,214,202,0.9)]"
              : "border border-black/[0.06] bg-white text-slate-800"
          )}
          style={{ top: pos.top, left: pos.left }}
        >
          <p
            className={cn(
              "mb-3 text-[11px] tracking-[0.14em]",
              variant === "dark" ? "text-[rgba(170,162,148,0.64)]" : "text-slate-500"
            )}
          >
            选一张笺纸
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {PAPER_PRESETS.map((preset) => {
              const selected = preset.id === props.currentPaper;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={`${preset.name} · ${preset.desc}`}
                  className={cn(
                    "group flex flex-col items-center gap-1.5 rounded-[10px] p-1.5 text-[11px] transition-all",
                    variant === "dark"
                      ? "hover:bg-white/[0.04]"
                      : "hover:bg-slate-100"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onPick(preset.id);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative h-11 w-14 overflow-hidden transition-transform group-hover:scale-[1.04]",
                      paperShapeClass(preset.id)
                    )}
                    style={{
                      background: preset.swatch,
                      boxShadow: selected
                        ? `inset 0 0 0 1.4px ${preset.ring}, 0 0 0 2px ${variant === "dark" ? "rgba(220,214,202,0.4)" : "rgba(15,23,42,0.45)"}`
                        : `inset 0 0 0 1px ${preset.ring}`
                    }}
                  />
                  <span
                    className={cn(
                      "tracking-[0.04em]",
                      variant === "dark"
                        ? selected
                          ? "text-[rgba(232,226,214,0.92)]"
                          : "text-[rgba(186,180,168,0.72)]"
                        : selected
                          ? "text-slate-900"
                          : "text-slate-600"
                    )}
                  >
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p
            className={cn(
              "mt-3 text-[10.5px] leading-[1.6] tracking-[0.04em]",
              variant === "dark" ? "text-[rgba(150,144,132,0.5)]" : "text-slate-400"
            )}
          >
            {getPaperPreset(props.currentPaper).desc}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** shape classnames only used inside the picker preview swatches */
function paperShapeClass(id: LifePaper) {
  switch (id) {
    case "plain":
      return "rounded-[5px]";
    case "songyan":
      return "rounded-[2px]";
    case "xuetao":
      return "rounded-[5px] [clip-path:polygon(12%_0,100%_0,100%_100%,0_100%,0_22%)]";
    case "shuangye":
      return "rounded-[22px_8px_22px_8px]";
    case "feihong":
      return "rounded-[5px] [clip-path:polygon(0_0,100%_0,100%_78%,88%_100%,0_100%)]";
    case "zhishi":
      return "rounded-full";
    case "liuhuang":
      return "rounded-[5px]";
    case "leitie":
      return "rounded-[2px] [clip-path:polygon(0_12%,100%_0,100%_88%,0_100%)]";
    default:
      return "rounded-[5px]";
  }
}

export function paperCardShapeClass(id: LifePaper): string {
  // Class applied to the actual life card — gentler shapes so they remain tappable.
  switch (id) {
    case "plain":
      return "rounded-[1.25rem]";
    case "songyan":
      return "rounded-[6px]";
    case "xuetao":
      return "rounded-[1.25rem] [clip-path:polygon(4%_0,100%_0,100%_100%,0_100%,0_10%)]";
    case "shuangye":
      return "rounded-[1.75rem_0.75rem_1.75rem_0.75rem]";
    case "feihong":
      return "rounded-[1.25rem] [clip-path:polygon(0_0,100%_0,100%_86%,94%_100%,0_100%)]";
    case "zhishi":
      return "rounded-[2.5rem]";
    case "liuhuang":
      return "rounded-[1.25rem]";
    case "leitie":
      return "rounded-[6px] [clip-path:polygon(0_5%,100%_0,100%_95%,0_100%)]";
    default:
      return "rounded-[1.25rem]";
  }
}

export function StampPickerPopover(props: {
  open: boolean;
  anchor: Anchor;
  currentStamp: ThinkingStamp | null;
  onPick: (stamp: ThinkingStamp | null) => void;
  onClose: () => void;
}) {
  const mounted = usePortal();
  const ref = useRef<HTMLDivElement | null>(null);
  useOutsideClose(props.open, ref, props.onClose);

  if (!mounted) return null;
  const pos = positionFromAnchor(props.anchor, 260, 220);

  return createPortal(
    <AnimatePresence>
      {props.open ? (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="选择印章"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.24, 0.61, 0.35, 1] }}
          className="fixed z-[90] w-[260px] rounded-[16px] border border-black/[0.08] bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="mb-2.5 px-1 text-[11px] tracking-[0.12em] text-slate-500">盖一枚印</p>
          <div className="grid gap-1">
            {STAMP_PRESETS.map((preset) => {
              const selected = preset.id === props.currentStamp;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-slate-100" : "hover:bg-slate-50"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onPick(preset.id);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 place-items-center rounded-md"
                    style={{ background: "rgba(15,23,42,0.02)" }}
                  >
                    <StampGlyph shape={preset.shape} color={preset.color} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-slate-800">{preset.name}</span>
                    <span className="block text-[11px] leading-[1.5] text-slate-500">{preset.desc}</span>
                  </span>
                  {selected ? <span className="text-[11px] text-slate-500">已选</span> : null}
                </button>
              );
            })}
          </div>
          {props.currentStamp ? (
            <>
              <div className="my-2 h-px bg-black/[0.06]" />
              <button
                type="button"
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onPick(null);
                }}
              >
                取消盖印
              </button>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** small stamp badge rendered on the corner of thinking nodes */
export function NodeStampBadge(props: { stamp: ThinkingStamp; size?: number }) {
  const preset = getStampPreset(props.stamp);
  return (
    <span
      aria-label={`印章：${preset.name}`}
      title={`${preset.name} · ${preset.desc}`}
      className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-[6px]"
      style={{ background: "rgba(15,23,42,0.03)" }}
    >
      <StampGlyph shape={preset.shape} color={preset.color} size={props.size ?? 12} strokeWidth={1.5} />
    </span>
  );
}
