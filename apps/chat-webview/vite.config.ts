// Builds the oco chat webview against the vendored official app (vendor/opencode @ pinned SHA).
// Module resolution borrows vendor/opencode/packages/app/node_modules (symlinked by scripts/setup.sh).
import { defineConfig, type Plugin } from "vite"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import appPlugin from "../../vendor/opencode/packages/app/vite.js"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Grammars compiled into the markdown worker; every other language is a JSON asset loaded on first use.
const INLINE_LANGS = ["typescript", "tsx", "javascript", "jsx", "json", "jsonc", "shellscript", "diff", "markdown", "python", "go", "rust", "yaml", "toml", "html", "css", "sql"]
const SHIKI_LANG_DIR = "shiki-langs"
const shikiDir = fs.realpathSync(r("../../vendor/opencode/packages/session-ui/node_modules/shiki"))
const langModule = (id: string) => path.join(shikiDir, "../@shikijs/langs/dist", `${id}.mjs`)
const langInfo = async () =>
  (await import(pathToFileURL(path.join(shikiDir, "dist/langs.mjs")).href)).bundledLanguagesInfo as { id: string; aliases?: string[] }[]

/** The markdown worker imports "shiki", whose full bundle references all ~235 grammars and ~60 themes. A
 * self-contained IIFE worker inlines every one of them (~10 MB). Inside the worker build only, "shiki" is
 * replaced by the same API over INLINE_LANGS plus lazily loaded grammar JSON (fetched through the host
 * shim's `__ocoAsset`, see apps/extension/src/panels.ts), and no bundled themes (the worker passes its own). */
function workerShiki(): Plugin {
  const id = "\0oco-worker-shiki"
  return {
    name: "oco:worker-shiki",
    enforce: "pre",
    resolveId: (source, importer) => (source === "shiki" && importer !== id ? id : undefined),
    async load(target) {
      if (target !== id) return
      const aliases: Record<string, string> = {}
      for (const l of await langInfo()) for (const a of [l.id, ...(l.aliases ?? [])]) aliases[a] = l.id
      const dist = (f: string) => JSON.stringify(path.join(shikiDir, "dist", f))
      return [
        `export * from ${dist("core.mjs")}`,
        `import { createBundledHighlighter } from ${dist("core.mjs")}`,
        `import { createOnigurumaEngine } from ${dist("engine-oniguruma.mjs")}`,
        ...INLINE_LANGS.map((l, i) => `import l${i} from ${JSON.stringify(langModule(l))}`),
        `const inline = { ${INLINE_LANGS.map((l, i) => `${JSON.stringify(l)}: l${i}`).join(", ")} }`,
        `const aliases = ${JSON.stringify(aliases)}`,
        // A grammar that cannot be loaded renders as plain text instead of failing the whole message.
        `const plain = (id) => [{ name: id, scopeName: "source.oco-plain." + id, patterns: [] }]`,
        // Each asset holds one grammar plus the ids of the grammars it embeds; those resolve the same way.
        `const cache = new Map()`,
        `const grammars = (id) => {`,
        `  if (!cache.has(id)) cache.set(id, inline[id] ? Promise.resolve(inline[id]) :`,
        `    Promise.resolve().then(() => self.__ocoAsset(${JSON.stringify(SHIKI_LANG_DIR)} + "/" + id + ".json")).then(async (text) => {`,
        `      const asset = JSON.parse(text)`,
        `      return [...(await Promise.all(asset.deps.map(grammars))).flat(), asset.grammar]`,
        `    }))`,
        `  return cache.get(id)`,
        `}`,
        `const load = (id) => grammars(id).then((g) => ({ default: g }), () => ({ default: plain(id) }))`,
        `export const bundledLanguages = Object.fromEntries(Object.entries(aliases).map(([a, id]) => [a, () => load(id)]))`,
        `export const createHighlighter = createBundledHighlighter({ langs: bundledLanguages, themes: {}, engine: () => createOnigurumaEngine(import(${dist("wasm.mjs")})) })`,
      ].join("\n")
    },
  }
}

