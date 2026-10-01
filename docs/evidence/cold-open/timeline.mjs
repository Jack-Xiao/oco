// Prints one cold-open run as a merged timeline: screen frames (editor-area luminance), chat-document states,
// paint marks, resources and bridge requests, all in ms after the click.
//   node timeline.mjs <label> [open=0]
import fs from "node:fs"
import path from "node:path"
const S = path.dirname(new URL(import.meta.url).pathname)
const [label, kArg = "0"] = process.argv.slice(2)
const run = JSON.parse(fs.readFileSync(path.join(S, `${label}.json`), "utf8"))
const r = run.results[Number(kArg)]
const ev = []
let prev
for (const f of r.frames) {
  const key = `${Math.round(f.lum / 3)}|${Math.round(f.sd / 3)}`
  if (key !== prev) ev.push([f.t, "screen", `lum ${f.lum} sd ${f.sd} (${f.file})`])
  prev = key
}
for (const s of r.samples) ev.push([s.t, "doc", `boot=${+s.boot} splash=${+s.splash} kids=${s.kids} text=${s.text} prompt=${+s.prompt} turns=${s.turns} first=${s.first ? "y" : "-"} bg=${s.bg} comps=[${s.comps.slice(0, 120)}]`])
for (const [n, t] of r.paint ?? []) ev.push([t, "paint", n])
ev.push([r.docStartMs, "doc", "document start (timeOrigin)"])
for (const e of r.resources) if (e.end - e.start > 30 || e.decoded > 100000) ev.push([e.start, "res", `${e.name} -> ${e.end} (${e.end - e.start} ms, enc ${e.encoded} dec ${e.decoded})`])
for (const f of r.fetches) ev.push([f.t, "fetch", `${f.req} head ${f.head} end ${f.end} ${f.bytes} B`])
ev.sort((a, b) => a[0] - b[0])
console.log(`${label} #${r.k} ${r.name} done ${r.doneMs} ms workbench=${JSON.stringify(r.workbench)} nav=${JSON.stringify(r.nav)}`)
for (const [t, kind, s] of ev) console.log(String(t).padStart(6), kind.padEnd(6), s)
