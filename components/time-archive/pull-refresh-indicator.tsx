"use client";

import { cn } from "@/lib/utils";

export function PullRefreshIndicator(props: {
  thresholdPx: number;
  state: {
    phase: "idle" | "pulling" | "ready" | "refreshing" | "done" | "offline";
    distance: number;
    message: string;
  };
}) {
  const visible = props.state.phase !== "idle";
  const progress =
    props.state.phase === "refreshing" || props.state.phase === "done" || props.state.phase === "offline"
      ? 1
      : Math.min(1, props.state.distance / props.thresholdPx);
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+10px)] z-50 -translate-x-1/2 transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      )}
      style={{
        transform: `translate(-50%, ${visible ? Math.min(26, props.state.distance * 0.18) : -12}px)`
      }}
    >
      <div className="flex items-center gap-2 rounded-full border border-slate-300/40 bg-white/92 px-3 py-1.5 text-xs text-slate-800 shadow-lg backdrop-blur">
        <span
          className={cn(
            "grid h-4 w-4 place-items-center rounded-full border border-slate-400/50",
            props.state.phase === "refreshing" && "animate-spin border-slate-300 border-t-slate-800"
          )}
          aria-hidden="true"
        >
          {props.state.phase === "refreshing" ? null : (
            <span
              className="h-2 w-2 rounded-full bg-slate-800 transition-transform"
              style={{ transform: `scale(${Math.max(0.3, progress)})` }}
            />
          )}
        </span>
        <span>{props.state.message}</span>
      </div>
    </div>
  );
}