/** Emits every non-inline grammar as `shiki-langs/<id>.json`: `{ deps: [ids of embedded grammars], grammar }`. */
function shikiLangAssets(): Plugin {
  return {
    name: "oco:shiki-lang-assets",
    apply: "build",
    async generateBundle() {
      // Embedded grammars (e.g. vue's "html-derivative") are not all listed as languages, so walk the deps.
      const todo = (await langInfo()).map((l) => l.id)
      const done = new Set(INLINE_LANGS)
      for (let id; (id = todo.pop()); ) {
        if (done.has(id)) continue
        done.add(id)
        const file = langModule(id)
        const deps = [...fs.readFileSync(file, "utf8").matchAll(/^import \w+ from '\.\/([\w-]+)\.mjs'$/gm)].map((m) => m[1])
        todo.push(...deps)
        const grammar = (await import(pathToFileURL(file).href)).default.at(-1)
        this.emitFile({ type: "asset", fileName: `${SHIKI_LANG_DIR}/${id}.json`, source: JSON.stringify({ deps, grammar }) })
      }
    },
  }
}

/** The bootstrap (src/main.tsx) awaits the host handshake before importing the app chunk. Preloading the
 * chunk and its static imports lets the download overlap the handshake (it matters over Remote-SSH). */
function preloadApp(): Plugin {
  return {
    name: "oco:preload-app",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const app = r("./src/app.tsx")
        const entry = Object.values(bundle).find((c) => c.type === "chunk" && app in c.modules)
        if (!entry || entry.type !== "chunk") throw new Error("oco:preload-app: app chunk not found")
        const files = new Set<string>()
        const visit = (name: string) => {
          const c = bundle[name]
          if (!c || c.type !== "chunk" || files.has(name)) return
          files.add(name)
          c.imports.forEach(visit)
        }
        visit(entry.fileName)
        const css = [...files].flatMap((f) => [...((bundle[f] as { viteMetadata?: { importedCss: Set<string> } }).viteMetadata?.importedCss ?? [])])
        const links = [
          ...[...files].filter((f) => !html.includes(`/${f}"`)).map((f) => `<link rel="modulepreload" crossorigin href="./${f}">`),
          ...css.map((f) => `<link rel="stylesheet" crossorigin href="./${f}">`),
        ]
        return html.replace("</head>", `  ${links.join("\n  ")}\n</head>`)
      },
    },
  }
}

/** Webviews block cross-origin `<use href="…/sprite.svg#id">`. Inline the two icon sprites into the
 * document at runtime and make the components reference `#id` (build-time transform, vendor untouched). */
function inlineSprites(): Plugin {
  const target = /packages\/ui\/src\/components\/(provider-icon|file-icon)\.tsx$/
  return {
    name: "oco:inline-sprites",
    enforce: "pre",
    transform(code, id) {
      if (!target.test(id)) return
      return code.replace(
        /import sprite from "(\.\/[a-z-]+\/sprite\.svg)"/,
        (_m, file) =>
          `import __ocoSpriteRaw from "${file}?raw"\n` +
          `const sprite = (() => { if (typeof document !== "undefined") { const d = document.createElement("div"); ` +
          `d.style.display = "none"; d.innerHTML = __ocoSpriteRaw; document.body.prepend(d) } return "" })()`,
      )
    },
  }
}

export default defineConfig({
  root: r("."),
  base: "./",
  publicDir: r("../../vendor/opencode/packages/app/public"),
  plugins: [
    inlineSprites(),
    appPlugin,
    shikiLangAssets(),
    preloadApp(),
    // Workers inside a VS Code webview cannot fetch from the resource origin, so each worker is built
    // as one self-contained classic script; the host shim loads its text via the main thread.
    {
      name: "oco:worker-iife",
      config: () => ({ worker: { format: "iife" as const, plugins: () => [workerShiki()], rollupOptions: { output: { inlineDynamicImports: true } } } }),
    },
  ],
  resolve: {
    alias: {
      "@oco/contracts": r("../../packages/contracts/src/bridge.ts"),
      // Lazy-loaded by patches/opencode/0022 (markdown-mermaid.ts); an oco dependency, not an upstream one.
      mermaid: r("../../node_modules/mermaid/dist/mermaid.core.mjs"),
      // Before "@opencode-ai/app": aliases match by prefix and the first match wins.
      "@opencode-ai/app/i18n/desktop-native": r("../../vendor/opencode/packages/app/src/i18n/desktop-native.ts"),
      "@opencode-ai/app": r("../../vendor/opencode/packages/app/src/index.ts"),
    },
    dedupe: ["solid-js", "@solidjs/router"],
  },
  build: {
    outDir: r("../extension/media/chat"),
    emptyOutDir: true,
    target: "esnext",
    sourcemap: false,
    // The webview HTML is generated by the host from the built index.html.
    modulePreload: { polyfill: false },
  },
})
