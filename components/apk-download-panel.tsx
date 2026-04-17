"use client";

import { useState } from "react";

type ApkDownloadPanelProps = {
  href: string | null;
  available: boolean;
  localFile: boolean;
  initialCount: number;
};

function formatCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0";
  return new Intl.NumberFormat("zh-CN").format(Math.floor(value));
}

export function ApkDownloadPanel({ href, available, localFile, initialCount }: ApkDownloadPanelProps) {
  const [count, setCount] = useState(Math.max(0, Math.floor(initialCount)));
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!available || !href) return;
    setPending(true);
    // 乐观更新
    setCount((current) => current + 1);
    try {
      const response = await fetch("/v1/apk/download-count", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" }
      });
      if (response.ok) {
        const data = (await response.json().catch(() => null)) as { total?: number } | null;
        if (typeof data?.total === "number" && Number.isFinite(data.total)) {
          setCount(data.total);
        }
      }
    } catch {
      // 静默失败，不影响下载体验
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {available && href ? (
        <a
          href={href}
          download={localFile ? "zhihuo-latest.apk" : undefined}
          onClick={handleClick}
          aria-busy={pending}
          className="group inline-flex items-center justify-center rounded-full bg-[#2f2a24] px-12 py-3.5 text-base font-normal tracking-[0.18em] text-[#f6f2ea] transition hover:bg-[#3d362e] focus:outline-none focus:ring-2 focus:ring-[#a07a3a]/40 focus:ring-offset-2 focus:ring-offset-[#f6f2ea]"
        >
          下载 APK
        </a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full border border-[#2f2a24]/15 bg-transparent px-12 py-3.5 text-base tracking-[0.18em] text-[#8b8379]">
          暂未发布
        </span>
      )}

      <p className="text-xs tracking-[0.22em] text-[#8b8379]">
        已下载 <span className="mx-1 font-medium text-[#2f2a24] tabular-nums">{formatCount(count)}</span> 次
      </p>
    </div>
  );
}
