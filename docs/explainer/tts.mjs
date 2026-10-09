#!/usr/bin/env node
// 为 oco 讲解页生成逐场景旁白音频。
//
// 用法：
//   node docs/explainer/tts.mjs --engine say               # 本机 macOS 语音，无需密钥
//   GEMINI_API_KEY=... node docs/explainer/tts.mjs --engine gemini
//
// 可选环境变量：
//   GEMINI_TTS_MODEL  默认 gemini-2.5-flash-preview-tts
//   GEMINI_TTS_VOICE  默认 Kore
//   GEMINI_TTS_STYLE  可选的朗读风格前缀（默认空，避免被念出来）
//   SAY_VOICE         默认 Flo (中文（中国大陆）)
//
// 输入：docs/explainer/narration.json（[{ id, text }]）
// 输出：docs/explainer/audio/<id>.mp3 与 audio/manifest.json（每段时长，秒）
// 密钥只从环境变量读取，不写入任何文件或日志。

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "audio");
const engine = process.argv.includes("--engine")
  ? process.argv[process.argv.indexOf("--engine") + 1]
  : "say";
const only = process.argv.includes("--only")
  ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(","))
  : null;

const scenes = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
mkdirSync(outDir, { recursive: true });

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

function duration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]).toString().trim();
  return Number(Number(out).toFixed(2));
}

async function gemini(text, mp3) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("缺少 GEMINI_API_KEY 环境变量");
  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voice = process.env.GEMINI_TTS_VOICE || "Kore";
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${process.env.GEMINI_TTS_STYLE ?? ""}${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
    );
    if (res.status === 429 && attempt < 5) {
      const wait = 15 * attempt;
      console.log(`  429 限流，${wait}s 后重试（第 ${attempt} 次）`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    break;
  }
  if (res.status === 404) console.error(`模型 ${model} 不存在。用 GEMINI_TTS_MODEL 指定 Bob 里使用的 TTS 模型名。`);
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Gemini TTS 返回中没有音频");
  // 返回 base64 的 16-bit PCM，单声道；采样率见 mimeType（通常 rate=24000）。
  const rate = /rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || "24000";
  const pcm = mp3.replace(/\.mp3$/, ".pcm");
  writeFileSync(pcm, Buffer.from(part.inlineData.data, "base64"));
  ffmpeg(["-f", "s16le", "-ar", rate, "-ac", "1", "-i", pcm, "-b:a", "64k", mp3]);
  rmSync(pcm);
}

function say(text, mp3) {
  const voice = process.env.SAY_VOICE || "Flo (中文（中国大陆）)";
  const aiff = mp3.replace(/\.mp3$/, ".aiff");
  execFileSync("say", ["-v", voice, "-r", "190", "-o", aiff, text]);
  ffmpeg(["-i", aiff, "-ac", "1", "-b:a", "64k", mp3]);
  rmSync(aiff);
}

const manifestPath = join(outDir, "manifest.json");
let manifest = {};
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}

for (const scene of scenes) {
  if (only && !only.has(scene.id)) continue;
  const mp3 = join(outDir, `${scene.id}.mp3`);
  if (engine === "gemini") await gemini(scene.text, mp3);
  else say(scene.text, mp3);
  manifest[scene.id] = { engine, seconds: duration(mp3) };
  // 每段写一次清单：中途失败时，已生成的段落和清单仍一致。
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${scene.id}\t${engine}\t${manifest[scene.id].seconds}s`);
}
console.log("完成。请让 Claude 重新发布页面，新音频才会上线。");
