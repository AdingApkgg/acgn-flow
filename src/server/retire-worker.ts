// 此脚本仅替换已安装的旧 /sw.js，不注册新缓存或拦截任何请求。
export const retireWorker = String.raw`
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const oldNames = new Set(["static-assets", "images", "fonts", "api", "pages", "js-css"]);
    const appPath = /^(?:\/_next\/|\/api\/trpc(?:\/|$)|\/(?:$|search(?:\?|$)|tags(?:\/|$)|tag\/|video\/|user\/|comments(?:\/|$)|login(?:\/|$)|register(?:\/|$)|forgot-password(?:\/|$)|upload(?:\/|$)|my-videos(?:\/|$)|favorites(?:\/|$)|history(?:\/|$)|profile(?:\/|$)|settings(?:\/|$)|dashboard(?:\/|$)))/;
    for (const name of await caches.keys()) {
      if (!oldNames.has(name)) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        // 通用缓存名可能被其他应用共享，只删除本站已识别的旧应用条目。
        if (url.origin === self.location.origin && appPath.test(url.pathname)) await cache.delete(request);
      }
    }
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
`;
