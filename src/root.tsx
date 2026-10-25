import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import NotFound from "@/app/not-found";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "./app/globals.css";
import { AppLayout } from "@/components/layout/app-layout";
import { Providers } from "@/components/providers";
import { pageMeta, siteName } from "./routes/metadata";

export const meta = () =>
  pageMeta(
    "ACGN Fans 流式媒体内容分享平台",
    `${siteName} 提供丰富的动画、漫画、游戏、轻小说相关内容。`,
    "/",
  );

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <Meta />
        <Links />
        <link rel="icon" href="/icon" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-icon" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml" />
        <link rel="author" href="/llms.txt" />
        <link rel="help" href="/llms-full.txt" />
        <meta
          name="google-site-verification"
          content="Makh0QpTE_cFQ_WZF3qShdl6cTicB36RA97vazztCDg"
        />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="application-name" content={siteName} />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  if (status === 404)
    return (
      <AppLayout>
        <NotFound />
      </AppLayout>
    );
  return (
    <div className="container py-20 text-center">
      <h1 className="text-3xl font-bold">{status === 404 ? "页面不存在" : "页面加载失败"}</h1>
      <p className="mt-4 text-muted-foreground">
        {status === 404 ? "该资源可能已被删除或尚未公开。" : "请稍后重试。"}
      </p>
      <a className="inline-block mt-6 text-primary" href="/">
        返回首页
      </a>
    </div>
  );
}
