import type { SerwistCliOptions } from "@serwist/cli";

export default {
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  globDirectory: ".next/static",
  globPatterns: ["**/*.{js,css,woff,woff2}"],
  globIgnores: ["**/node_modules/**/*"],
} satisfies SerwistCliOptions;
