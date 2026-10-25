// 此模块只在不透明来源的 Flash iframe 内运行，不能导入宿主页组件。
let scriptPromise = null;
const timeout = 20_000;

export function ensureRuffleLoaded(scriptUrl, timeoutMs = timeout) {
  if (typeof window.RufflePlayer?.newest === "function")
    return Promise.resolve(window.RufflePlayer);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.crossOrigin = "anonymous";
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const fail = (message) => {
      cleanup();
      script.remove();
      reject(new Error(message));
    };
    const loaded = () => {
      if (typeof window.RufflePlayer?.newest !== "function") return fail("Ruffle 加载失败");
      cleanup();
      resolve(window.RufflePlayer);
    };
    const failed = () => fail("Ruffle 加载失败");
    const timer = setTimeout(() => fail("Ruffle 加载超时"), timeoutMs);
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export function startRufflePlayer(container, url, onReady, onError, timeoutMs = timeout) {
  let cancelled = false;
  let player = null;
  let timer;
  let cancelLoad;
  const remove = () => {
    player?.remove();
    player = null;
  };
  void (async () => {
    try {
      const assets = new URL("/ruffle/", window.location.href).href;
      const api = await ensureRuffleLoaded(`${assets}ruffle.js`);
      if (cancelled) return;
      player = api.newest().createPlayer();
      player.style.width = "100%";
      player.style.height = "100%";
      container.appendChild(player);
      await Promise.race([
        player.load({
          url,
          publicPath: assets,
          allowScriptAccess: false,
          allowNetworking: "none",
          openUrlMode: "deny",
          credentialAllowList: [],
          socketProxy: [],
          fontSources: [],
          showSwfDownload: false,
          contextMenu: false,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Flash 内容加载超时")), timeoutMs);
          cancelLoad = () => reject(new Error("Flash 内容加载已取消"));
        }),
      ]);
      if (!cancelled) onReady();
    } catch (error) {
      remove();
      if (!cancelled) onError(error);
    } finally {
      clearTimeout(timer);
      cancelLoad = undefined;
    }
  })();
  return () => {
    cancelled = true;
    clearTimeout(timer);
    cancelLoad?.();
    remove();
  };
}

export function bootFlashFrame(url, parentOrigin) {
  // CSP 是网络安全边界；额外强制 Ruffle fetch 匿名 GET、拒绝重定向。
  // 不允许用户内容通过跳转将公开 SWF 请求变成带身份的接口请求。
  const nativeFetch = window.fetch.bind(window);
  const assets = new URL("/ruffle/", window.location.href);
  window.fetch = (input, options) => {
    const request = new Request(input, options);
    const target = new URL(request.url);
    const isAsset =
      target.origin === assets.origin &&
      /^\/ruffle\/[a-zA-Z0-9._-]+\.(?:js|wasm)$/.test(target.pathname);
    if (request.method !== "GET" || (target.href !== url && !isAsset)) {
      return Promise.reject(new TypeError("Flash 网络请求被隔离策略阻止"));
    }
    return nativeFetch(
      new Request(request, { credentials: "omit", mode: "cors", redirect: "error" }),
    );
  };
  const notify = (type) => parent.postMessage({ channel: "acgn-flash", type }, parentOrigin);
  const stop = startRufflePlayer(
    document.body,
    url,
    () => notify("ready"),
    () => notify("error"),
  );
  window.addEventListener("pagehide", stop, { once: true });
}
