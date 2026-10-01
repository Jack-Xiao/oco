// oco chat webview bootstrap: bridge handshake -> panel-scoped localStorage -> host theme -> official app.
// The app is imported only after the shim is in place, so no official module can read the shared
// native localStorage first.
import { connected, ui } from "./bridge"
import { installLocalStorage } from "./local-storage"
import { followHostTheme } from "./theme"

// Keep the static loading skeleton (index.html) over the app until #root shows text: the session, an error or the
// recovery view. Before that the app paints a logo splash while it checks the server, then an empty page until the
// session data arrives; over Remote-SSH that read as a black flash between two loading screens. The timeout bounds
// it for a page that never shows text.
// A new session has no text yet, so its composer counts too. The start-up health gate renders the unreachable view for
// a moment on every healthy start (recovery.tsx), so that view counts only once it has stayed UNREACHABLE_MS, as long
// as recovery.tsx waits before treating it as an outage. The host then lets the deferred provider list reach the
// server (bridge-core.ts DEFERRED). __OCO_STATS__.boot records why and when (tests).
const UNREACHABLE_MS = 1500 // recovery.tsx UNREACHABLE_MIN_MS
const skeleton = document.getElementById("oco-boot")
if (skeleton) {
  const root = document.getElementById("root")!
  const boot = ((window as any).__OCO_STATS__.boot = { reason: "", ms: 0, splash: false })
  let unreachableSince: number | undefined
  let recheck: ReturnType<typeof setTimeout> | undefined
  const done = (reason: string) => {
    if (boot.reason) return
    observer.disconnect()
    clearTimeout(timer)
    clearTimeout(recheck)
    Object.assign(boot, { reason, ms: Math.round(performance.now()) })
    ui("painted")
    // No fade: a transition needs frames, and right after its first content the page can be busy for a second.
    skeleton.remove()
  }
  const check = () => {
    boot.splash ||= !!root.querySelector('[data-component="logo-splash"]')
    if (root.querySelector('[data-oco-recovery="unreachable"]')) {
      unreachableSince ??= performance.now()
      const left = UNREACHABLE_MS - (performance.now() - unreachableSince)
      if (left <= 0) return done("unreachable")
      clearTimeout(recheck)
      recheck = setTimeout(check, left)
      return
    }
    unreachableSince = undefined
    if (root.textContent) done("text")
    else if (root.querySelector('[data-component="prompt-input"]')) done("composer")
  }
  const observer = new MutationObserver(check)
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  const timer = setTimeout(() => done("timeout"), 10_000)
}

await connected
await installLocalStorage()
followHostTheme((window as any).__OCO_INIT__?.colorScheme)
await import("./app")
