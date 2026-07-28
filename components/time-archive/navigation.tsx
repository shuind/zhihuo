"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopTab(props: { label: string; active: boolean; onClick: () => void; daytime: boolean; subtle?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "min-h-10 rounded-full border px-3.5 text-xs tracking-[var(--tracking-meta)] transition-colors md:min-h-8 md:px-3",
        props.subtle
          ? props.active
            ? "border-white/[0.06] bg-white/[0.03] text-[rgba(236,233,226,0.8)]"
            : "border-white/[0.05] bg-transparent text-[rgba(236,233,226,0.72)] hover:bg-white/[0.04] hover:text-[rgba(248,245,238,0.9)]"
          : props.active
            ? props.daytime
              ? "border-slate-600/35 bg-slate-100/75 text-slate-900"
              : "border-slate-300/40 bg-slate-800/70 text-slate-100"
            : props.daytime
              ? "border-slate-500/15 bg-slate-100/20 text-slate-700 hover:bg-slate-100/65"
              : "border-slate-300/15 bg-slate-900/20 text-slate-300/80 hover:bg-slate-900/50"
      )}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

export function MobileBottomTab(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: "life" | "thinking" | "settings";
}) {
  return (
    <button
      type="button"
      data-active={props.active ? "true" : "false"}
      className="mobile-main-nav-item relative flex h-full w-full flex-col items-center justify-center gap-[2px]"
      onClick={props.onClick}
    >
      <span className="mobile-main-nav-icon" aria-hidden="true">
        <MobileBottomTabIcon icon={props.icon} />
      </span>
      <span className="text-[11px] tracking-[0.08em]">{props.label}</span>
      <span className="mobile-main-nav-indicator absolute bottom-0 h-[2px] w-8 rounded-full" />
    </button>
  );
}

function MobileBottomTabIcon(props: { icon: "life" | "thinking" | "settings" }) {
  if (props.icon === "life") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.25" stroke="currentColor" strokeWidth="1.3" />
        <path d="M9 5.6V9.2L11.2 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (props.icon === "thinking") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4.25 4.8H11.6M4.25 9H13.75M4.25 13.2H10.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="13.8" cy="4.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2.8L9.55 4.42C9.66 4.74 9.96 4.96 10.3 4.99L12.02 5.13C12.76 5.19 13.06 6.12 12.48 6.58L11.14 7.63C10.87 7.84 10.75 8.19 10.84 8.51L11.25 10.18C11.42 10.89 10.63 11.45 10.02 11L8.58 9.95C8.3 9.75 7.93 9.75 7.65 9.95L6.21 11C5.6 11.45 4.81 10.89 4.98 10.18L5.39 8.51C5.48 8.19 5.36 7.84 5.09 7.63L3.75 6.58C3.17 6.12 3.47 5.19 4.21 5.13L5.93 4.99C6.27 4.96 6.57 4.74 6.68 4.42L7.23 2.8C7.47 2.1 8.53 2.1 8.77 2.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.1" opacity="0.32" />
    </svg>
  );
}
