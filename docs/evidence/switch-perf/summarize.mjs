// Summarise switch-probe runs: node summarize.mjs ab-base2 ab-fix2 ...
// shown = ms from the sidebar click until the target session's own rows (or its empty state) are painted.
import fs from "node:fs"
import path from "node:path"
const S = path.dirname(new URL(import.meta.url).pathname)
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null)
const rows = []
for (const label of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(path.join(S, `${label}.json`), "utf8"))
  const r = d.results
  const first = r.filter((x) => x.round === 0 && x.i >= 2)
  const revisit = r.filter((x) => x.round === 1)
  const shown = (xs) => xs.map((x) => x.turnsMs).filter((v) => v !== null)
  rows.push({
    label,
    variant: d.variant,
    open: r[0]?.turnsMs,
    firstSwitch: r[1]?.turnsMs,
    firstVisitMed: med(shown(first)),
    firstVisitMax: Math.max(...shown(first)),
    blankSwitches: first.filter((x) => x.blankFrames > 0).length + "/" + first.length,
    revisitMed: med(shown(revisit)),
    revisitMax: Math.max(...shown(revisit)),
    reloads: r.filter((x) => x.reload).length,
  })
}
console.table(rows)
