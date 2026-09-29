// Panel-scoped localStorage for the official app.
//
// On platform "web" the official persisted() keeps everything except drafts in window.localStorage
// (vendor/opencode/packages/app/src/utils/persist.ts:571-587), with a fixed "browser" window id, so
// every panel would share tabs/layout. This shim replaces window.localStorage with a synchronous
// in-memory Storage seeded from the host snapshot; writes go to the host, which namespaces them
// (panel / connection / ui) and persists them. Native webview localStorage is left untouched.
import { hostStorage, storeSnapshot } from "./bridge"

export const storageStats = { writes: 0, writeErrors: 0, migrated: 0 }

const PANEL_PREFIX = "opencode.window."

export async function installLocalStorage() {
  const host = hostStorage("localStorage")
  const map = new Map<string, string>(await storeSnapshot("localStorage"))

  // One-time P0 migration: copy non-panel opencode.* keys from native localStorage (kept as is).
  let native: Storage | undefined
  try {
    native = window.localStorage
  } catch {}
  if (native) {
    for (let i = 0; i < native.length; i++) {
      const k = native.key(i)
      if (!k || map.has(k) || k.startsWith(PANEL_PREFIX) || !(k.startsWith("opencode.") || /\.v\d+$/.test(k) || k === "language")) continue
      const v = native.getItem(k)
      if (v === null) continue
      map.set(k, v)
      storageStats.migrated++
      void host.setItem(k, v).catch(() => storageStats.writeErrors++)
    }
  }

  const write = (p: Promise<unknown>) => {
    storageStats.writes++
    p.catch((e) => {
      storageStats.writeErrors++
      console.warn("oco: storage write failed", e)
    })
  }
  const shim: Storage = {
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(String(k)) ?? null,
    setItem: (k, v) => {
      map.set(String(k), String(v))
      write(host.setItem(String(k), String(v)))
    },
    removeItem: (k) => {
      if (!map.delete(String(k))) return
      write(host.removeItem(String(k)))
    },
    clear: () => {
      for (const k of [...map.keys()]) write(host.removeItem(k))
      map.clear()
    },
  }
  Object.defineProperty(window, "localStorage", { value: shim, configurable: true })
}
