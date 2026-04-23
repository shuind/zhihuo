"use client";

import type { MoonPhase } from "@/lib/solar-terms";

type Props = {
  phase: MoonPhase;
  size?: number;
  className?: string;
  /** 前景色（月面亮部） */
  lit?: string;
  /** 背景色（月面暗部 / 描边） */
  dark?: string;
};

export function MoonGlyph({ phase, size = 14, className, lit = "currentColor", dark }: Props) {
  const r = 6;
  const cx = 7;
  const cy = 7;
  const strokeColor = dark ?? lit;

  // 根据相位生成阴影覆盖（简化版）
  let shadow: React.ReactNode = null;
  switch (phase.shape) {
    case "new":
      shadow = <circle cx={cx} cy={cy} r={r} fill={strokeColor} opacity="0.85" />;
      break;
    case "full":
      shadow = null;
      break;
    case "first-quarter":
      shadow = <rect x={cx - r} y={cy - r} width={r} height={r * 2} fill={strokeColor} opacity="0.85" />;
      break;
    case "last-quarter":
      shadow = <rect x={cx} y={cy - r} width={r} height={r * 2} fill={strokeColor} opacity="0.85" />;
      break;
    case "waxing-crescent":
      shadow = <ellipse cx={cx - 1} cy={cy} rx={r - 0.5} ry={r} fill={strokeColor} opacity="0.85" />;
      break;
    case "waning-crescent":
      shadow = <ellipse cx={cx + 1} cy={cy} rx={r - 0.5} ry={r} fill={strokeColor} opacity="0.85" />;
      break;
    case "waxing-gibbous":
      shadow = <ellipse cx={cx - 3} cy={cy} rx={r - 2.5} ry={r} fill={strokeColor} opacity="0.85" />;
      break;
    case "waning-gibbous":
      shadow = <ellipse cx={cx + 3} cy={cy} rx={r - 2.5} ry={r} fill={strokeColor} opacity="0.85" />;
      break;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={className}
      aria-label={phase.name}
    >
      <defs>
        <clipPath id={`moon-clip-${phase.shape}`}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={lit} />
      <g clipPath={`url(#moon-clip-${phase.shape})`}>{shadow}</g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth="0.6" opacity="0.5" />
    </svg>
  );
}
