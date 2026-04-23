"use client";

/**
 * 笺纸右下角的小动物。极简线稿，不说话、不提醒。
 * 描边色由 CSS 变量 --sprite-stroke 控制，以便在不同笺纸上协调。
 */

type Props = {
  /** 墨色淡化，0 = 全黑，1 = 淡到几乎消失。用于"越久远越褪色" */
  fade?: number;
  className?: string;
};

export function LetterSprite({ fade = 0, className }: Props) {
  const opacity = Math.max(0.25, 1 - fade * 0.65);
  return (
    <svg
      viewBox="0 0 120 110"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
      aria-hidden
    >
      <g
        fill="none"
        stroke="var(--sprite-stroke, currentColor)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* 桌面 */}
        <line x1="8" y1="96" x2="112" y2="96" />

        {/* 猫身体 */}
        <path d="M44 96 C40 82, 42 68, 52 60 C62 52, 78 54, 84 64 C90 74, 88 90, 84 96 Z" />

        {/* 左耳 */}
        <path d="M52 60 L46 46 L58 54" />
        {/* 右耳 */}
        <path d="M74 56 L78 44 L84 58" />

        {/* 头与身体分界 */}
        <path d="M52 62 C60 66, 74 66, 82 62" opacity="0.6" />

        {/* 眼睛（眯着） */}
        <path d="M58 58 q2 -1.2 4 0" />
        <path d="M70 58 q2 -1.2 4 0" />

        {/* 鼻 */}
        <path d="M65 62 q1 1 2 0" />

        {/* 左手端杯 */}
        <path d="M50 78 L44 74" />
        <rect x="36" y="70" width="10" height="8" rx="1.2" />
        {/* 杯中热气 */}
        <path d="M39 66 q1 -3 -0.5 -6" opacity="0.55" />
        <path d="M43 66 q1 -3 -0.5 -6" opacity="0.55" />

        {/* 尾巴 */}
        <path d="M82 90 q10 -2 14 6" opacity="0.8" />
      </g>
    </svg>
  );
}
