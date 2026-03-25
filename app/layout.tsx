import type { Metadata } from "next";
import { IBM_Plex_Sans, Noto_Serif_SC } from "next/font/google";

import "./globals.css";

const uiSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui-sans",
  display: "swap"
});

const timeSerif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-time-serif",
  display: "swap"
});

export const metadata: Metadata = {
  title: "\u77E5\u60D1\u00B7\u8BA9\u601D\u8003\u81EA\u7136\u751F\u957F",
  description: "\u628A\u7591\u95EE\u653E\u8FDB\u65F6\u95F4\uff0c\u4E5F\u653E\u8FDB\u601D\u8DEF\u3002"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${uiSans.variable} ${timeSerif.variable} ${timeSerif.className} antialiased`}>{children}</body>
    </html>
  );
}
