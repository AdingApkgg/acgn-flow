/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

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

// Auth 相关路径 - 永不缓存
const AUTH_PATHS = /\/api\/auth\//i;

// 跨域资源 - 不缓存（避免 opaque 响应导致 Cache.put 失败）
const isCrossOrigin = (url: URL) => url.origin !== self.location.origin;

const serwist = new Serwist({
  // 禁用预缓存，只使用运行时缓存（避免路径不匹配问题）
  precacheEntries: [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 跨域请求 - 不缓存（opaque 响应无法通过 Cache.put 缓存）
    {
      matcher: ({ url }) => isCrossOrigin(url),
      handler: new NetworkOnly(),
    },
    // 视频、音频、大文件 - 不缓存，直接走网络
    {
      matcher: ({ url }) => EXCLUDED_EXTENSIONS.test(url.pathname) || EXCLUDED_PATHS.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // Auth 相关 API - 永不缓存，确保 session 状态实时
    {
      matcher: ({ url }) => AUTH_PATHS.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // 静态资源 - 缓存优先（仅同源）
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          }),
        ],
      }),
    },
    // 图片 - 缓存优先（仅同源，限制大小）
    {
      matcher: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 字体 - 缓存优先（仅同源）
    {
      matcher: /\.(?:woff|woff2|ttf|otf|eot)$/i,
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          }),
        ],
      }),
    },
    // API 请求 - 网络优先（只缓存成功响应）
    {
      matcher: /\/api\/.*/i,
      handler: new NetworkFirst({
        cacheName: "api",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
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
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // JS/CSS 资源 - 旧缓存优先（仅同源）
    {
      matcher: /\.(?:js|css)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "js-css",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
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
