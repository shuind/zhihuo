"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { LetterSprite } from "./letter-sprite";
import { MoonGlyph } from "./moon-glyph";
import { PaperOrnament } from "./paper-ornament";
import { LetterSeal } from "./letter-seal";
import type { MoonPhase } from "@/lib/solar-terms";

export type PaperVariant = "plain" | "vellum" | "ink" | "rice" | "tide" | "clay";

export const VARIANT_META: Record<
  PaperVariant,
  { label: string; hint: string }
> = {
  plain: { label: "素笺", hint: "米色虚线 · 白日" },
  vellum: { label: "羊皮金", hint: "深褐金字 · 冻结" },
  ink: { label: "夜墨", hint: "深灰银蓝 · 夜里" },
  rice: { label: "宣纸", hint: "浅白淡墨 · 朱印" },
  tide: { label: "潮汐", hint: "青蓝水纹 · 细金" },
  clay: { label: "陶土", hint: "赤陶朱砂 · 古意" }
};

export type LetterPaperProps = {
  variant: PaperVariant;
  title: string;
  lines: string[];
  dateLabel: string;
  solarTermLabel: string;
  moon: MoonPhase;
  authorName?: string;
  spriteFade?: number;
  ornamentSealText?: string;
  sealVisible?: boolean;
  sealDateLabel?: string;
  sealSolarTerm?: string;
  size?: "standard" | "long";
  editable?: boolean;
  onTitleChange?: (value: string) => void;
  onLineChange?: (index: number, value: string) => void;
  className?: string;
};

