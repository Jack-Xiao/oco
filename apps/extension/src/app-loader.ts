import * as fs from "node:fs"
import * as nodePath from "node:path"

// The app chunk is ~4 MB (1.2 MB gzipped) and the VS Code resource channel sends files as they are, so every new
// panel over Remote-SSH pulled all of it through the tunnel. scripts/build-webview.sh ships `app-*.js.gz` beside it;
// the page fetches that, inflates it, and serves the result to the module graph as a blob through an import map.
// The inflated text must not depend on its own URL: `import.meta.url` and relative dynamic imports are pinned to the
// original location (lazy chunks and the worker URL keep loading from the resource origin). Lazy chunks list the app
// chunk among their preload deps, which would fetch the 4 MB file anyway: Vite's preload helper skips a dep that
// already has a `link[href]`, so an inert (rel-less) link for it is added.

export type PackedApp = { entry: string; app: string }

/** The entry script and the app chunk it imports, when the build left a `.gz` for the chunk. */
export function findPackedApp(chatDir: string, html: string): PackedApp | undefined {
  try {
    const entry = /<script[^>]*\ssrc="\.\/assets\/(index-[\w-]+\.js)"/.exec(html)?.[1]
    if (!entry) return
    const app = /import\("\.\/(app-[\w-]+\.js)"\)/.exec(fs.readFileSync(nodePath.join(chatDir, "assets", entry), "utf8"))?.[1]
    if (!app || !fs.existsSync(nodePath.join(chatDir, "assets", `${app}.gz`))) return
    return { entry, app }
  } catch {
    return
  }
}

/** Page-side source of the original app text -> the text served as a blob (same behaviour, absolute URLs). */
export const INFLATED_REWRITE = `t=t.split("import.meta.url").join(JSON.stringify(A)).split('import("./').join('import("'+D).split('from"./').join('from"'+D)`

/** Inline script that stands in for the entry `<script type="module">`. Any failure falls back to the plain entry. */
export function loaderScript(base: string, nonce: string, p: PackedApp): string {
  const dir = `${base}assets/`
  return `<script nonce="${nonce}">(()=>{const D=${JSON.stringify(dir)},A=D+${JSON.stringify(p.app)},add=(s)=>{s.nonce=${JSON.stringify(nonce)};document.head.append(s)};` +
    `const entry=()=>{const s=document.createElement("script");s.type="module";s.crossOrigin="";s.src=D+${JSON.stringify(p.entry)};add(s)};` +
    `fetch(A+".gz").then(async(r)=>{if(!r.ok||!r.body)throw 0;let t=await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();${INFLATED_REWRITE};` +
    `const m=document.createElement("script");m.type="importmap";m.textContent=JSON.stringify({imports:{[A]:URL.createObjectURL(new Blob([t],{type:"text/javascript"}))}});add(m);const l=document.createElement("link");l.href=A;document.head.append(l)}).catch(()=>{}).then(entry)})()</script>`
}
