#!/usr/bin/env node
// Build the M5 animated mockup from its template, timeline and the M4 "now" screenshot.
// Usage: node scripts/runtime-m5-mockup-build.mjs [--check]
//   --check  rebuild into memory and exit 1 if the committed output differs.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SPECS = path.join(ROOT, "docs/superpowers/specs")
const SRC = path.join(SPECS, "runtime-m5-mockup.src.html")
const TIMELINE = path.join(SPECS, "runtime-m5-timeline.json")
const SHOT = path.join(SPECS, "runtime-m5-now-shot.webp")
const OUT = path.join(SPECS, "runtime-m5-animated-mockup.html")

const src = fs.readFileSync(SRC, "utf8")
if (!src.includes("/*__TIMELINE__*/")) throw new Error("template has no /*__TIMELINE__*/ slot")
if (!src.includes("__SHOT_DATA_URI__")) throw new Error("template has no __SHOT_DATA_URI__ slot")
const timeline = fs.readFileSync(TIMELINE, "utf8")
JSON.parse(timeline) // fail early on a broken timeline
const shot = "data:image/webp;base64," + fs.readFileSync(SHOT).toString("base64")
const html = src.replace("/*__TIMELINE__*/", () => timeline).replace("__SHOT_DATA_URI__", () => shot)

if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : ""
  if (cur !== html) { console.error("runtime-m5-animated-mockup.html is stale; run: node scripts/runtime-m5-mockup-build.mjs"); process.exit(1) }
  console.log("mockup up to date")
} else {
  fs.writeFileSync(OUT, html)
  console.log("wrote", path.relative(ROOT, OUT), html.length, "bytes")
}
