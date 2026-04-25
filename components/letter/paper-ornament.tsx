"use client";

import type { PaperVariant, Palette } from "./letter-paper";

type Props = { variant: PaperVariant; palette: Palette; sealText?: string };

const DEFAULT_SEAL_TEXT = "知";

export function PaperOrnament({ variant, palette, sealText }: Props) {
  const normalizedSealText = normalizeSealText(sealText);

  switch (variant) {
    case "vellum":
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-6 z-[1] -translate-x-1/2"
          width="240"
          height="60"
          viewBox="0 0 240 60"
          fill="none"
        >
          <g stroke={palette.accent} strokeWidth="0.8" strokeLinecap="round" opacity="0.85">
            <path d="M20 38 C 50 10, 90 10, 120 30 C 150 50, 190 50, 220 22" fill="none" />
            <path d="M40 42 C 60 30, 80 30, 100 40" fill="none" strokeWidth="0.5" opacity="0.7" />
            <path d="M140 40 C 160 30, 180 30, 200 38" fill="none" strokeWidth="0.5" opacity="0.7" />
            {[60, 100, 140, 180].map((x, i) => (
              <g key={i} transform={`translate(${x}, 25)`}>
                <circle r="2.2" fill={palette.accent} opacity="0.7" />
                <path d="M-4 -2 L -8 -6 M 4 -2 L 8 -6 M -4 2 L -8 6 M 4 2 L 8 6" strokeWidth="0.5" opacity="0.5" />
              </g>
            ))}
          </g>
        </svg>
      );

    case "ink":
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          preserveAspectRatio="none"
          viewBox="0 0 480 640"
        >
          <g fill={palette.accent} opacity="0.6">
            {Array.from({ length: 40 }).map((_, i) => {
              const seed = i * 37;
              const x = (seed * 13) % 480;
              const y = (seed * 29) % 640;
              const r = ((seed % 7) + 1) * 0.25;
              return <circle key={i} cx={x} cy={y} r={r} opacity={0.3 + ((seed % 5) / 10)} />;
            })}
          </g>
        </svg>
      );

    case "rice":
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute bottom-16 right-7 z-[1]"
          width="56"
          height="56"
          viewBox="0 0 56 56"
        >
          <rect x="4" y="4" width="48" height="48" fill={palette.accent} opacity="0.78" />
          <g fill="#fbf8f1" fontFamily='"Noto Serif SC",serif' fontWeight="700" textAnchor="middle">
            <SealText text={normalizedSealText} layout="rice" />
          </g>
        </svg>
      );

    case "tide":
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1]"
          height="110"
          viewBox="0 0 480 110"
          preserveAspectRatio="none"
        >
          <g fill="none" stroke={palette.accent} strokeWidth="0.6" opacity="0.5">
            <path d="M0 80 Q 60 60, 120 80 T 240 80 T 360 80 T 480 80" />
            <path d="M0 90 Q 60 74, 120 90 T 240 90 T 360 90 T 480 90" opacity="0.7" />
            <path d="M0 100 Q 60 86, 120 100 T 240 100 T 360 100 T 480 100" opacity="0.5" />
          </g>
          <g stroke={palette.accent} strokeWidth="0.5" opacity="0.4">
            <line x1="40" y1="30" x2="440" y2="30" />
          </g>
        </svg>
      );

    case "clay":
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
          height="100"
          viewBox="0 0 480 100"
          preserveAspectRatio="none"
        >
          <g fill={palette.accent} opacity="0.7">
            <rect x="30" y="20" width="40" height="40" rx="1" />
            <g fill="#f5e2c8" fontFamily='"Noto Serif SC",serif' fontWeight="700" textAnchor="middle">
              <SealText text={normalizedSealText} layout="clay" />
            </g>
          </g>
          <g stroke={palette.accent} strokeWidth="0.4" opacity="0.35">
            <line x1="100" y1="40" x2="450" y2="40" />
          </g>
        </svg>
      );

    case "plain":
    default:
      return (
        <svg
          aria-hidden
          className="pointer-events-none absolute right-7 top-7 z-[1]"
          width="36"
          height="36"
          viewBox="0 0 36 36"
        >
          <g stroke={palette.accent} strokeWidth="0.7" fill="none" opacity="0.6">
            <path d="M18 6 C 22 12, 22 18, 18 24 C 14 18, 14 12, 18 6 Z" />
            <circle cx="18" cy="28" r="1.2" fill={palette.accent} />
          </g>
        </svg>
      );
  }
}

function normalizeSealText(value: string | undefined) {
  const text = Array.from((value ?? DEFAULT_SEAL_TEXT).replace(/\s+/g, "").trim()).slice(0, 4).join("");
  return text || DEFAULT_SEAL_TEXT;
}

function SealText({ text, layout }: { text: string; layout: "rice" | "clay" }) {
  const chars = Array.from(text);
  const rice = layout === "rice";

  if (chars.length === 1) {
    return (
      <text x={rice ? 28 : 50} y={rice ? 36 : 48} fontSize={rice ? 24 : 22}>
        {chars[0]}
      </text>
    );
  }

  if (chars.length === 2) {
    const x = rice ? 28 : 50;
    const [topY, bottomY] = rice ? [25, 43] : [37, 54];
    return (
      <>
        <text x={x} y={topY} fontSize={rice ? 16 : 14}>{chars[0]}</text>
        <text x={x} y={bottomY} fontSize={rice ? 16 : 14}>{chars[1]}</text>
      </>
    );
  }

  if (chars.length === 3) {
    const top = rice ? { x: 28, y: 22 } : { x: 50, y: 35 };
    const left = rice ? { x: 19, y: 42 } : { x: 42, y: 53 };
    const right = rice ? { x: 37, y: 42 } : { x: 58, y: 53 };
    return (
      <>
        <text x={top.x} y={top.y} fontSize={rice ? 14 : 12}>{chars[0]}</text>
        <text x={left.x} y={left.y} fontSize={rice ? 14 : 12}>{chars[1]}</text>
        <text x={right.x} y={right.y} fontSize={rice ? 14 : 12}>{chars[2]}</text>
      </>
    );
  }

  const positions = rice
    ? [{ x: 18, y: 24 }, { x: 38, y: 24 }, { x: 18, y: 44 }, { x: 38, y: 44 }]
    : [{ x: 42, y: 38 }, { x: 58, y: 38 }, { x: 42, y: 54 }, { x: 58, y: 54 }];

  return (
    <>
      {chars.slice(0, 4).map((char, index) => (
        <text key={`${char}-${index}`} x={positions[index].x} y={positions[index].y} fontSize={rice ? 14 : 12}>
          {char}
        </text>
      ))}
    </>
  );
}
