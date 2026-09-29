// oco chat webview bootstrap: bridge handshake -> panel-scoped localStorage -> official app.
// The app is imported only after the shim is in place, so no official module can read the shared
// native localStorage first.
import { connected } from "./bridge"
import { installLocalStorage } from "./local-storage"

await connected
await installLocalStorage()
await import("./app")
