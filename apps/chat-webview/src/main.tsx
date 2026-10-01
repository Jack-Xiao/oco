// oco chat webview bootstrap: bridge handshake -> panel-scoped localStorage -> host theme -> official app.
// The app is imported only after the shim is in place, so no official module can read the shared
// native localStorage first.
import { connected } from "./bridge"
import { installLocalStorage } from "./local-storage"
import { followHostTheme } from "./theme"

// Drop the static loading skeleton (index.html) as soon as anything renders into #root.
const skeleton = document.getElementById("oco-boot")
if (skeleton) {
  const root = document.getElementById("root")!
  const observer = new MutationObserver(() => {
    if (!root.firstElementChild) return
    observer.disconnect()
    skeleton.remove()
  })
  observer.observe(root, { childList: true })
}

await connected
await installLocalStorage()
followHostTheme((window as any).__OCO_INIT__?.colorScheme)
await import("./app")
