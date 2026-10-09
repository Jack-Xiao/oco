#!/usr/bin/env node
// 把讲解页的 12 个场景录成 MP4（1920×1080，25 fps），旁白取自 audio/。
//
// 用法：node docs/explainer/record.mjs [--fps 25] [--only s01,s02]
// 依赖：playwright-core（仓库已有）、本机 Google Chrome、ffmpeg。
// 原理：页面 #record 模式暴露 __ocoRender(场景, 秒, 时长, 总进度)，逐帧渲染后截图，
// 截图直接管道给 ffmpeg；每段音频按帧数补齐静音，所以画面与旁白逐帧对齐。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const FPS = Number(arg("--fps", "25"));
const only = arg("--only") ? new Set(arg("--only").split(",")) : null;
const GAP = 0.7; // 场景之间停顿（秒）
const TAIL = 2.0; // 片尾停留
const outDir = join(here, "video");
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(here, "audio", "manifest.json"), "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
await page.goto(pathToFileURL(join(here, "index.html")).href + "#record");
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => typeof window.__ocoRender === "function");

const ids = (await page.evaluate(() => SCENES.map((s) => s.id))).filter((id) => !only || only.has(id));
const plan = ids.map((id, k) => {
  const voice = manifest[id].seconds;
  const frames = Math.round((voice + (k === ids.length - 1 ? TAIL : GAP)) * FPS);
  return { id, index: null, voice, frames };
});
const allIds = await page.evaluate(() => SCENES.map((s) => s.id));
plan.forEach((p) => (p.index = allIds.indexOf(p.id)));
const totalFrames = plan.reduce((a, p) => a + p.frames, 0);

// 1) 旁白：每段补齐到画面时长后拼接
const narration = join(outDir, "narration.m4a");
const inputs = plan.flatMap((p) => ["-i", join(here, "audio", `${p.id}.mp3`)]);
const filters = plan.map((p, k) => {
  const d = (p.frames / FPS).toFixed(4);
  return `[${k}:a]aresample=48000,apad=whole_dur=${d},atrim=0:${d}[a${k}]`;
});
const concat = plan.map((_, k) => `[a${k}]`).join("") + `concat=n=${plan.length}:v=0:a=1[out]`;
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs,
  "-filter_complex", [...filters, concat].join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "128k", narration]);

// 2) 画面：逐帧截图管道给 ffmpeg
const mp4 = join(outDir, only ? "oco-explainer-part.mp4" : "oco-explainer.mp4");
const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-i", narration, "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-movflags", "+faststart", "-shortest", mp4], { stdio: ["pipe", "inherit", "inherit"] });

let done = 0;
const t0 = Date.now();
for (const p of plan) {
  for (let f = 0; f < p.frames; f++) {
    await page.evaluate(([i, t, d, o]) => window.__ocoRender(i, t, d, o), [p.index, f / FPS, p.voice, done / totalFrames]);
    const jpg = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    done++;
  }
  console.log(`${p.id}\t${p.frames} 帧\t累计 ${done}/${totalFrames}\t${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exit ${c}`)))));
await browser.close();
console.log(`完成：${mp4}（${(totalFrames / FPS).toFixed(1)} 秒）`);
