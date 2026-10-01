// Summarises cold-open probe runs: per open, when the session's own content was on screen, and what the editor area
// showed before that, from the screencast: runs of frames grouped into "editor" (VS Code's empty editor colour),
// "dark" (clearly darker than it, e.g. the page background with nothing on it) and "other" (skeleton, splash, ...).
// shown: the chat document has the session's turns and composer; visible: the first screen frame with content after
// that (the screen can lag the document when the page is busy).
//   node summarize.mjs <label>...
import fs from "node:fs"
import path from "node:path"
const S = path.dirname(new URL(import.meta.url).pathname)
const rows = []
for (const label of process.argv.slice(2)) {
  const run = JSON.parse(fs.readFileSync(path.join(S, `${label}.json`), "utf8"))
  for (const r of run.results) {
    const shown = r.samples.find((s) => s.prompt && s.turns > 0)?.t ?? r.samples.find((s) => s.prompt)?.t
    const editor = r.frames[0]?.lum ?? 31
    const visible = shown === undefined ? undefined : r.frames.find((f) => f.t >= shown - 50 && f.sd >= 15)?.t
    const before = r.frames.filter((f) => f.t > 0 && f.t <= (shown ?? Infinity) + 40)
    // Consecutive frames in the same class form one visible phase; a phase lasts until the next frame.
    const cls = (f) => (Math.abs(f.lum - editor) <= 3 && f.sd <= 8 ? "editor" : f.lum <= editor - 12 && f.sd <= 12 ? "dark" : "other")
    const phases = []
    for (const f of before) {
      const c = cls(f)
      if (phases.at(-1)?.c === c) continue
      phases.push({ c, t: f.t })
    }
    const end = (i) => (phases[i + 1]?.t ?? shown ?? 0)
    const darkMs = phases.reduce((n, p, i) => n + (p.c === "dark" ? end(i) - p.t : 0), 0)
    const splash = r.samples.some((s) => s.splash && !s.boot)
    const health = r.fetches.find((f) => /health/.test(f.req))
    const msg = r.fetches.find((f) => /\/message\?limit/.test(f.req))
    rows.push({
      label, k: r.k, variant: run.variant, doc: r.docStartMs, health: health ? health.t : "-", msgSent: msg?.t, msgEnd: msg?.end, shown, visible,
      phases: phases.map((p) => `${p.c}@${p.t}`).join(" "), darkMs, splashSeen: splash,
    })
  }
}
console.table(rows)
