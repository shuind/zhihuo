import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Image from "next/image";

import { ApkDownloadPanel } from "@/components/apk-download-panel";
import { getApkDownloadCount } from "@/lib/server/counters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "下载 APK | 知惑 Zhihuo",
  description: "下载知惑 Android APK。"
};

const DEFAULT_APK_PATH = "/downloads/zhihuo-latest.apk";
const DEFAULT_APK_FILE = path.join(process.cwd(), "public", "downloads", "zhihuo-latest.apk");

function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function resolveApkDownload() {
  const configuredUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL?.trim() ?? "";
  if (configuredUrl) {
    return {
      href: configuredUrl,
      version: process.env.NEXT_PUBLIC_APK_VERSION?.trim() || "Android 最新版",
      updatedAt: process.env.NEXT_PUBLIC_APK_UPDATED_AT?.trim() || null,
      sizeLabel: process.env.NEXT_PUBLIC_APK_SIZE?.trim() || null,
      available: true,
      localFile: false
    };
  }

  if (existsSync(DEFAULT_APK_FILE)) {
    const stats = statSync(DEFAULT_APK_FILE);
    return {
      href: DEFAULT_APK_PATH,
      version: process.env.NEXT_PUBLIC_APK_VERSION?.trim() || "Android 最新版",
      updatedAt: process.env.NEXT_PUBLIC_APK_UPDATED_AT?.trim() || null,
      sizeLabel: process.env.NEXT_PUBLIC_APK_SIZE?.trim() || formatBytes(stats.size),
      available: true,
      localFile: true
    };
  }

  return {
    href: null,
    version: process.env.NEXT_PUBLIC_APK_VERSION?.trim() || "尚未发布",
    updatedAt: process.env.NEXT_PUBLIC_APK_UPDATED_AT?.trim() || null,
    sizeLabel: process.env.NEXT_PUBLIC_APK_SIZE?.trim() || null,
    available: false,
    localFile: false
  };
}

export default async function ApkPage() {
  const apk = resolveApkDownload();
  const initialCount = await getApkDownloadCount().catch(() => 0);

  return (
    <main className="min-h-screen w-full overflow-y-auto bg-[#f6f2ea] text-[#2f2a24]">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-16 sm:py-24">
        <header className="flex items-center justify-between text-[#8b8379]">
          <div className="flex items-center gap-2.5">
            <Image
              src="/zhihuo_logo_icon.svg"
              alt="知惑"
              width={20}
              height={20}
              className="h-5 w-5 opacity-80"
            />
            <span className="text-sm tracking-[0.24em]">知惑 · Zhihuo</span>
          </div>
          <a
            href="/"
            className="text-xs tracking-[0.22em] transition hover:text-[#2f2a24]"
          >
            返回首页
          </a>
        </header>

        <section className="mt-20 flex flex-1 flex-col items-center text-center sm:mt-28">
          <p className="text-xs tracking-[0.42em] text-[#a07a3a]">ANDROID · APK</p>

          <h1 className="mt-6 text-balance text-[2rem] font-normal leading-[1.35] text-[#2f2a24] sm:text-[2.4rem]">
            下载知惑 APK
          </h1>

          <div className="mt-12">
            <ApkDownloadPanel
              href={apk.href}
              available={apk.available}
              localFile={apk.localFile}
              initialCount={initialCount}
            />
          </div>

          <dl className="mt-16 grid w-full max-w-sm grid-cols-3 gap-y-5 border-t border-[#2f2a24]/10 pt-8 text-left text-sm">
            <div className="space-y-1.5">
              <dt className="text-[11px] tracking-[0.24em] text-[#8b8379]">版本</dt>
              <dd className="text-[#2f2a24]">{apk.version}</dd>
            </div>
            <div className="space-y-1.5 text-center">
              <dt className="text-[11px] tracking-[0.24em] text-[#8b8379]">大小</dt>
              <dd className="text-[#2f2a24]">{apk.sizeLabel ?? "—"}</dd>
            </div>
            <div className="space-y-1.5 text-right">
              <dt className="text-[11px] tracking-[0.24em] text-[#8b8379]">更新</dt>
              <dd className="text-[#2f2a24]">{apk.updatedAt ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-20 border-t border-[#2f2a24]/10 pt-6 text-center text-[11px] tracking-[0.24em] text-[#8b8379]">
          {apk.available ? "luylu.online" : "请在部署环境配置 APK 文件或下载链接"}
        </footer>
      </div>
    </main>
  );
}
