// Follow the VS Code colour theme. VS Code keeps the webview body's theme class / data attribute
// current; the official app reads its scheme from localStorage "opencode-color-scheme" at start and
// reacts to "storage" events for that key (vendor/opencode/packages/ui/src/theme/context.tsx:234-252),
// so a change is applied through that existing path. The in-app palette is the app's own light/dark
// palette, not the VS Code theme's colours.
const KEY = "opencode-color-scheme"

export type Scheme = "light" | "dark"

export function hostScheme(): Scheme | undefined {
  const b = document.body
  if (!b) return undefined
  const kind = b.dataset.vscodeThemeKind ?? b.className
  if (/(^|\s)vscode-(light|high-contrast-light)(\s|$)/.test(kind)) return "light"
  if (/(^|\s)vscode-(dark|high-contrast)(\s|$)/.test(kind)) return "dark"
  return undefined
}

export const themeStats = { applied: 0, switches: 0, current: undefined as Scheme | undefined }

/** Call after the localStorage shim is installed and before the app loads. */
export function followHostTheme(fallback?: Scheme) {
  const initial = hostScheme() ?? fallback
  if (initial) {
    localStorage.setItem(KEY, initial)
    themeStats.applied++
    themeStats.current = initial
  }
  new MutationObserver(() => {
    const next = hostScheme()
    if (!next || next === themeStats.current) return
    themeStats.current = next
    themeStats.switches++
    localStorage.setItem(KEY, next)
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: next }))
  }).observe(document.body, { attributes: true, attributeFilter: ["class", "data-vscode-theme-kind"] })
}
