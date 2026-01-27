import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

// 思源黑体简体中文 - 主要字体
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: true,
});

// 思源黑体日文 - 日文内容回退
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${siteName} - ACGN Fans 流式媒体内容分享平台`,
    template: `%s | ${siteName}`,
  },
  description: `${siteName} 是一个 ACGN Fans 流式媒体内容分享平台，提供丰富的动画、漫画、游戏、轻小说相关内容。`,
  keywords: ["ACGN", "动漫", "视频", "anime", "动画", "漫画", "游戏", "轻小说", "二次元"],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: baseUrl,
    siteName: siteName,
    title: `${siteName} - ACGN Fans 流式媒体内容分享平台`,
    description: `${siteName} 是一个 ACGN Fans 流式媒体内容分享平台，提供丰富的动画、漫画、游戏、轻小说相关内容。`,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} - ACGN Fans 流式媒体内容分享平台`,
    description: `${siteName} 是一个 ACGN Fans 流式媒体内容分享平台`,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteName,
  },
  applicationName: siteName,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml" />
        <link rel="apple-touch-icon" href="/apple-icon" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${notoSansSC.variable} ${notoSansJP.variable} font-sans`}>
        <Providers>
          <div className="relative min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
