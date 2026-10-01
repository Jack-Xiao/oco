import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { findPackedApp, loaderScript } from "../../apps/extension/src/app-loader"

function chat(withGz: boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oco-loader-"))
  fs.mkdirSync(path.join(dir, "assets"))
  fs.writeFileSync(path.join(dir, "assets", "index-AbC_1.js"), 'import{a}from"./theme-X.js";import("./app-Q9-z.js")')
  fs.writeFileSync(path.join(dir, "assets", "app-Q9-z.js"), "x")
  if (withGz) fs.writeFileSync(path.join(dir, "assets", "app-Q9-z.js.gz"), "x")
  return dir
}
const html = '<script type="module" crossorigin src="./assets/index-AbC_1.js"></script>'

describe("app loader", () => {
  test("finds the app chunk behind the entry only when a .gz exists", () => {
    expect(findPackedApp(chat(true), html)).toEqual({ entry: "index-AbC_1.js", app: "app-Q9-z.js" })
    expect(findPackedApp(chat(false), html)).toBeUndefined()
    expect(findPackedApp(chat(true), "<html></html>")).toBeUndefined()
  })

  test("the page-side rewrite pins import.meta.url and relative dynamic imports to the resource origin", () => {
    const base = "https://r.example/x/"
    const src = loaderScript(base, "N", { entry: "index-AbC_1.js", app: "app-Q9-z.js" })
    expect(src).toContain('nonce="N"')
    const body = /\.text\(\);(t=t\.split.*?);const m=/.exec(src)![1]
    const A = `${base}assets/app-Q9-z.js`
    const D = `${base}assets/`
    let t = 'new URL("w.js",import.meta.url);import("./abap.js");import{a}from"./theme-X.js"'
    eval(body.replace(/^t=/, "t=") as string) // uses t, A, D from this scope
    expect(t).toBe(`new URL("w.js",${JSON.stringify(A)});import("${D}abap.js");import{a}from"${D}theme-X.js"`)
  })
})
