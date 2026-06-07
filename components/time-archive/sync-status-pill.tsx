import { cn } from "@/lib/utils";

import type { SyncSummary } from "@/components/time-archive/sync-status";

export function SyncStatusPill(props: { summary: SyncSummary; surface: "dark" | "light"; onClick: () => void }) {
  const dotClass =
    props.summary.tone === "good"
      ? "bg-emerald-400"
      : props.summary.tone === "working"
        ? "bg-sky-400"
        : props.summary.tone === "warning"
          ? "bg-amber-400"
          : props.surface === "light"
            ? "bg-slate-400"
            : "bg-slate-500";
  const shellClass =
    props.surface === "light"
      ? "border-slate-300/50 bg-white/70 text-slate-700 hover:bg-white"
      : "border-white/[0.05] bg-black/25 text-slate-200/72 hover:bg-black/35 hover:text-slate-100";

  return (
    <button
      type="button"
      className={cn(
        "pointer-events-auto inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[11px] tracking-[0.08em] backdrop-blur transition-colors",
        shellClass
      )}
      onClick={props.onClick}
      aria-label={`同步状态：${props.summary.label}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      <span>{props.summary.label}</span>
    </button>
  );
}
