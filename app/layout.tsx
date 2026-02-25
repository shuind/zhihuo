import type { Metadata } from "next";

import { MainNav } from "@/components/main-nav";
import { Providers } from "@/components/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "知惑 Zhihuo — 让疑惑自然生长",
  description: "把你的疑问放进来。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <MainNav />
          <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 md:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
