/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 不缓存的文件类型（视频、音频、大文件）
const EXCLUDED_EXTENSIONS = /\.(?:mp4|webm|mkv|avi|mov|wmv|flv|m4v|mp3|wav|ogg|flac|m4a|aac|zip|rar|7z|tar|gz|pdf)$/i;

// 不缓存的路径
const EXCLUDED_PATHS = /\/uploads\//i;

const serwist = new Serwist({
  // 禁用预缓存，只使用运行时缓存（避免路径不匹配问题）
  precacheEntries: self.__SW_MANIFEST || [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 视频、音频、大文件 - 不缓存，直接走网络
    {
      matcher: ({ url }) => EXCLUDED_EXTENSIONS.test(url.pathname) || EXCLUDED_PATHS.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // 静态资源 - 缓存优先
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          }),
        ],
      }),
    },
    // 图片 - 缓存优先（限制大小）
    {
      matcher: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 字体 - 缓存优先
    {
      matcher: /\.(?:woff|woff2|ttf|otf|eot)$/i,
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          }),
        ],
      }),
    },
    // API 请求 - 网络优先
    {
      matcher: /\/api\/.*/i,
      handler: new NetworkFirst({
        cacheName: "api",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 5, // 5 minutes
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // HTML 页面 - 网络优先
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // JS/CSS 资源 - 旧缓存优先
    {
      matcher: /\.(?:js|css)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "js-css",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 注意：不再有通配符规则，未匹配的请求直接走网络
  ],
});

serwist.addEventListeners();
