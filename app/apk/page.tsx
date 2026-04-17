import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "下载 APK | 知惑 Zhihuo",
  description: "下载知惑 Android APK，安装后即可在手机上使用。"
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

export default function ApkPage() {
  const apk = resolveApkDownload();

  return (
    <main className="min-h-screen overflow-hidden bg-[#0a1219] text-stone-100">
      <div className="relative isolate">
        <div className="absolute inset-x-0 top-[-18rem] h-[32rem] bg-[radial-gradient(circle_at_top,rgba(233,186,92,0.26),transparent_58%)]" />
        <div className="absolute inset-x-0 top-[18rem] h-[36rem] bg-[radial-gradient(circle_at_center,rgba(71,133,149,0.16),transparent_62%)]" />

        <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-14 sm:px-10 lg:px-16">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm text-stone-200/88 backdrop-blur">
                <Image src="/zhihuo_logo_icon.svg" alt="知惑" width={22} height={22} className="h-[22px] w-[22px]" />
                <span>知惑 Android 下载页</span>
              </div>

              <div className="space-y-5">
                <p className="text-sm uppercase tracking-[0.38em] text-[#d9b46b]">Luylu.online / APK</p>
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-stone-50 sm:text-5xl lg:text-6xl">
                  在手机上安装知惑，
                  <br />
                  把疑问继续留在手边。
                </h1>
                <p className="max-w-2xl text-base leading-8 text-stone-300/86 sm:text-lg">
                  这个页面用于分发 Android APK。用户下载后即可直接安装；如果你的站点启用了云同步，APP 会连接
                  `luylu.online` 上的正式服务。
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                {apk.available && apk.href ? (
                  <a
                    href={apk.href}
                    download={apk.localFile ? "zhihuo-latest.apk" : undefined}
                    className="inline-flex items-center justify-center rounded-full bg-[#f2c36c] px-7 py-3.5 text-sm font-semibold text-[#11161d] transition hover:bg-[#ffd186]"
                  >
                    下载 APK
                  </a>
                ) : (
                  <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-white/8 px-7 py-3.5 text-sm font-semibold text-stone-300/70">
                    APK 暂未发布
                  </span>
                )}

                <a
                  href="/"
                  className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/4 px-7 py-3.5 text-sm font-semibold text-stone-100 transition hover:bg-white/10"
                >
                  返回首页
                </a>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">当前版本</p>
                  <p className="mt-3 text-lg font-medium text-stone-100">{apk.version}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">包体大小</p>
                  <p className="mt-3 text-lg font-medium text-stone-100">{apk.sizeLabel ?? "页面未配置"}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">更新时间</p>
                  <p className="mt-3 text-lg font-medium text-stone-100">{apk.updatedAt ?? "页面未配置"}</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 -translate-x-4 translate-y-4 rounded-[2rem] bg-[#f2c36c]/14 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur">
                <div className="rounded-[1.6rem] border border-white/10 bg-[#0f1921] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.28em] text-stone-400">Android 安装说明</p>
                      <p className="mt-2 text-2xl font-semibold text-stone-50">3 步完成安装</p>
                    </div>
                    <Image src="/icons/icon-192.png" alt="知惑图标" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl" />
                  </div>

                  <div className="mt-6 space-y-4">
                    {[
                      "点击“下载 APK”，等待安装包下载完成。",
                      "如浏览器提示风险，允许本次未知来源安装。",
                      "安装完成后打开 APP，使用正式账号登录即可同步。"
                    ].map((item, index) => (
                      <div key={item} className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2c36c] text-sm font-semibold text-[#11161d]">
                          {index + 1}
                        </div>
                        <p className="pt-1 text-sm leading-7 text-stone-300/88">{item}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-dashed border-[#f2c36c]/28 bg-[#f2c36c]/8 p-4 text-sm leading-7 text-stone-200/88">
                    {apk.available
                      ? "如果你替换了 APK 文件，重新部署站点后这里会自动提供新版本。"
                      : "当前页面还没有检测到可下载 APK。你可以设置 NEXT_PUBLIC_APK_DOWNLOAD_URL，或把 APK 放到 public/downloads/zhihuo-latest.apk。"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
