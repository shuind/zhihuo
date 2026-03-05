import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "知惑 · 时间档案馆",
  description: "把疑问放进时间，也放进思路。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
