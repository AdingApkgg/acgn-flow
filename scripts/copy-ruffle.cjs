const { cpSync, existsSync, mkdirSync, rmSync, readdirSync } = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "@ruffle-rs", "ruffle");
const dest = path.join(__dirname, "..", "public", "ruffle");

if (!existsSync(src)) {
  console.log("[copy-ruffle] @ruffle-rs/ruffle not installed, skipping.");
  process.exit(0);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

const entries = readdirSync(src);
for (const entry of entries) {
  if (entry.endsWith(".map")) continue;
  if (entry.startsWith("LICENSE")) continue;
  if (entry === "package.json" || entry === "README.md") continue;

  cpSync(path.join(src, entry), path.join(dest, entry));
}

console.log("[copy-ruffle] Ruffle assets copied to public/ruffle/");
