import { fileURLToPath } from "node:url";
import devServer, { defaultOptions } from "@hono/vite-dev-server";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      tailwindcss(),
      devServer({
        entry: "src/server/index.ts",
        // 上传的 MPEG-TS 分片和退役脚本由 Hono 处理，不能进入 Vite 源码转换。
        exclude: defaultOptions.exclude.map((pattern) =>
          typeof pattern === "string"
            ? pattern
            : new RegExp(`^(?!/uploads/|/sw\\.js(?:\\?|$))(?:${pattern.source})`, pattern.flags),
        ),
        ignoreWatching: [
          ...defaultOptions.ignoreWatching,
          "**/build/**",
          "**/uploads/**",
          "**/data/**",
        ],
      }),
      reactRouter(),
    ],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    environments: { ssr: { build: { rollupOptions: { input: "src/server/index.ts" } } } },
    server: { host: "127.0.0.1", port: 3000 },
    // 只有这两个公开值进入客户端；数据库、认证与第三方密钥不暴露。
    define: {
      "import.meta.env.VITE_APP_URL": JSON.stringify(
        process.env.APP_URL || config.APP_URL || "http://localhost:3000",
      ),
      "import.meta.env.VITE_APP_NAME": JSON.stringify(
        process.env.APP_NAME || config.APP_NAME || "ACGN Flow",
      ),
    },
  };
});
