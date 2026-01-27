/** @type {import("@serwist/cli").SerwistConfigInput} */
const config = {
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  globDirectory: ".next/static",
  globPatterns: ["**/*.{js,css,woff,woff2}"],
  globIgnores: ["**/node_modules/**/*"],
};

module.exports = config;
