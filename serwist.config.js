/** @type {import("@serwist/cli").SerwistConfigInput} */
const config = {
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // 禁用预缓存：避免 Next.js 静态资源路径不匹配问题
  // 改用运行时缓存策略
  globDirectory: "public",
  globPatterns: [],
  injectionPoint: undefined,
};

module.exports = config;
