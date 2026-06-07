"use client";

import dynamic from "next/dynamic";

const TimeArchive = dynamic(() => import("@/components/time-archive").then((mod) => mod.TimeArchive), {
  ssr: false
});

export function TimeArchiveEntry() {
  return <TimeArchive />;
}
