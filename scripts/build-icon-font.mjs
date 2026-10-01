// Generates apps/extension/media/oco-icons.woff: a one-glyph icon font (U+E000) holding a
// monochrome oco mark for `$(oco-logo)` in the status bar. Geometry follows media/oco-icon.svg
// (C arc + two rings), with thicker strokes so it reads at 16px. Shapes are polygons; outer
// contours are clockwise and ring holes counter-clockwise, so nonzero fill keeps the holes open.
//
//   node scripts/build-icon-font.mjs
//
// Needs network for `npx svg2ttf` / `npx ttf2woff`; the woff is committed, so this only runs
// when the mark changes.
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const OUT = new URL("../apps/extension/media/oco-icons.woff", import.meta.url).pathname
const EM = 1000
const STEPS = 96

// Source coordinates: 100x100, y down, same frame as oco-icon.svg.
const C = { x: 50, y: 50 }
const ARC_R = 26
const ARC_W = 8
const RING_R = 7
const RING_W = 6
const ends = [-45, 45].map((deg) => ({
  x: C.x + ARC_R * Math.cos((deg * Math.PI) / 180),
  y: C.y + ARC_R * Math.sin((deg * Math.PI) / 180),
}))

// Content spans roughly x 20..78, y 20..80; map a 68-unit box centred on it onto the em.
const BOX = 68
const cx = 49.2
const cy = 50
const s = EM / BOX
const tx = (p) => [(p.x - cx + BOX / 2) * s, (cy - p.y + BOX / 2) * s]

const circle = (o, r) =>
  Array.from({ length: STEPS }, (_, i) => {
    const a = (i / STEPS) * 2 * Math.PI
    return tx({ x: o.x + r * Math.cos(a), y: o.y + r * Math.sin(a) })
  })

// Arc band from 45°+δ through 180° to 315°-δ, stopping inside each ring's stroke.
const delta = (2 * Math.asin(RING_R / 2 / ARC_R) * 180) / Math.PI
const band = () => {
  const from = 45 + delta
  const to = 315 - delta
  const pts = []
  for (const [r, a0, a1] of [
    [ARC_R + ARC_W / 2, from, to],
    [ARC_R - ARC_W / 2, to, from],
  ]) {
    for (let i = 0; i <= STEPS; i++) {
      const a = ((a0 + ((a1 - a0) * i) / STEPS) * Math.PI) / 180
      pts.push(tx({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) }))
    }
  }
  return pts
}

// Signed area in y-up space: negative = clockwise.
const area = (pts) => pts.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length]
  return sum + (x1 * y2 - x2 * y1)
}, 0) / 2
const orient = (pts, clockwise) => ((area(pts) < 0) === clockwise ? pts : [...pts].reverse())
const d = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`

const contours = [
  orient(band(), true),
  ...ends.flatMap((o) => [orient(circle(o, RING_R + RING_W / 2), true), orient(circle(o, RING_R - RING_W / 2), false)]),
]

const svg = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"><defs>
<font id="oco-icons" horiz-adv-x="${EM}">
<font-face font-family="oco-icons" units-per-em="${EM}" ascent="${EM}" descent="0"/>
<missing-glyph horiz-adv-x="0"/>
<glyph glyph-name="oco-logo" unicode="&#xE000;" horiz-adv-x="${EM}" d="${contours.map(d).join("")}"/>
</font></defs></svg>
`

const dir = mkdtempSync(join(tmpdir(), "oco-icons-"))
writeFileSync(join(dir, "oco-icons.svg"), svg)
execFileSync("npx", ["-y", "svg2ttf", join(dir, "oco-icons.svg"), join(dir, "oco-icons.ttf")], { stdio: "inherit" })
execFileSync("npx", ["-y", "ttf2woff", join(dir, "oco-icons.ttf"), OUT], { stdio: "inherit" })
console.log(`wrote ${OUT}`)
