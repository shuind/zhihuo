"use client";

import dynamic from "next/dynamic";

const TimeArchive = dynamic(() => import("@/components/time-archive").then((mod) => mod.TimeArchive), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen place-items-center bg-slate-950 text-sm tracking-[0.12em] text-slate-300/80">
      正在恢复…
    </div>
  )
});

export function TimeArchiveEntry() {
  return <TimeArchive />;
}
