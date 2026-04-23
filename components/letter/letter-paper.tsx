"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { LetterSprite } from "./letter-sprite";
import { MoonGlyph } from "./moon-glyph";
import type { MoonPhase } from "@/lib/solar-terms";

export type PaperVariant = "plain" | "vellum" | "ink";

export type LetterPaperProps = {
  variant: PaperVariant;
  title: string;
  lines: string[];
  dateLabel: string;        // 例如 "2026 / 4 / 23"
  solarTermLabel: string;   // 例如 "谷雨·第五日"
  moon: MoonPhase;
  authorName?: string;
  /** 小动物墨色淡化（0 - 1） */
  spriteFade?: number;
  className?: string;
};

export const LetterPaper = forwardRef<HTMLDivElement, LetterPaperProps>(function LetterPaper(
  { variant, title, lines, dateLabel, solarTermLabel, moon, authorName = "shuind", spriteFade = 0, className },
  ref
) {
  const palette = getPalette(variant);

  return (
    <div
      ref={ref}
      className={cn(
        "relative mx-auto flex aspect-[3/4] w-full max-w-[480px] flex-col overflow-hidden",
        className
      )}
      style={{
        background: palette.bg,
        color: palette.ink,
        fontFamily: palette.font,
        ["--sprite-stroke" as string]: palette.sprite
      }}
    >
      {/* 纸张纹理层 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: palette.texture, mixBlendMode: palette.textureBlend }}
      />

      {/* 虚线格子（素笺才有） */}
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

      {/* 顶部：标题与日期 */}
      <header className="relative z-10 flex items-start justify-between px-8 pt-7">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] tracking-[0.3em] uppercase"
            style={{ color: palette.subtle }}
          >
            {variant === "vellum" ? "Doubt · No." : "知惑"}
          </span>
          <span className="h-px w-12" style={{ background: palette.rule }} />
        </div>
        <div
          className="flex items-center gap-2 text-[11px] tracking-[0.25em]"
          style={{ color: palette.subtle }}
        >
          <MoonGlyph phase={moon} size={12} lit={palette.moonLit} dark={palette.moonDark} />
          <span>{dateLabel}</span>
        </div>
      </header>

      {/* 节气微章 */}
      <div className="relative z-10 px-8 pt-2">
        <span
          className="text-[11px] tracking-[0.2em]"
          style={{ color: palette.subtle }}
        >
          {solarTermLabel}
        </span>
      </div>

      {/* 正文 */}
      <main className="relative z-10 flex flex-1 flex-col px-8 pt-10">
        <h1
          className={cn(
            "text-balance leading-[1.45] tracking-[0.02em]",
            variant === "vellum" ? "text-[22px] italic" : "text-[26px]"
          )}
          style={{ color: palette.titleInk, fontWeight: variant === "ink" ? 300 : 400 }}
        >
          {title}
        </h1>

        <div className="mt-10 flex flex-col gap-3">
          {lines.map((line, i) => (
            <p
              key={i}
              className={cn(
                "leading-[1.9] tracking-[0.02em]",
                variant === "vellum" ? "text-[15px] italic" : "text-[16px]"
              )}
              style={{ color: palette.bodyInk }}
            >
              {line}
            </p>
          ))}
        </div>
      </main>

      {/* 底部：署名 + 小动物 */}
      <footer className="relative z-10 flex items-end justify-between px-8 pb-7 pt-4">
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] tracking-[0.2em]"
            style={{ color: palette.subtle }}
          >
            {authorName}
          </span>
          <span
            className="text-[10px] tracking-[0.2em]"
            style={{ color: palette.subtleSoft }}
          >
            由排版小动物制作
          </span>
        </div>
        <div className="h-[70px] w-[78px]" style={{ color: palette.sprite }}>
          <LetterSprite fade={spriteFade} className="h-full w-full" />
        </div>
      </footer>
    </div>
  );
});

/* ------------------------------------------------------------------ */

type Palette = {
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
  moonLit: string;
  moonDark: string;
  font: string;
};

function getPalette(variant: PaperVariant): Palette {
  switch (variant) {
    case "plain":
      // 素笺 · TinyType 风
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
        moonLit: "#c9a567",
        moonDark: "#7a6338",
        font: 'var(--font-time-serif), "Noto Serif SC", "STSong", serif'
      };
    case "vellum":
      // 羊皮金笺 · Sonnet 18 风（用于冻结的思路）
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
        moonLit: "#f0d498",
        moonDark: "#6b4a22",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
    case "ink":
      // 夜墨笺 · Healthy 风（深色 + 银蓝光泽）
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
        moonLit: "#e4ecf5",
        moonDark: "#3a4656",
        font: 'var(--font-time-serif), "Noto Serif SC", serif'
      };
  }
}
