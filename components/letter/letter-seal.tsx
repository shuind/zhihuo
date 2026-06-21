"use client";

export type LetterSealProps = {
  visible: boolean;
  dateLabel: string;
  solarTerm: string;
  color?: string;
  size?: number;
};

export function LetterSeal({
  visible,
  dateLabel,
  solarTerm,
  color = "#b93a2a",
  size = 92
}: LetterSealProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-10 top-[42%] z-20 transition-[opacity,transform] duration-[420ms] ease-out"
      style={{
        width: size,
        height: size,
        opacity: visible ? 0.96 : 0,
        transform: visible ? "rotate(-6deg) scale(1)" : "rotate(-14deg) scale(1.25)",
        transitionDelay: visible ? "120ms" : "0ms"
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <filter id="sealRough">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="1.2" />
          </filter>
        </defs>
        <g filter="url(#sealRough)" fill="none" stroke={color} strokeWidth="2.4">
          <circle cx="50" cy="50" r="44" />
          <circle cx="50" cy="50" r="38" strokeWidth="0.7" opacity="0.78" />
        </g>
        <g fill={color} fontFamily='"Noto Serif SC","STSong",serif' textAnchor="middle">
          <text x="50" y="38" fontSize="11" letterSpacing="2">
            {solarTerm}
          </text>
          <line x1="26" y1="44" x2="74" y2="44" stroke={color} strokeWidth="0.6" opacity="0.6" />
          <text x="50" y="60" fontSize="15" fontWeight="600" letterSpacing="1">
            {dateLabel}
          </text>
          <line x1="26" y1="66" x2="74" y2="66" stroke={color} strokeWidth="0.6" opacity="0.6" />
          <text x="50" y="80" fontSize="9" letterSpacing="3" opacity="0.92">
            知惑
          </text>
        </g>
      </svg>
    </div>
  );
}