export const LetterPaper = forwardRef<HTMLDivElement, LetterPaperProps>(function LetterPaper(
  {
    variant,
    title,
    lines,
    dateLabel,
    solarTermLabel,
    moon,
    authorName = "shuind",
    spriteFade = 0,
    ornamentSealText,
    sealVisible = false,
    sealDateLabel,
    sealSolarTerm,
    size = "standard",
    editable = false,
    onTitleChange,
    onLineChange,
    className
  },
  ref
) {
  const p = getPalette(variant);
  const isLong = size === "long";

  return (
    <div
      ref={ref}
      className={cn(
        "relative mx-auto flex w-full flex-col overflow-hidden",
        isLong ? "min-h-[720px] max-w-[640px]" : "aspect-[3/4] max-w-[480px]",
        className
      )}
      style={{
        background: p.bg,
        color: p.ink,
        fontFamily: p.font
      }}
    >
      {/* 底层纹理 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: p.texture, mixBlendMode: p.textureBlend }}
      />

      {/* 装饰（每种质感独立 SVG） */}
      <PaperOrnament variant={variant} palette={p} sealText={ornamentSealText} />

      {/* 落成印章 */}
      <LetterSeal
        visible={sealVisible}
        dateLabel={sealDateLabel ?? dateLabel}
        solarTerm={sealSolarTerm ?? solarTermLabel}
        color={variant === "vellum" || variant === "ink" || variant === "tide" ? p.accent : "#b93a2a"}
      />

      {/* 素笺的虚线格 */}
      {variant === "plain" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 44px, rgba(120,110,90,0.28) 44px, rgba(120,110,90,0.28) 45px)"
          }}
        />
      )}

      {/* 宣纸的墨渍 */}
      {variant === "rice" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 180px 60px at 70% 20%, rgba(60,50,40,0.06), transparent 70%), radial-gradient(ellipse 140px 50px at 20% 85%, rgba(80,60,40,0.07), transparent 70%)"
          }}
        />
      )}

      {/* 顶部 */}
      <header className="relative z-10 flex items-start justify-between px-8 pt-7">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] tracking-[0.3em] uppercase"
            style={{ color: p.subtle }}
          >
            {getCorner(variant)}
          </span>
          <span className="h-px w-12" style={{ background: p.rule }} />
        </div>
        <div
          className="flex items-center gap-2 text-[11px] tracking-[0.25em]"
          style={{ color: p.subtle }}
        >
          <MoonGlyph phase={moon} size={12} lit={p.moonLit} dark={p.moonDark} />
          <span>{dateLabel}</span>
        </div>
      </header>

      <div className="relative z-10 px-8 pt-2">
        <span
          className="text-[11px] tracking-[0.2em]"
          style={{ color: p.subtle }}
        >
          {solarTermLabel}
        </span>
      </div>

      {/* 正文 */}
      <main className={cn("relative z-10 flex flex-1 flex-col px-8", isLong ? "pb-8 pt-9" : "pt-10")}>
        <h1
          contentEditable={editable}
          suppressContentEditableWarning
          spellCheck={false}
          className={cn(
            "text-balance leading-[1.45] tracking-[0.02em] outline-none",
            editable && "rounded-sm focus:bg-black/[0.025] focus:ring-1 focus:ring-black/10",
            isLong
              ? variant === "vellum" || variant === "tide"
                ? "text-[20px] italic"
                : "text-[24px]"
              : variant === "vellum" || variant === "tide" ? "text-[22px] italic" : "text-[26px]"
          )}
          style={{
            color: p.titleInk,
            fontWeight: variant === "ink" ? 300 : 400
          }}
          onBlur={(event) => onTitleChange?.(readEditableText(event.currentTarget))}
          onKeyDown={preventEditableBreak}
          onPaste={pastePlainText}
        >
          {title}
        </h1>

        <div className={cn("flex flex-col", isLong ? "mt-8 gap-2.5" : "mt-10 gap-3")}>
          {lines.map((line, i) => {
            const isSection = /^方向\s+\d+/.test(line) || line === "未归入方向";
            return (
              <p
                key={i}
                contentEditable={editable && !isSection}
                suppressContentEditableWarning
                spellCheck={false}
                className={cn(
                  "tracking-[0.02em]",
                  editable && !isSection && "rounded-sm outline-none focus:bg-black/[0.025] focus:ring-1 focus:ring-black/10",
                  isSection
                    ? "mt-3 text-[12px] leading-[1.6] tracking-[0.16em]"
                    : "leading-[1.95]",
                  isLong
                    ? variant === "vellum" || variant === "tide" ? "text-[14px] italic" : "text-[15px]"
                    : variant === "vellum" || variant === "tide" ? "text-[15px] italic" : "text-[16px]"
                )}
                style={{ color: isSection ? p.subtle : p.bodyInk }}
                onBlur={(event) => {
                  if (!isSection) onLineChange?.(i, readEditableText(event.currentTarget));
                }}
                onKeyDown={preventEditableBreak}
                onPaste={pastePlainText}
              >
                {line}
              </p>
            );
          })}
        </div>
      </main>

      {/* 底部 */}
      <footer className={cn("relative z-10 flex items-end justify-between px-8 pb-7", isLong ? "pt-8" : "pt-4")}>
        <div className="flex items-center gap-3">
          <span
            className="grid h-[22px] w-[22px] place-items-center rounded-full"
            style={{
              background: variant === "vellum" || variant === "ink" || variant === "tide" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${p.rule}`
            }}
          >
            <img
              src="/zhihuo_logo_icon.svg"
              alt=""
              width={13}
              height={13}
              style={{
                opacity: 0.85,
                filter: variant === "vellum" || variant === "ink" || variant === "tide" ? "invert(1)" : "none"
              }}
            />
          </span>
          <div className="flex flex-col gap-[2px]">
            <span
              className="text-[11px] tracking-[0.22em]"
              style={{ color: p.subtle }}
            >
              知惑
            </span>
            <span
              className="text-[10px] tracking-[0.2em]"
              style={{ color: p.subtleSoft }}
            >
              {authorName}
            </span>
          </div>
        </div>
        <div className="h-[64px] w-[72px]" style={{ color: p.sprite }}>
          <LetterSprite fade={spriteFade} className="h-full w-full" />
        </div>
      </footer>
    </div>
  );
});

function readEditableText(element: HTMLElement) {
  return element.innerText.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function preventEditableBreak(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function pastePlainText(event: React.ClipboardEvent<HTMLElement>) {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain").replace(/\s+/g, " ").trim();
  document.execCommand("insertText", false, text);
}

function getCorner(v: PaperVariant): string {
  switch (v) {
    case "vellum": return "Doubt · No.";
    case "ink": return "Nightnote";
    case "rice": return "宣 · 知惑";
    case "tide": return "Tide · 潮";
    case "clay": return "陶 · 壹";
    default: return "知惑";
  }
}

export type Palette = {
  bg: string;
  texture: string;
  textureBlend: React.CSSProperties["mixBlendMode"];
  ink: string;
  titleInk: string;
  bodyInk: string;
  subtle: string;
  subtleSoft: string;
  rule: string;
  sprite: string;
  accent: string;
  moonLit: string;
  moonDark: string;
  font: string;
};

function getPalette(variant: PaperVariant): Palette {
  switch (variant) {
    case "plain":
      return {
        bg: "linear-gradient(180deg, #f7f1e0 0%, #f2e9d2 100%)",
        texture:
          "radial-gradient(1200px 800px at 20% 10%, rgba(255,250,230,0.4), transparent 60%), radial-gradient(800px 600px at 80% 90%, rgba(160,140,100,0.05), transparent 70%)",
        textureBlend: "multiply",
        ink: "#5a4a32",
        titleInk: "#3d2f1c",
        bodyInk: "#4c3d27",
        subtle: "rgba(120,100,70,0.7)",
        subtleSoft: "rgba(120,100,70,0.45)",
        rule: "rgba(120,100,70,0.35)",
        sprite: "rgba(90,74,50,0.85)",
        accent: "#b08a4a",
        moonLit: "#c9a567",
        moonDark: "#7a6338",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "vellum":
      return {
        bg: "linear-gradient(160deg, #3a2a1a 0%, #2a1d12 60%, #1e140b 100%)",
        texture:
          "radial-gradient(900px 600px at 30% 20%, rgba(255,210,140,0.1), transparent 60%), radial-gradient(600px 400px at 80% 80%, rgba(200,150,80,0.08), transparent 70%), repeating-linear-gradient(45deg, transparent 0 3px, rgba(120,80,40,0.04) 3px 4px)",
        textureBlend: "normal",
        ink: "#e8c784",
        titleInk: "#f0d498",
        bodyInk: "#d9b876",
        subtle: "rgba(220,180,110,0.55)",
        subtleSoft: "rgba(220,180,110,0.32)",
        rule: "rgba(220,180,110,0.3)",
        sprite: "rgba(230,195,120,0.6)",
        accent: "#e8c784",
        moonLit: "#f0d498",
        moonDark: "#6b4a22",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "ink":
      return {
        bg: "linear-gradient(160deg, #141820 0%, #0c0f15 100%)",
        texture:
          "radial-gradient(800px 500px at 50% 0%, rgba(140,170,200,0.08), transparent 60%), radial-gradient(600px 400px at 80% 100%, rgba(100,130,170,0.06), transparent 70%)",
        textureBlend: "normal",
        ink: "#c7d4e3",
        titleInk: "#e4ecf5",
        bodyInk: "#b3c2d2",
        subtle: "rgba(180,195,215,0.55)",
        subtleSoft: "rgba(180,195,215,0.3)",
        rule: "rgba(180,195,215,0.25)",
        sprite: "rgba(200,214,228,0.55)",
        accent: "#9fb8d4",
        moonLit: "#e4ecf5",
        moonDark: "#3a4656",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "rice":
      return {
        bg: "linear-gradient(180deg, #fbf8f1 0%, #f5efdf 100%)",
        texture:
          "radial-gradient(600px 400px at 10% 0%, rgba(220,210,180,0.35), transparent 60%), radial-gradient(500px 300px at 100% 100%, rgba(200,180,140,0.2), transparent 70%)",
        textureBlend: "multiply",
        ink: "#2a2420",
        titleInk: "#1a1612",
        bodyInk: "#342c26",
        subtle: "rgba(60,50,40,0.55)",
        subtleSoft: "rgba(60,50,40,0.3)",
        rule: "rgba(60,50,40,0.25)",
        sprite: "rgba(40,30,20,0.8)",
        accent: "#b93a2a",
        moonLit: "#4a3a2a",
        moonDark: "#bfb09a",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "tide":
      return {
        bg: "linear-gradient(170deg, #0f2a33 0%, #0b1f28 50%, #081520 100%)",
        texture:
          "radial-gradient(900px 500px at 30% 0%, rgba(100,180,190,0.12), transparent 60%), radial-gradient(700px 400px at 80% 80%, rgba(180,150,90,0.08), transparent 70%)",
        textureBlend: "normal",
        ink: "#cfe4e8",
        titleInk: "#e8d9a8",
        bodyInk: "#b6ced2",
        subtle: "rgba(200,220,220,0.55)",
        subtleSoft: "rgba(200,220,220,0.3)",
        rule: "rgba(200,220,220,0.25)",
        sprite: "rgba(220,200,140,0.55)",
        accent: "#d9b87a",
        moonLit: "#e8d9a8",
        moonDark: "#2a3c40",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "clay":
      return {
        bg: "linear-gradient(170deg, #d9a07a 0%, #c07e58 60%, #a86345 100%)",
        texture:
          "radial-gradient(500px 350px at 20% 10%, rgba(255,220,180,0.22), transparent 60%), radial-gradient(400px 300px at 90% 90%, rgba(60,20,10,0.12), transparent 70%), repeating-radial-gradient(circle at 50% 50%, transparent 0 20px, rgba(60,20,10,0.03) 20px 21px)",
        textureBlend: "multiply",
        ink: "#3a1a10",
        titleInk: "#2a1008",
        bodyInk: "#4a2418",
        subtle: "rgba(60,20,10,0.6)",
        subtleSoft: "rgba(60,20,10,0.35)",
        rule: "rgba(60,20,10,0.3)",
        sprite: "rgba(40,15,8,0.85)",
        accent: "#8a1a10",
        moonLit: "#3a1a10",
        moonDark: "#d9a07a",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
  }
}
