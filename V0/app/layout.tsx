import type { Metadata } from 'next'
import { Noto_Serif_SC, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const notoSerifSC = Noto_Serif_SC({ 
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-serif-sc"
});
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: '时间档案馆',
  description: '保留你曾经问过的事',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${notoSerifSC.variable} font-serif antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
