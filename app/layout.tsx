import type { Metadata, Viewport } from "next";
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
  title: "\u77E5\u60D1 Zhihuo",
  description: "\u628A\u7591\u95EE\u653E\u8FDB\u65F6\u95F4\uff0c\u4E5F\u653E\u8FDB\u601D\u8DEF\u3002",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "\u77E5\u60D1"
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#07090d"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${uiSans.variable} ${timeSerif.variable} ${timeSerif.className} antialiased`}>{children}</body>
    </html>
  );
}
